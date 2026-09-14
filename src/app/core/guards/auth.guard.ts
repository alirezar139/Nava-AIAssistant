import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { UserRole } from '../models/auth.models';
import { AuthService } from '../services/auth.service';

function homeRouteFor(role: UserRole): string {
  return role === 'admin' || role === 'developer' ? '/admin' : '/assistant';
}

export const authGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const allowedRoles = route.data['roles'] as UserRole[] | undefined;
  const user = auth.user;

  if (!user) return router.createUrlTree(['/login']);
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return router.createUrlTree([homeRouteFor(user.role)]);
  }
  return true;
};
