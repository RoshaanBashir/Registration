import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css']
})
export class Dashboard {
  name: string = '';
  username: string = '';
  email: string = '';
  password: string = '';
  addressLine1: string = '';
  addressLine2: string = '';
  zipcode: string = '';
  city: string = '';
  state: string = '';

  constructor(private readonly router: Router) {}

  signOut() {
    localStorage.removeItem('authToken');
    this.router.navigate(['/login']);
  }
}
