import { Routes } from '@angular/router';
import { Login } from './MyComponents/login/login';
import { Dashboard } from './MyComponents/dashboard/dashboard';
import { Signup } from './MyComponents/signup/signup';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', component: Login },
  { path: 'signup', component: Signup },
  { path: 'dashboard', component: Dashboard },
  { path: '**', redirectTo: 'login' }
];
