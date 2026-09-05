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

  private intervalId?: ReturnType<typeof setInterval>;

  dateLabel = '';
  hourDeg = 0;
  minuteDeg = 0;
  secondDeg = 0;

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
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();

    this.hourDeg = (hours % 12) * 30 + minutes * 0.5;
    this.minuteDeg = minutes * 6 + seconds * 0.1;
    this.secondDeg = (now.getTime() / 1000) * 6;
    this.dateLabel = this.dateFormatter.format(now);
    this.changeDetector.markForCheck();
  }
}
