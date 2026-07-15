import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';

export type ColorTheme = 'light' | 'dark';
export type ThemePalette = 'jade' | 'ocean' | 'violet' | 'graphite' | 'amber' | 'rose' | 'cobalt' | 'paint';

interface ThemePreferences {
  mode: ColorTheme;
  palette: ThemePalette;
  paintColor: string;
  profileImage: string | null;
  highContrast: boolean;
  motion: boolean;
  performanceVersion: number;
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

  get paintColor(): string {
    return this.preferences.paintColor;
  }

  get profileImage(): string | null {
    return this.preferences.profileImage;
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

  setPaintColor(color: string): void {
    const paintColor = this.normalizeHexColor(color);
    this.update({ palette: 'paint', paintColor });
  }

  setProfileImage(profileImage: string | null): void {
    this.update({ profileImage: profileImage?.trim() || null });
  }

  clearProfileImage(): void {
    this.setProfileImage(null);
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
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.preferences));
    } catch {
      this.preferences = { ...this.preferences, profileImage: null };
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(this.preferences));
      } catch {
        // Preferences still apply for the current session when persistence is unavailable.
      }
    }
    this.apply();
  }

  private loadPreferences(): ThemePreferences {
    const defaults: ThemePreferences = {
      mode: 'light',
      palette: 'jade',
      paintColor: '#176454',
      profileImage: null,
      highContrast: false,
      motion: false,
      performanceVersion: 1
    };
    try {
      const value = localStorage.getItem(this.storageKey);
      if (!value) return defaults;
      const stored = JSON.parse(value) as Partial<ThemePreferences>;
      return {
        mode: stored.mode === 'dark' || stored.mode === 'light' ? stored.mode : defaults.mode,
        palette: this.isPalette(stored.palette) ? stored.palette : defaults.palette,
        paintColor: this.normalizeHexColor(stored.paintColor, defaults.paintColor),
        profileImage: typeof stored.profileImage === 'string' ? stored.profileImage : defaults.profileImage,
        highContrast: stored.highContrast ?? defaults.highContrast,
        motion:
          stored.performanceVersion === defaults.performanceVersion
            ? (stored.motion ?? defaults.motion)
            : defaults.motion,
        performanceVersion: defaults.performanceVersion
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
    return (
      value === 'jade' ||
      value === 'ocean' ||
      value === 'violet' ||
      value === 'graphite' ||
      value === 'amber' ||
      value === 'rose' ||
      value === 'cobalt' ||
      value === 'paint'
    );
  }

  private apply(): void {
    const root = this.document.documentElement;
    this.applyPaintVariables(root);
    root.dataset['theme'] = this.preferences.mode;
    root.dataset['palette'] = this.preferences.palette;
    root.dataset['contrast'] = this.preferences.highContrast ? 'high' : 'standard';
    root.dataset['motion'] = this.preferences.motion ? 'full' : 'reduced';
    root.style.colorScheme = this.preferences.mode;
  }

  private applyPaintVariables(root: HTMLElement): void {
    const base = this.normalizeHexColor(this.preferences.paintColor);
    root.style.setProperty('--paint-primary-700', base);
    root.style.setProperty('--paint-primary-800', this.shadeHex(base, -12));
    root.style.setProperty('--paint-primary-900', this.shadeHex(base, -28));
    root.style.setProperty('--paint-primary-950', this.shadeHex(base, -42));
    root.style.setProperty('--paint-primary-100', this.shadeHex(base, 82));
    root.style.setProperty('--paint-accent-600', this.shadeHex(base, 26));
    root.style.setProperty('--paint-accent-100', this.shadeHex(base, 88));
    root.style.setProperty('--paint-page-bg', this.shadeHex(base, 91));
  }

  private normalizeHexColor(value: unknown, fallback = '#176454'): string {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
      return `#${trimmed
        .slice(1)
        .split('')
        .map((part) => part + part)
        .join('')}`.toLowerCase();
    }
    return fallback;
  }

  private shadeHex(hex: string, amount: number): string {
    const normalized = this.normalizeHexColor(hex);
    const target = amount >= 0 ? 255 : 0;
    const ratio = Math.min(Math.abs(amount), 100) / 100;
    const parts = [1, 3, 5].map((start) => {
      const channel = Number.parseInt(normalized.slice(start, start + 2), 16);
      const shifted = Math.round(channel + (target - channel) * ratio);
      return shifted.toString(16).padStart(2, '0');
    });
    return `#${parts.join('')}`;
  }
}
