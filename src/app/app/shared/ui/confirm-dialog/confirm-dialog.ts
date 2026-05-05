import {
  ChangeDetectionStrategy,
  Component,
  Input,
  output,
} from '@angular/core';
import { ButtonComponent } from '../button/button';

/** Generic confirmation dialog with a backdrop, title, body text, and two action buttons. */
@Component({
  selector: 'app-confirm-dialog',
  imports: [ButtonComponent],
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialogComponent {
  /** Heading shown at the top of the dialog. */
  @Input({ required: true }) title!: string;

  /** Explanatory body text shown below the title. */
  @Input({ required: true }) text!: string;

  /** Label for the primary confirm button. */
  @Input({ required: true }) confirmLabel!: string;

  /** Label for the secondary cancel button. Defaults to 'Cancel'. */
  @Input() cancelLabel = 'Cancel';

  /** Disables the confirm button and shows a loading state when true. */
  @Input() loading = false;

  /** Emits when the user clicks the confirm button. */
  readonly confirmed = output<void>();

  /** Emits when the user clicks cancel or the backdrop. */
  readonly cancelled = output<void>();

  /** Forwards the confirm action to the parent. */
  protected onConfirm(): void {
    this.confirmed.emit();
  }

  /** Forwards the cancel action to the parent. */
  protected onCancel(): void {
    this.cancelled.emit();
  }
}
