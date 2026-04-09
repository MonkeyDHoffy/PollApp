import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SurveyResult } from '../../../../shared/models/survey.model';
import { SurveyService } from '../../../../shared/services/survey.service';
import { ButtonComponent } from '../../ui/button/button';

type QuestionView = {
  id: string;
  index: number;
  text: string;
  allowMultiple: boolean;
  answers: Array<{
    id: string;
    text: string;
    optionLabel: string;
  }>;
};

@Component({
  selector: 'app-survey-detail',
  imports: [ButtonComponent],
  templateUrl: './survey-detail.html',
  styleUrl: './survey-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SurveyDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly surveyService = inject(SurveyService);
  private readonly surveyId = this.route.snapshot.paramMap.get('id');
  private readonly joinToken = this.route.snapshot.paramMap.get('token');

  protected readonly survey = computed(() => this.surveyService.currentSurvey());
  protected readonly loading = computed(() => this.surveyService.loading());
  protected readonly error = computed(() => this.surveyService.error());
  protected readonly resultsOpen = signal(true);
  protected readonly submitted = signal(false);
  protected readonly submitting = signal(false);
  protected readonly submitMessage = signal<string | null>(null);
  protected readonly selectedAnswers = signal<Record<string, string[]>>({});
  protected readonly liveResults = signal<SurveyResult[]>([]);
  protected readonly isDemoSurvey = computed(() => (this.survey()?.id ?? '').startsWith('demo-'));
  protected readonly homeLabel = computed(() => 'Create survey');

  protected readonly questionColumns = computed(() => {
    const survey = this.survey();
    if (!survey) {
      return { left: [] as QuestionView[], right: [] as QuestionView[] };
    }

    const questions: QuestionView[] = survey.questions.map((question, index) => ({
      id: question.id,
      index,
      text: question.text,
      allowMultiple: !!question.allowMultiple,
      answers: question.answers.map((answer, answerIndex) => ({
        id: answer.id,
        text: answer.text,
        optionLabel: this.optionLabel(answerIndex),
      })),
    }));

    const left = questions.filter((_, index) => index % 2 === 0);
    const right = questions.filter((_, index) => index % 2 === 1);

    return { left, right };
  });

  protected readonly resultsRows = computed(() => {
    const survey = this.survey();
    if (!survey) {
      return [];
    }

    const resultsByQuestion = new Map(
      this.liveResults().map((result) => [
        result.questionId,
        new Map(result.answers.map((answer) => [answer.id, answer])),
      ])
    );

    return survey.questions.map((question) => {
      const questionResults = resultsByQuestion.get(question.id);

      const answers = question.answers.map((answer, answerIndex) => {
        const result = questionResults?.get(answer.id);
        return {
          id: answer.id,
          label: this.optionLabel(answerIndex),
          percentage: result?.percentage ?? 0,
          count: result?.count ?? 0,
        };
      });

      return {
        questionId: question.id,
        questionText: question.text,
        answers,
      };
    });
  });

  protected readonly hasResults = computed(() =>
    this.resultsRows().some((row) => row.answers.some((answer) => answer.count > 0))
  );

  constructor() {
    if (this.surveyId) {
      void this.loadSurveyContext(this.surveyId);
      return;
    }

    if (this.joinToken) {
      void this.loadSurveyByJoinToken(this.joinToken);
    }
  }

  protected goHome(): void {
    void this.router.navigate([this.isDemoSurvey() ? '/demo' : '/']);
  }

  protected readonly formattedEndsAt = computed(() => {
    const endsAt = this.survey()?.endsAt;
    if (!endsAt) {
      return 'No end date';
    }

    const date = new Date(endsAt);
    if (Number.isNaN(date.getTime())) {
      return 'No end date';
    }

    return new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  });

  protected toggleAnswer(questionId: string, answerId: string, allowMultiple: boolean): void {
    this.selectedAnswers.update((state) => {
      const current = state[questionId] ?? [];

      if (!allowMultiple) {
        return {
          ...state,
          [questionId]: current.includes(answerId) ? [] : [answerId],
        };
      }

      return {
        ...state,
        [questionId]: current.includes(answerId)
          ? current.filter((id) => id !== answerId)
          : [...current, answerId],
      };
    });
  }

  protected isSelected(questionId: string, answerId: string): boolean {
    return (this.selectedAnswers()[questionId] ?? []).includes(answerId);
  }

  protected async completeSurvey(): Promise<void> {
    const survey = this.survey();
    if (!survey) {
      this.submitMessage.set('Survey is not available yet.');
      return;
    }

    const answers = Object.entries(this.selectedAnswers())
      .filter(([, selectedAnswerIds]) => selectedAnswerIds.length > 0)
      .map(([questionId, selectedAnswerIds]) => ({ questionId, selectedAnswerIds }));

    if (answers.length === 0) {
      this.submitMessage.set('Select at least one answer before completing the survey.');
      return;
    }

    this.submitting.set(true);
    this.submitMessage.set(null);

    const saved = await this.surveyService.submitSurveyResponse({
      surveyId: survey.id,
      answers,
    });

    if (!saved) {
      this.submitMessage.set(this.error() ?? 'Could not submit your response. Please try again.');
      this.submitting.set(false);
      return;
    }

    await this.refreshResults(survey.id);
    this.submitted.set(true);
    this.resultsOpen.set(true);
    this.submitMessage.set('Thanks! Your response has been saved.');
    this.submitting.set(false);
  }

  protected toggleResults(): void {
    this.resultsOpen.update((value) => !value);
  }

  private optionLabel(index: number): string {
    return String.fromCharCode(65 + index);
  }

  private async loadSurveyContext(surveyId: string): Promise<void> {
    await this.surveyService.loadSurveyById(surveyId);
    await this.refreshResults(surveyId);
  }

  private async refreshResults(surveyId: string): Promise<void> {
    const results = await this.surveyService.loadSurveyResults(surveyId);
    this.liveResults.set(results);
  }

  private async loadSurveyByJoinToken(joinToken: string): Promise<void> {
    await this.surveyService.loadSurveyByShareToken(joinToken);
    const surveyId = this.survey()?.id;
    if (!surveyId) {
      return;
    }

    await this.refreshResults(surveyId);
  }
}
