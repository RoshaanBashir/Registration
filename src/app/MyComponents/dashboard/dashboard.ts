import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { finalize, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';

type RegistrationForm = {
  id: string;
  title: string;
  name: string;
  username: string;
  email: string;
  password: string;
  addressLine1: string;
  addressLine2: string;
  zipcode: string;
  city: string;
  state: string;
  isSaved: boolean;
  isEditing: boolean;
  savedAt?: string;
  updatedAt?: string;
  isSubmitting?: boolean;
};

const STORAGE_KEY = 'registration_dashboard_forms';
type SaveFormResponse = {
  id?: string | number;
  message?: string;
};
type RegistrationFormApiDto = {
  id?: string | number;
  title?: string;
  label?: string;
  name?: string;
  fullName?: string;
  username?: string;
  email?: string;
  password?: string;
  addressLine1?: string;
  addressLine2?: string;
  zipcode?: string;
  city?: string;
  state?: string;
  savedAt?: string;
  updatedAt?: string;
  infoSaved?: boolean;
  lastLoginAt?: string;
};
type RegistrationFormPayload = {
  fullName: string;
  username: string;
  email: string;
  password: string;
  addressLine1: string;
  addressLine2: string;
  zipcode: string;
  city: string;
  state: string;
  infoSaved: boolean;
  lastLoginAt: string;
};

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css']
})
export class Dashboard implements OnInit {
  forms: RegistrationForm[] = [];
  toastMessage = '';
  toastType: 'success' | 'error' = 'success';
  isSyncing = false;
  lastSyncedAt = '';
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly autoSaveDelayMs = 900;
  private readonly maxSyncRetries = 3;
  private readonly autoSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private readonly saveFormApiUrl = `${environment.apiBaseUrl}${environment.saveFormEndpoint}`;
  private readonly updateFormApiUrl = `${environment.apiBaseUrl}${environment.updateFormEndpoint}`;
  private readonly getFormsApiUrl = `${environment.apiBaseUrl}${environment.getFormsEndpoint}`;
  private readonly deleteFormApiUrl = `${environment.apiBaseUrl}${environment.deleteFormEndpoint}`;

  constructor(
    private readonly router: Router,
    private readonly http: HttpClient
  ) {}

  ngOnInit(): void {
    this.loadForms();
    this.loadFormsFromApi();
    if (this.forms.length === 0) {
      this.forms = [this.createEmptyForm(0), this.createEmptyForm(1)];
      this.persistForms();
    }
  }

  addForm(): void {
    this.forms.push(this.createEmptyForm(this.forms.length));
    this.persistForms();
    this.showToast('New registration form added.', 'success');
  }

  removeForm(index: number): void {
    if (this.forms.length <= 1) {
      this.showToast('At least one form is required.', 'error');
      return;
    }
    const form = this.forms[index];
    this.clearAutoSaveTimer(form.id);
    const requestOptions = this.buildAuthorizedRequestOptions();

    if (form.isSaved && requestOptions) {
      form.isSubmitting = true;
      this.http
        .delete(`${this.deleteFormApiUrl}/${encodeURIComponent(form.id)}`, {
          ...requestOptions,
          responseType: 'text'
        })
        .pipe(
          timeout(10000),
          finalize(() => {
            form.isSubmitting = false;
          })
        )
        .subscribe({
          next: (response) => {
            this.forms.splice(index, 1);
            this.persistForms();
            const message = this.extractSuccessMessage(response, 'Form removed from database.');
            this.showToast(message, 'success');
            this.scheduleServerSyncWithRetry();
          },
          error: (error) => {
            this.handleApiError(error, 'Failed to remove form from database.');
          }
        });
      return;
    }

    this.forms.splice(index, 1);
    this.persistForms();
    this.showToast('Unsaved form removed.', 'success');
  }

  deleteFromDatabase(index: number): void {
    const form = this.forms[index];
    if (!form || form.isSubmitting) return;
    this.clearAutoSaveTimer(form.id);

    const requestOptions = this.buildAuthorizedRequestOptions();
    if (!requestOptions) return;

    form.isSubmitting = true;
    this.http
      .delete(`${this.deleteFormApiUrl}/${encodeURIComponent(form.id)}`, {
        ...requestOptions,
        responseType: 'text'
      })
      .pipe(
        timeout(10000),
        finalize(() => {
          form.isSubmitting = false;
        })
      )
      .subscribe({
        next: (response) => {
          this.forms.splice(index, 1);
          this.persistForms();
          const message = this.extractSuccessMessage(response, 'Form deleted from database.');
          this.showToast(message, 'success');
          this.scheduleServerSyncWithRetry();
        },
        error: (error) => {
          this.handleApiError(error, 'Failed to delete form from database.');
        }
      });
  }

  saveForm(index: number): void {
    const form = this.forms[index];
    if (form.isSubmitting) return;
    if (!this.hasRequiredFields(form)) {
      this.showToast('Please fill all required fields before saving.', 'error');
      return;
    }
    const requestOptions = this.buildAuthorizedRequestOptions();
    if (!requestOptions) return;
    const payload = this.toSavePayload(form);

    form.isSubmitting = true;
    this.http
      .post(this.saveFormApiUrl, payload, {
        ...requestOptions,
        responseType: 'text'
      })
      .pipe(
        timeout(10000),
        finalize(() => {
          form.isSubmitting = false;
        })
      )
      .subscribe({
        next: (response) => {
          form.isSaved = true;
          form.isEditing = false;
          form.savedAt = new Date().toLocaleString();
          this.persistForms();
          const message = this.extractSuccessMessage(response, `${form.title} saved to database.`);
          this.showToast(message, 'success');
          this.scheduleServerSyncWithRetry();
        },
        error: (error) => {
          this.handleApiError(error, 'Failed to save form to database.');
        }
      });
  }

  enableEdit(index: number): void {
    this.forms[index].isEditing = true;
  }

  updateForm(index: number): void {
    const form = this.forms[index];
    if (form.isSubmitting) return;
    if (!this.hasRequiredFields(form)) {
      this.showToast('Please fill all required fields before updating.', 'error');
      return;
    }
    const requestOptions = this.buildAuthorizedRequestOptions();
    if (!requestOptions) return;
    const payload = this.toSavePayload(form);

    form.isSubmitting = true;
    this.http
      .put(
        `${this.updateFormApiUrl}/${encodeURIComponent(form.id)}`,
        payload,
        {
          ...requestOptions,
          responseType: 'text'
        }
      )
      .pipe(
        timeout(10000),
        finalize(() => {
          form.isSubmitting = false;
        })
      )
      .subscribe({
        next: (response) => {
          form.isSaved = true;
          form.isEditing = false;
          form.updatedAt = new Date().toLocaleString();
          this.persistForms();
          const message = this.extractSuccessMessage(response, `${form.title} updated in database.`);
          this.showToast(message, 'success');
          this.scheduleServerSyncWithRetry();
        },
        error: (error) => {
          this.handleApiError(error, 'Failed to update form in database.');
        }
      });
  }

  clearForm(index: number): void {
    const existing = this.forms[index];
    this.clearAutoSaveTimer(existing.id);
    this.forms[index] = {
      ...this.createEmptyForm(index),
      id: existing.id,
      title: existing.title
    };
    this.persistForms();
    this.showToast('Form cleared.', 'success');
  }

  onFormChange(index: number): void {
    this.persistForms();
    const form = this.forms[index];
    if (!form) return;
    if (form.isSaved && !form.isEditing) {
      form.isEditing = true;
    }
    this.scheduleAutoSave(form.id);
  }

  get savedFormsCount(): number {
    return this.forms.filter((form) => form.isSaved).length;
  }

  signOut(): void {
    if (this.canUseLocalStorage()) {
      localStorage.removeItem('authToken');
    }
    this.router.navigate(['/login']);
  }

  private hasRequiredFields(form: RegistrationForm): boolean {
    return Boolean(
      form.name.trim() &&
        form.username.trim() &&
        form.email.trim() &&
        form.password.trim() &&
        form.addressLine1.trim() &&
        form.city.trim() &&
        form.state.trim() &&
        form.zipcode.trim()
    );
  }

  private loadForms(): void {
    if (!this.canUseLocalStorage()) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as RegistrationForm[];
      if (!Array.isArray(parsed)) return;
      this.forms = parsed.map((form, index) => ({
        ...this.createEmptyForm(index),
        ...form
      }));
    } catch {
      this.forms = [];
    }
  }

  private loadFormsFromApi(onSuccess?: () => void, onError?: () => void): void {
    this.isSyncing = true;
    const requestOptions = this.buildAuthorizedRequestOptions(false);
    if (!requestOptions) {
      this.isSyncing = false;
      onError?.();
      return;
    }

    this.http
      .get<RegistrationFormApiDto[]>(this.getFormsApiUrl, requestOptions)
      .pipe(timeout(10000))
      .subscribe({
        next: (records) => {
          const safeRecords = Array.isArray(records) ? records : [];
          const serverForms = safeRecords.map((record, index) => this.fromApiRecord(record, index));
          const localUnsavedDrafts = this.forms.filter(
            (form) => !form.isSaved && !this.isServerPersistedId(form.id)
          );

          setTimeout(() => {
            this.forms = [...serverForms, ...localUnsavedDrafts];
            if (this.forms.length === 0) {
              this.forms = [this.createEmptyForm(0)];
            }
            this.persistForms();
            this.lastSyncedAt = new Date().toLocaleTimeString();
            this.isSyncing = false;
            onSuccess?.();
          });
        },
        error: () => {
          this.isSyncing = false;
          onError?.();
          // Keep local cache when API fetch fails; no blocking toast needed.
        }
      });
  }

  private persistForms(): void {
    if (!this.canUseLocalStorage()) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.forms));
  }

  private createEmptyForm(index: number): RegistrationForm {
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return {
      id,
      title: `Registration Form ${index + 1}`,
      name: '',
      username: '',
      email: '',
      password: '',
      addressLine1: '',
      addressLine2: '',
      zipcode: '',
      city: '',
      state: '',
      isSaved: false,
      isEditing: false,
      isSubmitting: false,
      savedAt: undefined,
      updatedAt: undefined
    };
  }

  private canUseLocalStorage(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  }

  private showToast(message: string, type: 'success' | 'error'): void {
    this.toastMessage = message;
    this.toastType = type;
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
    this.toastTimer = setTimeout(() => {
      this.toastMessage = '';
      this.toastTimer = null;
    }, 2500);
  }

  private scheduleAutoSave(formId: string): void {
    this.clearAutoSaveTimer(formId);
    const timer = setTimeout(() => {
      const index = this.forms.findIndex((f) => f.id === formId);
      if (index === -1) return;
      this.autoSaveForm(index);
    }, this.autoSaveDelayMs);
    this.autoSaveTimers.set(formId, timer);
  }

  private clearAutoSaveTimer(formId: string): void {
    const timer = this.autoSaveTimers.get(formId);
    if (!timer) return;
    clearTimeout(timer);
    this.autoSaveTimers.delete(formId);
  }

  private autoSaveForm(index: number): void {
    const form = this.forms[index];
    if (!form || form.isSubmitting || !this.hasRequiredFields(form)) return;
    if (form.isSaved) {
      this.updateForm(index);
      return;
    }
    this.saveForm(index);
  }

  private toSavePayload(form: RegistrationForm): RegistrationFormPayload {
    return {
      fullName: form.name.trim(),
      username: form.username.trim(),
      email: form.email.trim(),
      password: form.password,
      addressLine1: form.addressLine1.trim(),
      addressLine2: form.addressLine2.trim(),
      zipcode: form.zipcode.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      infoSaved: true,
      lastLoginAt: new Date().toISOString()
    };
  }

  private buildAuthorizedRequestOptions(showMessage = true): { headers: HttpHeaders } | null {
    if (!this.canUseLocalStorage()) return null;
    const token = localStorage.getItem('authToken');
    if (!token) {
      if (showMessage) {
        this.showToast('Session expired. Please login again.', 'error');
        this.router.navigate(['/login']);
      }
      return null;
    }

    return {
      headers: new HttpHeaders({
        Authorization: `Bearer ${token}`
      })
    };
  }

  private handleApiError(error: any, fallbackMessage: string): void {
    const backendMessage =
      error?.error?.message ||
      error?.error?.title ||
      error?.error?.error ||
      (typeof error?.error === 'string' ? error.error : '');

    if (error?.status === 401 || error?.status === 403) {
      this.showToast('Session expired. Please login again.', 'error');
      this.signOut();
      return;
    }

    if (error?.name === 'TimeoutError') {
      this.showToast('Request timed out. Check if backend API is running.', 'error');
      return;
    }

    if (error?.status === 0) {
      this.showToast('Cannot reach backend API. Start API and retry.', 'error');
      return;
    }

    this.showToast(backendMessage || fallbackMessage, 'error');
  }

  private extractSuccessMessage(response: unknown, fallback: string): string {
    if (typeof response === 'string') {
      const message = response.trim();
      return message || fallback;
    }
    const parsed = response as SaveFormResponse | null;
    if (parsed?.message) return parsed.message;
    return fallback;
  }

  private isServerPersistedId(id: string): boolean {
    return /^\d+$/.test(id);
  }

  private scheduleServerSyncWithRetry(attempt = 0): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }
    this.syncTimer = setTimeout(() => {
      this.loadFormsFromApi(
        () => {
          this.syncTimer = null;
        },
        () => {
          if (attempt < this.maxSyncRetries) {
            this.scheduleServerSyncWithRetry(attempt + 1);
            return;
          }
          this.syncTimer = null;
        }
      );
    }, 600 + attempt * 600);
  }

  private fromApiRecord(record: RegistrationFormApiDto, index: number): RegistrationForm {
    const empty = this.createEmptyForm(index);
    return {
      ...empty,
      id: record.id != null ? String(record.id) : empty.id,
      title: record.title || record.label || empty.title,
      name: record.fullName || record.name || '',
      username: record.username || '',
      email: record.email || '',
      password: record.password || '',
      addressLine1: record.addressLine1 || '',
      addressLine2: record.addressLine2 || '',
      zipcode: record.zipcode || '',
      city: record.city || '',
      state: record.state || '',
      isSaved: record.infoSaved ?? true,
      isEditing: false,
      isSubmitting: false,
      savedAt: record.savedAt || new Date().toLocaleString(),
      updatedAt: record.updatedAt
    };
  }
}
