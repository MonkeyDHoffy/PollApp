import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../../../shared/services/toast.service';

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
