import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { timeout } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

type LoginResponse = {
  token?: string;
  message?: string;
};

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class Login {
  email: string = '';
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

    const payload = {
      username: this.email,
      email: this.email,
      password: this.password
    };

    this.http
      .post<LoginResponse>(this.loginApiUrl, payload)
      .pipe(
        timeout(10000),
        finalize(() => (this.isLoading = false))
      )
      .subscribe({
        next: (response) => {
          const token = response?.token ?? '';
          if (token) {
            localStorage.setItem('authToken', token);
          }
          this.successMessage = response?.message || 'Login successful.';
          this.router.navigate(['/dashboard']);
        },
        error: (error) => {
          console.error('Login API error:', error);
          const status = error?.status ? ` (HTTP ${error.status})` : '';
          const rawError =
            typeof error?.error === 'string' ? error.error : '';
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
              'Cannot reach API (status 0). Confirm API is running and proxy target/HTTPS port is correct.';
          }

          this.debugMessage = `POST ${this.loginApiUrl}`;
        }
      });
  }
}