export type UserRole = 'admin' | 'user';

export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  role: UserRole;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

export interface CaptchaChallenge {
  token: string;
  image: string;
}
