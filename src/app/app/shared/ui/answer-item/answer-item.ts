import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CheckboxComponent } from '../checkbox/checkbox';

type AnswerItemState = 'default' | 'highlight' | 'checked';

/**
 * A single answer option in the survey detail view.
 * Renders a checkbox alongside an alphabetical option prefix and answer label.
 */
@Component({
  selector: 'app-answer-item',
  imports: [CheckboxComponent],
  templateUrl: './answer-item.html',
  styleUrl: './answer-item.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnswerItemComponent {
  readonly label = input('27.08.2025');
  readonly state = input<AnswerItemState>('default');
  readonly optionIndex = input(0);
  /** Overrides the auto-generated alphabetical prefix when set. */
  readonly optionPrefix = input<string | null>(null);

  protected readonly checkboxState = computed(() =>
    this.state() === 'checked' ? 'checked' : 'default'
  );

  protected readonly prefix = computed(() => {
    const explicitPrefix = this.optionPrefix();
    if (explicitPrefix) return explicitPrefix;
    return this.toAlphabetLabel(this.optionIndex());
  });

  /**
   * Converts a zero-based index to a spreadsheet-style column label (A, B, …, Z, AA, AB, …).
   */
  private toAlphabetLabel(index: number): string {
    if (index < 0) return 'A';
    let value = index;
    let result = '';
    do {
      result = String.fromCharCode(65 + (value % 26)) + result;
      value = Math.floor(value / 26) - 1;
    } while (value >= 0);
    return result;
  }
}
