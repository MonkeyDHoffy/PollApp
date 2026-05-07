import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

type InputType = 'text' | 'email' | 'password' | 'date';
type InputVisualState = 'default' | 'active' | 'filled';

/**
 * Labelled text input with focus tracking, optional hint and error text,
 * and an auto-generated `id` attribute derived from the label.
 */
@Component({
  selector: 'app-input',
  imports: [],
  templateUrl: './input.html',
  styleUrl: './input.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InputComponent {
  readonly id = input('');
  readonly label = input('');
  readonly placeholder = input('');
  readonly type = input<InputType>('text');
  readonly value = input('');
  readonly required = input(false);
  readonly hint = input('');
  readonly error = input('');
  readonly visualState = input<InputVisualState>('default');
  readonly readonly = input(false);

  /** Emits the new string value whenever the input changes. */
  readonly valueChange = output<string>();
  /** Emits when the input loses focus. */
  readonly blurred = output<void>();

  private readonly focused = signal(false);

  protected readonly isActive = computed(
    () => this.visualState() === 'active' || this.focused()
  );

  /** Unique element ID, either from the `id` input or auto-generated from the label. */
  protected readonly fieldId = computed(() => {
    const customId = this.id().trim();
    if (customId) return customId;
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
    this.focused.set(false);
    this.blurred.emit();
  }

  protected onFocus(): void {
    this.focused.set(true);
  }
}
