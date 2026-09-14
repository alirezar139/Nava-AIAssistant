import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';

@Component({
  selector: 'app-date-time-clock',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './date-time-clock.component.html',
  styleUrl: './date-time-clock.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DateTimeClockComponent implements OnInit, OnDestroy {
  private readonly dateFormatter = new Intl.DateTimeFormat('fa-IR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  private readonly timeFormatter = new Intl.DateTimeFormat('fa-IR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  private intervalId?: ReturnType<typeof setInterval>;

  dateLabel = '';
  timeLabel = '';

  constructor(private readonly changeDetector: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.updateNow();
    this.intervalId = setInterval(() => this.updateNow(), 1000);
  }

  ngOnDestroy(): void {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private updateNow(): void {
    const now = new Date();
    this.dateLabel = this.dateFormatter.format(now);
    this.timeLabel = this.timeFormatter.format(now);
    this.changeDetector.markForCheck();
  }
}
