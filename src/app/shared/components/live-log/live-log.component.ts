import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, LiveLogEntry, SystemLogLevel } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { ErrorMessageService } from '../../../core/services/error-message.service';
import { appVersionInfo } from '../../../../environments/version';

const POLL_INTERVAL_MS = 3000;
const MAX_ENTRIES = 1000;

@Component({
  selector: 'app-live-log',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './live-log.component.html',
  styleUrl: './live-log.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LiveLogComponent implements OnDestroy {
  @ViewChild('logList') private logList?: ElementRef<HTMLElement>;

  readonly levels: SystemLogLevel[] = ['error', 'warn', 'info'];

  open = false;
  paused = false;
  loading = false;
  error = '';
  notice = '';
  levelFilter: SystemLogLevel | '' = '';
  entries: LiveLogEntry[] = [];

  private cursor = 0;
  private bootId = '';
  private inFlight = false;
  private intervalId?: ReturnType<typeof setInterval>;
  private noticeTimeoutId?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
    private readonly errorMessages: ErrorMessageService,
    private readonly changeDetector: ChangeDetectorRef
  ) {}

  get visibleEntries(): LiveLogEntry[] {
    return this.levelFilter ? this.entries.filter((entry) => entry.level === this.levelFilter) : this.entries;
  }

  get errorCount(): number {
    return this.entries.filter((entry) => entry.level === 'error').length;
  }

  levelLabel(level: SystemLogLevel): string {
    return level === 'error' ? 'خطا' : level === 'warn' ? 'هشدار' : 'اطلاعات';
  }

  timeLabel(timestamp: string): string {
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleTimeString('en-GB', { hour12: false });
  }

  openPanel(): void {
    this.open = true;
    this.paused = false;
    this.error = '';
    this.loading = !this.entries.length;
    this.poll();
    this.intervalId = setInterval(() => {
      if (!this.paused) this.poll();
    }, POLL_INTERVAL_MS);
  }

  closePanel(): void {
    this.open = false;
    this.stopPolling();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open) this.closePanel();
  }

  togglePause(): void {
    this.paused = !this.paused;
    if (!this.paused) this.poll();
  }

  clearView(): void {
    // Only hides what is on screen; the cursor stays so cleared lines do not come back.
    this.entries = [];
  }

  copyAll(): void {
    const lines = this.visibleEntries.map((entry) => this.formatEntry(entry));
    if (!lines.length) {
      this.showNotice('لاگی برای کپی وجود ندارد.');
      return;
    }
    void this.copyText(
      [...this.reportHeader(), ...lines].join('\n'),
      'لاگ کپی شد؛ آن را برای تیم پشتیبانی ارسال کنید.'
    );
  }

  copyEntry(entry: LiveLogEntry): void {
    void this.copyText(this.formatEntry(entry), 'این خط کپی شد.');
  }

  ngOnDestroy(): void {
    this.stopPolling();
    clearTimeout(this.noticeTimeoutId);
  }

  private poll(): void {
    if (this.inFlight) return;
    this.inFlight = true;
    this.api.getLiveLogs(this.cursor).subscribe({
      next: (response) => {
        this.inFlight = false;
        this.loading = false;
        this.error = '';
        if (this.bootId && response.bootId !== this.bootId) {
          // The server restarted and its sequence starts over; fetch from the beginning.
          this.bootId = response.bootId;
          this.cursor = 0;
          this.entries = [];
          this.poll();
          return;
        }
        this.bootId = response.bootId;
        this.cursor = response.lastSeq;
        if (response.entries.length) {
          const stickToBottom = this.isScrolledToBottom();
          this.entries = [...this.entries, ...response.entries].slice(-MAX_ENTRIES);
          if (stickToBottom) setTimeout(() => this.scrollToBottom());
        }
        this.changeDetector.markForCheck();
      },
      error: (error: unknown) => {
        this.inFlight = false;
        this.loading = false;
        const resolved = this.errorMessages.resolve(error, 'دریافت لاگ زنده انجام نشد.');
        this.error = this.errorMessages.formatMessage(resolved);
        this.changeDetector.markForCheck();
      }
    });
  }

  private stopPolling(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = undefined;
  }

  private isScrolledToBottom(): boolean {
    const element = this.logList?.nativeElement;
    if (!element) return true;
    return element.scrollHeight - element.scrollTop - element.clientHeight < 40;
  }

  private scrollToBottom(): void {
    const element = this.logList?.nativeElement;
    if (element) element.scrollTop = element.scrollHeight;
  }

  private formatEntry(entry: LiveLogEntry): string {
    return `${entry.timestamp} [${entry.level.toUpperCase()}] ${entry.text}`;
  }

  private reportHeader(): string[] {
    const user = this.auth.user;
    return [
      'Nava AI Assistant - live log report',
      `User: ${user ? `${user.fullName} (${user.username}, ${user.role})` : '-'}`,
      `Copied at: ${new Date().toISOString()}`,
      `Page: ${window.location.href}`,
      `App version: ${appVersionInfo.version} (${appVersionInfo.git.commit})`,
      `Filter: ${this.levelFilter || 'all'}`,
      '----------------------------------------'
    ];
  }

  private async copyText(text: string, successMessage: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API needs a secure context; fall back for plain-HTTP deployments.
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      if (!copied) {
        this.showNotice('کپی خودکار ممکن نشد؛ متن لاگ را انتخاب و دستی کپی کنید.');
        return;
      }
    }
    this.showNotice(successMessage);
  }

  private showNotice(message: string): void {
    this.notice = message;
    clearTimeout(this.noticeTimeoutId);
    this.noticeTimeoutId = setTimeout(() => {
      this.notice = '';
      this.changeDetector.markForCheck();
    }, 3500);
    this.changeDetector.markForCheck();
  }
}
