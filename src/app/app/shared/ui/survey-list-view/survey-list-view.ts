import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

type SurveyListTone = 'base' | 'muted';

type BadgeTone = 'active' | 'expiring' | 'ended' | 'none';

type SurveyListItem = {
  id?: string;
  category: string;
  title: string;
  badgeLabel: string;
  tone?: SurveyListTone;
  badgeTone?: BadgeTone;
  creatorEmail?: string;
  responseCount?: number;
  shareToken?: string;
};

type SurveyListRow = {
  id: string;
  category: string;
  title: string;
  badgeLabel: string;
  tone: SurveyListTone;
  badgeTone: BadgeTone;
  creatorEmail?: string;
  responseCount: number;
  shareToken?: string;
};

@Component({
  selector: 'app-survey-list-view',
  imports: [],
  templateUrl: './survey-list-view.html',
  styleUrl: './survey-list-view.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SurveyListViewComponent {
  readonly heading = input('Survey view in the list');
  readonly items = input<SurveyListItem[]>([
    {
      category: 'Team activities',
      title: "Let's Plan the Next Team Event Together",
      badgeLabel: 'Ends in 1 Day',
      tone: 'base',
    },
    {
      category: 'Team activities',
      title: "Let's Plan the Next Team Event Together",
      badgeLabel: 'Ends in 1 Day',
      tone: 'muted',
    },
  ]);
  readonly surveySelected = output<string>();
  readonly shareLinkClicked = output<string>();

  protected readonly rows = computed<SurveyListRow[]>(() =>
    this.items().map((item, index) => ({
      id: item.id ?? `${index}-${item.title}`,
      category: item.category,
      title: item.title,
      badgeLabel: item.badgeLabel,
      tone: item.tone ?? 'base',
      badgeTone: item.badgeTone ?? 'none',
      creatorEmail: item.creatorEmail,
      responseCount: item.responseCount ?? 0,
      shareToken: item.shareToken,
    }))
  );

  protected onSelect(row: SurveyListRow): void {
    if (row.tone === 'muted') {
      return;
    }

    this.surveySelected.emit(row.id);
  }

  protected onShare(row: SurveyListRow, event: MouseEvent): void {
    event.stopPropagation();
    if (row.shareToken) {
      this.shareLinkClicked.emit(row.shareToken);
    }
  }
}
