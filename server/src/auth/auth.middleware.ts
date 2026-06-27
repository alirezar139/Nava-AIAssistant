import { NextFunction, Response } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest, AuthUser, UserRole } from '../common/types.js';
import { config } from '../config/config.js';
import { sendError } from '../common/api-error.js';

export function signToken(user: AuthUser): string {
  return jwt.sign(user, config.jwtSecret, { expiresIn: '8h' });
}

export function requireAuth(roles?: UserRole[]) {
  return (request: AuthRequest, response: Response, next: NextFunction): void => {
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) {
      sendError(response, 401, 'AUTH_REQUIRED', 'ورود به حساب کاربری الزامی است.');
      return;
    }

    try {
      const user = jwt.verify(token, config.jwtSecret) as AuthUser;
      if (roles && !roles.includes(user.role)) {
        sendError(response, 403, 'ACCESS_DENIED', 'برای انجام این عملیات دسترسی کافی ندارید.');
        return;
      }
      request.user = user;
      next();
    } catch {
      sendError(response, 401, 'SESSION_INVALID', 'نشست کاربری منقضی یا نامعتبر است.');
    }
  };
}
