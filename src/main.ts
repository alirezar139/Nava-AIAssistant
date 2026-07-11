import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

bootstrapApplication(AppComponent, appConfig).catch((error: unknown) => console.error(error));

const shouldRegisterServiceWorker =
  'serviceWorker' in navigator &&
  window.location.protocol.startsWith('http') &&
  window.location.port !== '4200';

if (shouldRegisterServiceWorker) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/nava-service-worker.js')
      .catch((error: unknown) => console.warn('Service worker registration failed.', error));
  });
}
