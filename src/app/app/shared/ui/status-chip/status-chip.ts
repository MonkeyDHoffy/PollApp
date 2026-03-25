import { ChangeDetectionStrategy, Component, input } from '@angular/core';

type SurveyStatus = 'published' | 'draft';

@Component({
  selector: 'app-status-chip',
  imports: [],
  templateUrl: './status-chip.html',
  styleUrl: './status-chip.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusChipComponent {
  readonly label = input('Published');
  readonly status = input<SurveyStatus>('published');
}
