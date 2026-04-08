import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SurveyService } from '../../../../shared/services/survey.service';

@Component({
  selector: 'app-survey-detail',
  imports: [RouterLink],
  templateUrl: './survey-detail.html',
  styleUrl: './survey-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SurveyDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly surveyService = inject(SurveyService);

  protected readonly survey = computed(() => this.surveyService.currentSurvey());
  protected readonly loading = computed(() => this.surveyService.loading());
  protected readonly error = computed(() => this.surveyService.error());

  constructor() {
    const surveyId = this.route.snapshot.paramMap.get('id');
    if (surveyId) {
      void this.surveyService.loadSurveyById(surveyId);
    }
  }
}
