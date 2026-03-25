import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ButtonComponent } from './app/shared/ui/button/button';
import { StatusChipComponent } from './app/shared/ui/status-chip/status-chip';

@Component({
  selector: 'app-root',
  imports: [ButtonComponent, StatusChipComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly previewOpen = signal(false);

  protected togglePreview(): void {
    this.previewOpen.update((value) => !value);
  }
}
