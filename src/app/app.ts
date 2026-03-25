import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ButtonComponent } from './app/shared/ui/button/button';
import { StatusChipComponent } from './app/shared/ui/status-chip/status-chip';
import { CheckboxComponent } from './app/shared/ui/checkbox/checkbox';
import { AnswerItemComponent } from './app/shared/ui/answer-item/answer-item';
import { HighlightCardComponent } from './app/shared/ui/highlight-card/highlight-card';
import { ResultsCardComponent } from './app/shared/ui/results-card/results-card';
import { SurveyListViewComponent } from './app/shared/ui/survey-list-view/survey-list-view';

@Component({
  selector: 'app-root',
  imports: [
    ButtonComponent,
    StatusChipComponent,
    CheckboxComponent,
    AnswerItemComponent,
    HighlightCardComponent,
    ResultsCardComponent,
    SurveyListViewComponent,
  ],
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
