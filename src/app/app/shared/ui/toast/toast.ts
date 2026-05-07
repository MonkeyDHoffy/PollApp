import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../../../shared/services/toast.service';

/**
 * Global toast notification bar — renders all active toasts from {@link ToastService}.
 */
@Component({
  selector: 'app-toast',
  imports: [],
  templateUrl: './toast.html',
  styleUrl: './toast.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastComponent {
  protected readonly toastService = inject(ToastService);
  protected readonly toasts = this.toastService.toasts;
}
