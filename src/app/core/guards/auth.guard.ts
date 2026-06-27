import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { UserRole } from '../models/auth.models';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const expectedRole = route.data['role'] as UserRole | undefined;
  const user = auth.user;

  if (!user) return router.createUrlTree(['/login']);
  if (expectedRole && user.role !== expectedRole) {
    return router.createUrlTree([user.role === 'admin' ? '/admin' : '/assistant']);
  }
  return true;
};
