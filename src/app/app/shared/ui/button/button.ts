import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

type ButtonVariant = 'primary' | 'secondary' | 'filter' | 'tertiary' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';
type ButtonType = 'button' | 'submit' | 'reset';
type PrimaryStyle = 'base' | 'add' | 'confirm';
type SecondaryStyle = 'base' | 'muted';
type FilterStyle = 'base' | 'active';
type TertiaryStyle = 'base' | 'muted';

@Component({
  selector: 'app-button',
  imports: [],
  templateUrl: './button.html',
  styleUrl: './button.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ButtonComponent {
  readonly label = input('Button');
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  readonly type = input<ButtonType>('button');
  readonly disabled = input(false);
  readonly primaryStyle = input<PrimaryStyle>('base');
  readonly secondaryStyle = input<SecondaryStyle>('base');
  readonly filterStyle = input<FilterStyle>('base');
  readonly tertiaryStyle = input<TertiaryStyle>('base');

  readonly pressed = output<void>();

  protected readonly hasIcon = computed(() => this.isAddIcon() || this.isCheckIcon());

  protected readonly isAddStyle = computed(
    () => this.variant() === 'primary' && this.primaryStyle() === 'add'
  );

  protected readonly isConfirmStyle = computed(
    () => this.variant() === 'primary' && this.primaryStyle() === 'confirm'
  );

  protected readonly isSecondaryMuted = computed(
    () => this.variant() === 'secondary' && this.secondaryStyle() === 'muted'
  );

  protected readonly isFilterActive = computed(
    () => this.variant() === 'filter' && this.filterStyle() === 'active'
  );

  protected readonly isTertiaryMuted = computed(
    () => this.variant() === 'tertiary' && this.tertiaryStyle() === 'muted'
  );

  protected readonly isAddIcon = computed(
    () =>
      (this.variant() === 'primary' && this.primaryStyle() === 'add') ||
      this.variant() === 'tertiary'
  );

  protected readonly isCheckIcon = computed(
    () => this.variant() === 'primary' && this.primaryStyle() === 'confirm'
  );

  protected onClick(): void {
    if (this.disabled()) {
      return;
    }

    this.pressed.emit();
  }
}
