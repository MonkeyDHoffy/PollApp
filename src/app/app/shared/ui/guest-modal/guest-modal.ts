import {
  ChangeDetectionStrategy,
  Component,
  inject,
  output,
  signal,
} from '@angular/core';
import { GuestService } from '../../../../shared/services/guest.service';
import { LangService } from '../../../../shared/services/lang.service';

/** Modal for entering a display name to start a guest session. */
@Component({
  selector: 'app-guest-modal',
  templateUrl: './guest-modal.html',
  styleUrl: './guest-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuestModalComponent {
  private readonly guestService = inject(GuestService);
  private readonly langService = inject(LangService);

  protected readonly t = this.langService.t;

  /** Emits when the modal should close (cancelled or session started). */
  readonly closed = output<void>();

  protected readonly nameInput = signal('');
  protected readonly hasError = signal(false);

  /** Updates the name input value and clears any validation error. */
  protected onNameInput(value: string): void {
    this.nameInput.set(value);
    if (this.hasError()) this.hasError.set(false);
  }

  /** Validates the name, starts the guest session, and closes the modal. */
  protected confirm(): void {
    const name = this.nameInput().trim();
    if (!name) {
      this.hasError.set(true);
      return;
    }
    this.guestService.startSession(name);
    this.closed.emit();
  }

  /** Closes the modal without starting a session. */
  protected cancel(): void {
    this.closed.emit();
  }
}
