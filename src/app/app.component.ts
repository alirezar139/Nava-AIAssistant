import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NotificationCenterComponent } from './shared/components/notification-center/notification-center.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NotificationCenterComponent],
  template: '<router-outlet /><app-notification-center />',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent {}
