import { Request } from 'express';

export type UserRole = 'admin' | 'user' | 'developer';

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  role: UserRole;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}
