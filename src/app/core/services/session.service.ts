import { Injectable } from '@angular/core';
import { AuthSession, AuthUser } from '../models/auth.models';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly storageKey = 'nava-session';

  get session(): AuthSession | null {
    try {
      const value = sessionStorage.getItem(this.storageKey);
      return value ? (JSON.parse(value) as AuthSession) : null;
    } catch {
      this.clear();
      return null;
    }
  }

  get user(): AuthUser | null {
    return this.session?.user ?? null;
  }

  save(session: AuthSession): void {
    sessionStorage.setItem(this.storageKey, JSON.stringify(session));
  }

  clear(): void {
    sessionStorage.removeItem(this.storageKey);
  }
}
