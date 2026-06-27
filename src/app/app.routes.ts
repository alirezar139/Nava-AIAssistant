import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const appRoutes: Routes = [
  {
    path: 'login',
    title: 'Nava | Login',
    loadComponent: () =>
      import('./features/auth/pages/login/login.component').then((component) => component.LoginComponent)
  },
  {
    path: 'assistant',
    title: 'Nava Assistant',
    canActivate: [authGuard],
    data: { role: 'user' },
    loadComponent: () =>
      import('./features/assistant/pages/assistant-page/assistant-page.component').then(
        (component) => component.AssistantPageComponent
      )
  },
  {
    path: 'admin',
    title: 'Nava Admin',
    canActivate: [authGuard],
    data: { role: 'admin' },
    loadComponent: () =>
      import('./features/admin/pages/admin-dashboard/admin-dashboard.component').then(
        (component) => component.AdminDashboardComponent
      )
  },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: '**', redirectTo: 'login' }
];
