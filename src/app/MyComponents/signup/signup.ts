import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { timeout } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

type SignupPayload = {
  username?: string;
  userName?: string;
  Username?: string;
  password?: string;
  Password?: string;
};

type SignupResponse = {
  message?: string;
};

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './signup.html',
  styleUrls: ['./signup.css']
})
export class Signup {
  username = '';
  password = '';

  isLoading = false;
  errorMessage = '';
  successMessage = '';
  debugMessage = '';

  private readonly signupApiUrl = `${environment.apiBaseUrl}${environment.signupEndpoint}`;

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router
  ) {}

  onSubmit(): void {
    this.errorMessage = '';
    this.successMessage = '';
    this.debugMessage = '';
    this.isLoading = true;

    const normalizedUsername = this.username.trim();
    const payloadCandidates: SignupPayload[] = [
      { username: normalizedUsername, password: this.password },
      { userName: normalizedUsername, password: this.password },
      { Username: normalizedUsername, Password: this.password }
    ];

    this.trySignup(payloadCandidates, 0);
  }

  private trySignup(payloadCandidates: SignupPayload[], index: number): void {
    this.http
      .post(this.signupApiUrl, payloadCandidates[index], { responseType: 'text' })
      .pipe(timeout(10000))
      .subscribe({
        next: (response) => {
          this.isLoading = false;
          const responseText = typeof response === 'string' ? response.trim() : '';
          this.successMessage = responseText || 'Signup successful. You can login now.';
          this.router.navigate(['/login']);
        },
        error: (error) => {
          const canRetryWithAnotherPayload =
            index < payloadCandidates.length - 1 &&
            (error?.status === 400 || error?.status === 415 || error?.status === 422 || error?.status === 500);

          if (canRetryWithAnotherPayload) {
            this.trySignup(payloadCandidates, index + 1);
            return;
          }

          this.isLoading = false;
          const status = error?.status ? ` (HTTP ${error.status})` : '';
          const backendMessage =
            error?.error?.message ||
            error?.error?.title ||
            error?.error?.error ||
            (typeof error?.error === 'string' ? error.error : '');

          const rawErrorBody =
            typeof error?.error === 'string'
              ? error.error
              : error?.error
                ? JSON.stringify(error.error)
                : '';
          const errorBlob = rawErrorBody.toLowerCase();

          this.errorMessage = backendMessage || `Signup failed${status}. Please try again.`;

          if (error?.name === 'TimeoutError') {
            this.errorMessage = 'Signup request timed out after 10s. Check if API is reachable.';
          } else if (error?.status === 0) {
            this.errorMessage =
              'Cannot reach API (status 0). Confirm API is running and the dev proxy target is correct.';
          } else if (
            (error?.status === 500 || error?.status === 502 || error?.status === 503) &&
            (errorBlob.includes('econnrefused') ||
              errorBlob.includes('connection refused') ||
              errorBlob.includes('actively refused') ||
              errorBlob.includes('proxy error') ||
              errorBlob.includes('localhost:5230'))
          ) {
            this.errorMessage =
              'Backend API is not running on http://localhost:5230. Start backend first, then retry signup.';
          } else if (error?.status === 500 && rawErrorBody) {
            this.errorMessage = `Signup failed (HTTP 500). ${rawErrorBody}`;
          }

          this.debugMessage = `POST ${this.signupApiUrl}`;
        }
      });
  }
}
