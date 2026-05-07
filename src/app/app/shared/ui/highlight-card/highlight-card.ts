import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

type HighlightCardTone = 'base' | 'muted';

/**
 * Highlighted survey card for the "ending soon" carousel.
 * Shows the category, title, and an end-date badge.
 */
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
  readonly surveyId = input('');

  /** Emits the survey ID when the card is clicked. */
  readonly clicked = output<string>();

  protected onClick(): void {
    const id = this.surveyId();
    if (id) this.clicked.emit(id);
  }

  /** CSS modifier class based on the title length to prevent overflow. */
  protected readonly titleSizeClass = computed(() => {
    const titleLength = this.title().trim().length;
    if (titleLength > 80) return 'highlight-card--title-xs';
    if (titleLength > 58) return 'highlight-card--title-sm';
    if (titleLength > 42) return 'highlight-card--title-md';
    return 'highlight-card--title-lg';
  });
}
