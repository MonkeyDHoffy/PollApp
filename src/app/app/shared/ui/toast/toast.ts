import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../../../shared/services/toast.service';

/** Globale Toast-Benachrichtigungsleiste — rendert alle aktiven Toasts aus dem ToastService. */
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
