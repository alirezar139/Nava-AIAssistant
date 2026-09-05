import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'jalaliDateTime',
  standalone: true
})
export class JalaliDateTimePipe implements PipeTransform {
  private readonly formatter = new Intl.DateTimeFormat('fa-IR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  transform(value: string | number | Date | null | undefined): string {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const parts = this.formatter.formatToParts(date);
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return `${part('year')}/${part('month')}/${part('day')} - ${part('hour')}:${part('minute')}`;
  }
}
