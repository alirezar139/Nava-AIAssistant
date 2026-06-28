import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { AuthSession, AuthUser, CaptchaChallenge } from '../models/auth.models';
import { environment } from '../../../environments/environment';
import { SessionService } from './session.service';
import { ThemeService } from './theme.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apiUrl = `${environment.apiUrl}/auth`;

  constructor(
    private readonly http: HttpClient,
    private readonly sessionService: SessionService,
    private readonly themeService: ThemeService
  ) {}

  get session(): AuthSession | null {
    return this.sessionService.session;
  }

  get user(): AuthUser | null {
    return this.sessionService.user;
  }

  getCaptcha(): Observable<CaptchaChallenge> {
    return this.http.get<CaptchaChallenge>(`${this.apiUrl}/captcha`);
  }

  login(
    username: string,
    password: string,
    captchaToken: string,
    captchaAnswer: string
  ): Observable<AuthSession> {
    return this.http
      .post<AuthSession>(`${this.apiUrl}/login`, { username, password, captchaToken, captchaAnswer })
      .pipe(
        tap((session) => {
          this.sessionService.save(session);
          sessionStorage.removeItem(`nava-welcome-seen:${session.user.username}`);
          this.themeService.activateUser(session.user.username);
        })
      );
  }

  logout(): void {
    this.sessionService.clear();
    this.themeService.activateUser(null);
  }
}
