import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';
import { ErrorMessageService } from '../../../../core/services/error-message.service';
import { ThemeToggleComponent } from '../../../../shared/components/theme-toggle/theme-toggle.component';
import { BrandLogoComponent } from '../../../../shared/components/brand-logo/brand-logo.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, ThemeToggleComponent, BrandLogoComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent {
  username = '';
  password = '';
  captchaAnswer = '';
  captchaToken = '';
  captchaImage = '';
  error = '';
  loading = false;
  showPassword = false;
  capsLockOn = false;

  constructor(
    private readonly auth: AuthService,
    private readonly errorMessages: ErrorMessageService,
    private readonly router: Router,
    private readonly changeDetector: ChangeDetectorRef
  ) {
    this.refreshCaptcha();
    const user = this.auth.user;
    if (user) void this.router.navigateByUrl(user.role === 'admin' ? '/admin' : '/assistant');
  }

  login(): void {
    if (!this.username.trim() || !this.password || !this.captchaAnswer.trim()) {
      this.error = 'نام کاربری، رمز عبور و کد امنیتی را وارد کنید.';
      return;
    }
    this.loading = true;
    this.error = '';
    this.auth
      .login(this.username.trim(), this.password, this.captchaToken, this.captchaAnswer.trim())
      .pipe(
        finalize(() => {
          this.loading = false;
          this.changeDetector.markForCheck();
        })
      )
      .subscribe({
        next: ({ user }) => void this.router.navigateByUrl(user.role === 'admin' ? '/admin' : '/assistant'),
        error: (error: HttpErrorResponse) => {
          const resolved = this.errorMessages.resolve(error, 'ورود به سامانه انجام نشد.');
          this.error = this.errorMessages.formatMessage(resolved);
          this.captchaAnswer = '';
          this.refreshCaptcha();
        }
      });
  }

  useDemoAccount(role: 'admin' | 'user'): void {
    const account =
      role === 'admin'
        ? { username: 'admin', password: 'Admin@123' }
        : { username: 'user', password: 'User@123' };
    this.username = account.username;
    this.password = account.password;
    this.captchaAnswer = '';
    this.clearError();
    this.refreshCaptcha();
  }

  clearError(): void {
    if (!this.error) return;
    this.error = '';
    this.changeDetector.markForCheck();
  }

  refreshCaptcha(): void {
    this.auth.getCaptcha().subscribe({
      next: (captcha) => {
        this.captchaToken = captcha.token;
        this.captchaImage = captcha.image;
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        const resolved = this.errorMessages.resolve(error, 'دریافت کد امنیتی ممکن نبود.');
        this.error = this.errorMessages.formatMessage(resolved);
        this.changeDetector.markForCheck();
      }
    });
  }

  updateCapsLock(event: KeyboardEvent): void {
    this.capsLockOn = event.getModifierState('CapsLock');
  }
}
