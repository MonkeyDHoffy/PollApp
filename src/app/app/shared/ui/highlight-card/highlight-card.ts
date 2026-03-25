import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

type HighlightCardTone = 'base' | 'muted';

@Component({
  selector: 'app-highlight-card',
  imports: [],
  templateUrl: './highlight-card.html',
  styleUrl: './highlight-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HighlightCardComponent {
  readonly category = input('Team activities');
  readonly title = input("Let's Plan the Next Team Event Together");
  readonly badgeLabel = input('Ends in 1 Day');
  readonly tone = input<HighlightCardTone>('base');

  protected readonly titleSizeClass = computed(() => {
    const titleLength = this.title().trim().length;

    if (titleLength > 80) {
      return 'highlight-card--title-xs';
    }

    if (titleLength > 58) {
      return 'highlight-card--title-sm';
    }

    if (titleLength > 42) {
      return 'highlight-card--title-md';
    }

    return 'highlight-card--title-lg';
  });
}
