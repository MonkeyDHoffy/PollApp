import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../../shared/services/auth.service';
import { LangService } from '../../../../shared/services/lang.service';

/**
 * First-login modal that prompts a newly signed-in user to choose their display name.
 * Disappears automatically once {@link AuthService.needsDisplayName} becomes false.
 */
@Component({
  selector: 'app-onboarding-modal',
  imports: [ReactiveFormsModule],
  templateUrl: './onboarding-modal.html',
  styleUrl: './onboarding-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingModalComponent {
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly langService = inject(LangService);

  protected readonly t = this.langService.t;
  protected readonly submitting = signal(false);

  protected readonly nameControl = this.fb.nonNullable.control('', [
    Validators.required,
    Validators.maxLength(10),
  ]);
  protected readonly form = this.fb.group({ name: this.nameControl });

  /** Validates and saves the chosen display name via {@link AuthService}. */
  protected async submitName(): Promise<void> {
    this.nameControl.markAsTouched();
    const name = this.nameControl.value.trim();
    if (!name) return;
    this.submitting.set(true);
    await this.authService.updateDisplayName(name);
    this.submitting.set(false);
    this.nameControl.reset('');
  }
}
