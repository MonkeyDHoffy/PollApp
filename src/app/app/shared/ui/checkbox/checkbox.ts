import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

type CheckboxState = 'default' | 'highlight' | 'checked';

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
