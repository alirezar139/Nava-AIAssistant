import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { ErrorMessageService } from '../../../core/services/error-message.service';

@Component({
  selector: 'app-profile-edit',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile-edit.component.html',
  styleUrl: './profile-edit.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProfileEditComponent {
  fullName = this.auth.user?.fullName ?? '';
  password = '';
  saving = false;
  message = '';
  error = '';

  constructor(
    private readonly auth: AuthService,
    private readonly errorMessages: ErrorMessageService,
    private readonly changeDetector: ChangeDetectorRef
  ) {}

  save(): void {
    const fullName = this.fullName.trim();
    if (!fullName) {
      this.error = 'نام کامل را وارد کنید.';
      this.message = '';
      return;
    }
    const password = this.password.trim();
    if (password && password.length < 6) {
      this.error = 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد.';
      this.message = '';
      return;
    }

    this.saving = true;
    this.error = '';
    this.message = '';
    this.auth.updateProfile(fullName, password || undefined).subscribe({
      next: () => {
        this.saving = false;
        this.password = '';
        this.message = 'تغییرات ذخیره شد.';
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        this.saving = false;
        const resolved = this.errorMessages.resolve(error, 'ذخیره تغییرات ممکن نشد.');
        this.error = this.errorMessages.formatMessage(resolved);
        this.changeDetector.markForCheck();
      }
    });
  }
}
