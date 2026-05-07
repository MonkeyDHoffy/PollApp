import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Survey lifecycle state shown by this chip. */
type SurveyStatus = 'published' | 'draft';

/**
 * Small inline badge indicating the publish status of a survey.
 */
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
