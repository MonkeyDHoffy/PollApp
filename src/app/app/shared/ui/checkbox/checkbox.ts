import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Visual state of the checkbox. */
type CheckboxState = 'default' | 'highlight' | 'checked';

/**
 * Presentational checkbox component used inside {@link AnswerItemComponent}.
 * Controlled entirely through the `state` input — no internal toggle logic.
 */
@Component({
  selector: 'app-checkbox',
  imports: [],
  templateUrl: './checkbox.html',
  styleUrl: './checkbox.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckboxComponent {
  readonly state = input<CheckboxState>('default');
  readonly ariaLabel = input('Checkbox');

  protected readonly isChecked = computed(() => this.state() === 'checked');
}
