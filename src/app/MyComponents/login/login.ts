import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { timeout } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

type LoginResponse = {
  token?: string;
  jwtToken?: string;
  accessToken?: string;
  message?: string;
};

type LoginPayload = {
  username?: string;
  userName?: string;
  Username?: string;
  password?: string;
  Password?: string;
};

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule, RouterLink],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class Login {
  username: string = '';
  password: string = '';
  isLoading: boolean = false;
  errorMessage: string = '';
  successMessage: string = '';
  debugMessage: string = '';

  private readonly loginApiUrl = `${environment.apiBaseUrl}${environment.loginEndpoint}`;

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router
  ) {}

  onSubmit() {
    this.errorMessage = '';
    this.successMessage = '';
    this.debugMessage = '';
    this.isLoading = true;

    const normalizedUser = this.username.trim();
    const payloadCandidates: LoginPayload[] = [
      { username: normalizedUser, password: this.password },
      { userName: normalizedUser, password: this.password },
      { Username: normalizedUser, Password: this.password }
    ];

    this.tryLogin(payloadCandidates, 0);
  }

  private tryLogin(payloadCandidates: LoginPayload[], index: number): void {
    this.http
      .post<LoginResponse>(this.loginApiUrl, payloadCandidates[index])
      .pipe(timeout(10000))
      .subscribe({
        next: (response) => {
          this.isLoading = false;
          const token =
            response?.token ??
            response?.jwtToken ??
            response?.accessToken ??
            '';
          if (token) {
            localStorage.setItem('authToken', token);
          }
          this.successMessage = response?.message || 'Login successful.';
          this.router.navigate(['/dashboard']);
        },
        error: (error) => {
          const canRetryWithAnotherPayload =
            index < payloadCandidates.length - 1 &&
            (error?.status === 400 || error?.status === 500 || error?.status === 415 || error?.status === 422);

          if (canRetryWithAnotherPayload) {
            this.tryLogin(payloadCandidates, index + 1);
            return;
          }

          this.isLoading = false;
          console.error('Login API error:', error);
          const status = error?.status ? ` (HTTP ${error.status})` : '';
          const rawError = typeof error?.error === 'string' ? error.error : '';
          const errorBlob = JSON.stringify(error?.error ?? '').toLowerCase();
          const backendMessage =
            error?.error?.message ||
            error?.error?.title ||
            error?.error?.error ||
            rawError ||
            '';
          this.errorMessage =
            backendMessage ||
            `Login failed${status}. Check API URL, CORS, or credentials.`;

          if (error?.name === 'TimeoutError') {
            this.errorMessage =
              'Login request timed out after 10s. Check if API is reachable.';
          } else if (error?.status === 0) {
            this.errorMessage =
              'Cannot reach API (status 0). Confirm API is running and the dev proxy target is correct.';
          } else if (
            (error?.status === 500 || error?.status === 502 || error?.status === 503) &&
            (rawError.toLowerCase().includes('econnrefused') ||
              rawError.toLowerCase().includes('connection refused') ||
              rawError.toLowerCase().includes('actively refused') ||
              rawError.toLowerCase().includes('proxy error') ||
              errorBlob.includes('econnrefused') ||
              errorBlob.includes('connection refused') ||
              errorBlob.includes('actively refused') ||
              errorBlob.includes('proxy error') ||
              errorBlob.includes(this.loginApiUrl.toLowerCase()))
          ) {
            this.errorMessage =
              `Backend API is not reachable at ${environment.apiBaseUrl}. Start backend first, then retry login.`;
          } else if (error?.status === 500 && rawError) {
            this.errorMessage = `Login failed (HTTP 500). ${rawError}`;
          } else if (error?.status === 500 && !backendMessage) {
            this.errorMessage =
              'Server error during login (HTTP 500). Check backend logs for /api/Auth/login.';
          }

          this.debugMessage = `POST ${this.loginApiUrl}`;
        }
      });
  }
}