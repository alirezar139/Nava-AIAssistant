import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'app-brand-logo',
  standalone: true,
  templateUrl: './brand-logo.component.html',
  styleUrl: './brand-logo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.full]': "variant === 'full'"
  }
})
export class BrandLogoComponent {
  @Input() variant: 'mark' | 'full' = 'mark';
}
