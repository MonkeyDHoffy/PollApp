import { Component, computed, input, output } from '@angular/core';

type InputType = 'text' | 'email' | 'password' | 'date';

@Component({
  selector: 'app-input',
  imports: [],
  templateUrl: './input.html',
  styleUrl: './input.scss',
})
export class InputComponent {
  readonly id = input('');
  readonly label = input('Label');
  readonly placeholder = input('');
  readonly type = input<InputType>('text');
  readonly value = input('');
  readonly required = input(false);
  readonly hint = input('');
  readonly error = input('');

  readonly valueChange = output<string>();
  readonly blurred = output<void>();

  protected readonly fieldId = computed(() => {
    const customId = this.id().trim();
    if (customId) {
      return customId;
    }

    const normalizedLabel = this.label()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    return `field-${normalizedLabel || 'input'}`;
  });

  protected onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.valueChange.emit(value);
  }

  protected onBlur(): void {
    this.blurred.emit();
  }
}
