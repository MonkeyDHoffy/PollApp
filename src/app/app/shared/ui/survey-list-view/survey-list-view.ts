import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

type SurveyListTone = 'base' | 'muted';

type SurveyListItem = {
  id?: string;
  category: string;
  title: string;
  badgeLabel: string;
  tone?: SurveyListTone;
};

type SurveyListRow = {
  id: string;
  category: string;
  title: string;
  badgeLabel: string;
  tone: SurveyListTone;
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

  protected readonly rows = computed<SurveyListRow[]>(() =>
    this.items().map((item, index) => ({
      id: item.id ?? `${index}-${item.title}`,
      category: item.category,
      title: item.title,
      badgeLabel: item.badgeLabel,
      tone: item.tone ?? 'base',
    }))
  );
}
