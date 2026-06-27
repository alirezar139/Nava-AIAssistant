import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type NotificationType = 'success' | 'error' | 'info';

export interface AppNotification {
  id: number;
  type: NotificationType;
  title: string;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly notificationsSubject = new BehaviorSubject<AppNotification[]>([]);
  private nextId = 1;

  readonly notifications$ = this.notificationsSubject.asObservable();

  success(title: string, message: string): void {
    this.show('success', title, message);
  }

  error(title: string, message: string): void {
    this.show('error', title, message, 6000);
  }

  info(title: string, message: string): void {
    this.show('info', title, message);
  }

  dismiss(id: number): void {
    this.notificationsSubject.next(
      this.notificationsSubject.value.filter((notification) => notification.id !== id)
    );
  }

  private show(type: NotificationType, title: string, message: string, duration = 4500): void {
    const notification: AppNotification = { id: this.nextId++, type, title, message };
    this.notificationsSubject.next([...this.notificationsSubject.value, notification].slice(-4));
    window.setTimeout(() => this.dismiss(notification.id), duration);
  }
}
