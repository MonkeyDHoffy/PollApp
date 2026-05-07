import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** A single result bar item (label + raw percentage). */
type ResultItem = {
  label: string;
  percentage: number;
};

/** A result bar row enriched with a stable ID and formatted percentage text. */
type ResultRow = ResultItem & {
  id: string;
  percentageText: string;
};

/**
 * Displays the aggregated results for one survey question as a bar chart.
 * Percentages are clamped to [0, 100] before rendering.
 */
@Component({
  selector: 'app-results-card',
  imports: [],
  templateUrl: './results-card.html',
  styleUrl: './results-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultsCardComponent {
  readonly title = input('Results');
  readonly questionNumber = input(1);
  readonly question = input('Some question?');
  readonly results = input<ResultItem[]>([
    { label: 'A', percentage: 27 },
    { label: 'B', percentage: 44 },
    { label: 'C', percentage: 3 },
    { label: 'D', percentage: 26 },
  ]);

  protected readonly rows = computed<ResultRow[]>(() =>
    this.results().map((item, index) => {
      const clamped = this.clampPercentage(item.percentage);
      return {
        id: `${item.label}-${index}`,
        label: item.label,
        percentage: clamped,
        percentageText: `${Math.round(clamped)}%`,
      };
    })
  );

  private clampPercentage(value: number): number {
    return Math.min(100, Math.max(0, value));
  }
}
