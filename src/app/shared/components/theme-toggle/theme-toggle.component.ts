import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, HostListener, Input } from '@angular/core';
import { ThemePalette, ThemeService } from '../../../core/services/theme.service';

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './theme-toggle.component.html',
  styleUrl: './theme-toggle.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ThemeToggleComponent {
  @Input() customizable = true;

  readonly maxProfileImageSize = 1_500_000;
  readonly paletteOptions: Array<{ id: ThemePalette; label: string }> = [
    { id: 'jade', label: 'یشمی' },
    { id: 'ocean', label: 'اقیانوسی' },
    { id: 'violet', label: 'بنفش' },
    { id: 'graphite', label: 'خنثی' },
    { id: 'amber', label: 'کهربایی' },
    { id: 'rose', label: 'رز' },
    { id: 'cobalt', label: 'کبالت' },
    { id: 'paint', label: 'Paint' }
  ];

  settingsOpen = false;
  profileImageError = '';

  constructor(
    readonly theme: ThemeService,
    private readonly elementRef: ElementRef<HTMLElement>
  ) {}

  @HostListener('document:click', ['$event'])
  closeOnOutsideClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) this.settingsOpen = false;
  }

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    this.settingsOpen = false;
  }

  toggleSettings(): void {
    if (!this.customizable) return;
    this.settingsOpen = !this.settingsOpen;
  }

  selectPalette(palette: ThemePalette): void {
    this.theme.setPalette(palette);
  }

  setPaintColor(color: string): void {
    this.theme.setPaintColor(color);
  }

  onProfileImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    this.profileImageError = '';

    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.profileImageError = 'فقط فایل تصویر قابل انتخاب است.';
      return;
    }
    if (file.size > this.maxProfileImageSize) {
      this.profileImageError = 'حجم تصویر باید کمتر از ۱.۵ مگابایت باشد.';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => this.theme.setProfileImage(String(reader.result));
    reader.onerror = () => {
      this.profileImageError = 'تصویر خوانده نشد. یک فایل دیگر انتخاب کنید.';
    };
    reader.readAsDataURL(file);
  }

  clearProfileImage(): void {
    this.profileImageError = '';
    this.theme.clearProfileImage();
  }
}
