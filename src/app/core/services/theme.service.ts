import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';

export type ColorTheme = 'light' | 'dark';
export type ThemePalette = 'jade' | 'ocean' | 'violet' | 'graphite';

interface ThemePreferences {
  mode: ColorTheme;
  palette: ThemePalette;
  highContrast: boolean;
  motion: boolean;
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storagePrefix = 'nava-theme';
  private activeUser = this.resolveSessionUsername();
  private preferences: ThemePreferences;

  constructor(@Inject(DOCUMENT) private readonly document: Document) {
    this.preferences = this.loadPreferences();
    this.apply();
  }

  get isDark(): boolean {
    return this.preferences.mode === 'dark';
  }

  get palette(): ThemePalette {
    return this.preferences.palette;
  }

  get highContrast(): boolean {
    return this.preferences.highContrast;
  }

  get motionEnabled(): boolean {
    return this.preferences.motion;
  }

  toggle(): void {
    this.update({ mode: this.isDark ? 'light' : 'dark' });
  }

  setPalette(palette: ThemePalette): void {
    this.update({ palette });
  }

  setHighContrast(highContrast: boolean): void {
    this.update({ highContrast });
  }

  setMotion(motion: boolean): void {
    this.update({ motion });
  }

  activateUser(username: string | null): void {
    this.activeUser = username?.trim() || 'guest';
    this.preferences = this.loadPreferences();
    this.apply();
  }

  private update(changes: Partial<ThemePreferences>): void {
    this.preferences = { ...this.preferences, ...changes };
    localStorage.setItem(this.storageKey, JSON.stringify(this.preferences));
    this.apply();
  }

  private loadPreferences(): ThemePreferences {
    const defaults: ThemePreferences = {
      mode: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
      palette: 'jade',
      highContrast: false,
      motion: true
    };
    try {
      const value = localStorage.getItem(this.storageKey);
      if (!value) return defaults;
      const stored = JSON.parse(value) as Partial<ThemePreferences>;
      return {
        mode: stored.mode === 'dark' || stored.mode === 'light' ? stored.mode : defaults.mode,
        palette: this.isPalette(stored.palette) ? stored.palette : defaults.palette,
        highContrast: stored.highContrast ?? defaults.highContrast,
        motion: stored.motion ?? defaults.motion
      };
    } catch {
      return defaults;
    }
  }

  private get storageKey(): string {
    return `${this.storagePrefix}:${this.activeUser}`;
  }

  private resolveSessionUsername(): string {
    try {
      const session = JSON.parse(sessionStorage.getItem('nava-session') ?? '{}') as {
        user?: { username?: string };
      };
      return session.user?.username?.trim() || 'guest';
    } catch {
      return 'guest';
    }
  }

  private isPalette(value: unknown): value is ThemePalette {
    return value === 'jade' || value === 'ocean' || value === 'violet' || value === 'graphite';
  }

  private apply(): void {
    const root = this.document.documentElement;
    root.dataset['theme'] = this.preferences.mode;
    root.dataset['palette'] = this.preferences.palette;
    root.dataset['contrast'] = this.preferences.highContrast ? 'high' : 'standard';
    root.dataset['motion'] = this.preferences.motion ? 'full' : 'reduced';
    root.style.colorScheme = this.preferences.mode;
  }
}
