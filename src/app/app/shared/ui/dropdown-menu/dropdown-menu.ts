import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';

type DropdownAppearance = 'ghost' | 'filled';

/** Dropdown-Auswahlmenü mit Trigger-Button, animierter Option-Liste und aktiver Auswahl-Anzeige. */
@Component({
  selector: 'app-dropdown-menu',
  imports: [],
  templateUrl: './dropdown-menu.html',
  styleUrl: './dropdown-menu.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DropdownMenuComponent {
  readonly label = input('Sort by categories');
  readonly options = input<string[]>([
    'Team Activities',
    'Health & Wellness',
    'Gaming & Entertainment',
    'Education & Learning',
    'Lifestyle & Preferences',
    'Technology & Innovation',
  ]);
  readonly selected = input('');
  readonly appearance = input<DropdownAppearance>('filled');
  readonly showSelectionValue = input(false);
  readonly startOpen = input(false);
  readonly accentArrow = input(false);
  readonly locked = input(false);

  readonly selectedChange = output<string>();

  protected readonly open = signal(false);
  protected readonly currentSelection = signal('');

  constructor() {
    effect(() => {
      this.open.set(this.startOpen());
    });

    effect(() => {
      this.currentSelection.set(this.selected());
    });
  }

  protected onToggle(): void {
    if (this.locked()) {
      return;
    }

    this.open.update((value) => !value);
  }

  protected onSelect(option: string): void {
    if (this.locked()) {
      return;
    }

    this.currentSelection.set(option);
    this.open.set(false);
    this.selectedChange.emit(option);
  }
}
