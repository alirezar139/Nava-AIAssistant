import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, HostListener } from '@angular/core';
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
  settingsOpen = false;

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

  selectPalette(palette: ThemePalette): void {
    this.theme.setPalette(palette);
  }
}
