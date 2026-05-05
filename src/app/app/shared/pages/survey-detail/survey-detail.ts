import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SurveyResult } from '../../../../shared/models/survey.model';
import { SurveyService } from '../../../../shared/services/survey.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { LangService } from '../../../../shared/services/lang.service';
import { ButtonComponent } from '../../ui/button/button';
import { AuthService } from '../../../../shared/services/auth.service';

type QuestionView = {
  id: string;
  index: number;
  text: string;
  description?: string;
  allowMultiple: boolean;
  answers: Array<{
    id: string;
    text: string;
    optionLabel: string;
  }>;
};

@Component({
  selector: 'app-survey-detail',
  imports: [ButtonComponent, RouterLink],
  templateUrl: './survey-detail.html',
  styleUrl: './survey-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SurveyDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly surveyService = inject(SurveyService);
  private readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);
  protected readonly langService = inject(LangService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly surveyId = this.route.snapshot.paramMap.get('id');
  private readonly joinToken = this.route.snapshot.paramMap.get('token');
  private readonly joinCode = this.route.snapshot.queryParamMap.get('code');

  protected readonly t = this.langService.t;

  protected readonly survey = computed(() => this.surveyService.currentSurvey());
  protected readonly loading = computed(() => this.surveyService.loading());
  protected readonly error = computed(() => this.surveyService.error());
  protected readonly schemaNotice = computed(() => this.surveyService.schemaNotice());
  protected readonly authUser = computed(() => this.authService.user());

  protected readonly creatorMenuOpen = signal(false);
  protected readonly creatorActionMessage = signal<string | null>(null);
  protected readonly deletingSurvey = signal(false);
  protected readonly showDeleteConfirm = signal(false);
  protected readonly exportingCsv = signal(false);
  protected readonly alreadyVoted = signal(false);
  protected readonly resultsOpen = signal(true);
  protected readonly submitted = signal(false);
  protected readonly submitting = signal(false);
  protected readonly submitMessage = signal<string | null>(null);
  protected readonly accessCode = signal('');
  protected readonly accessCodeRequired = signal(false);
  protected readonly selectedAnswers = signal<Record<string, string[]>>({});
  protected readonly liveResults = signal<SurveyResult[]>([]);
  protected readonly isLive = signal(false);
  protected readonly resultsLoading = signal(false);
  protected readonly resultsFlash = signal(false);
  protected readonly mobileActiveTab = signal<'form' | 'results'>('form');

  protected readonly isCreatorSurvey = computed(() => {
    const userId = this.authUser()?.id;
    const survey = this.survey();
    return !!(userId && survey && survey.creatorId === userId);
  });

  // Show only the part before @ to protect privacy; never shown to creator
  protected readonly displayCreator = computed(() => {
    if (this.isCreatorSurvey()) return null;
    const email = this.survey()?.creatorEmail;
    if (!email) return null;
    return email.includes('@') ? email.split('@')[0] : email;
  });

  protected readonly questionColumns = computed(() => {
    const survey = this.survey();
    if (!survey) return { left: [] as QuestionView[], right: [] as QuestionView[] };

    const questions: QuestionView[] = survey.questions.map((question, index) => ({
      id: question.id,
      index,
      text: question.text,
      description: question.description,
      allowMultiple: !!question.allowMultiple,
      answers: question.answers.map((answer, answerIndex) => ({
        id: answer.id,
        text: answer.text,
        optionLabel: this.optionLabel(answerIndex),
      })),
    }));

    return {
      left: questions.filter((_, i) => i % 2 === 0),
      right: questions.filter((_, i) => i % 2 === 1),
    };
  });

  protected readonly resultsRows = computed(() => {
    const survey = this.survey();
    if (!survey) return [];

    const resultsByQuestion = new Map(
      this.liveResults().map((result) => [
        result.questionId,
        new Map(result.answers.map((answer) => [answer.id, answer])),
      ])
    );

    return survey.questions.map((question) => {
      const questionResults = resultsByQuestion.get(question.id);
      return {
        questionId: question.id,
        questionText: question.text,
        answers: question.answers.map((answer, answerIndex) => {
          const result = questionResults?.get(answer.id);
          return {
            id: answer.id,
            label: this.optionLabel(answerIndex),
            percentage: result?.percentage ?? 0,
            count: result?.count ?? 0,
          };
        }),
      };
    });
  });

  protected readonly hasResults = computed(() =>
    this.resultsRows().some((row) => row.answers.some((a) => a.count > 0))
  );

  protected readonly isSurveyEnded = computed(() => {
    const endsAt = this.survey()?.endsAt;
    if (!endsAt) return false;
    return new Date(endsAt) < new Date();
  });

  protected readonly totalQuestionsCount = computed(() => this.survey()?.questions.length ?? 0);

  protected readonly answeredQuestionsCount = computed(() =>
    Object.values(this.selectedAnswers()).filter((answers) => answers.length > 0).length
  );

  protected readonly formattedEndsAt = computed(() => {
    const endsAt = this.survey()?.endsAt;
    if (!endsAt) return this.t()('noEndDate');
    const date = new Date(endsAt);
    if (Number.isNaN(date.getTime())) return this.t()('noEndDate');
    return new Intl.DateTimeFormat(this.langService.lang() === 'de' ? 'de-DE' : 'en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  });

  constructor() {
    if (this.surveyId) {
      void this.loadSurveyContext(this.surveyId);
      return;
    }

    if (this.joinToken) {
      void this.loadSurveyByJoinToken(this.joinToken, this.joinCode ?? undefined);
    }

    effect(() => {
      const results = this.liveResults();
      if (results.some((r) => r.answers.some((a) => a.count > 0))) {
        this.resultsFlash.set(true);
        setTimeout(() => this.resultsFlash.set(false), 700);
      }
    });
  }

  protected goHome(): void {
    void this.router.navigate(['/']);
  }

  protected toggleCreatorMenu(): void {
    this.creatorMenuOpen.update((open) => !open);
  }

  protected async copyCreatorLink(): Promise<void> {
    const shareToken = this.survey()?.shareToken;
    this.creatorMenuOpen.set(false);
    if (!shareToken || typeof navigator === 'undefined' || !navigator.clipboard) {
      this.creatorActionMessage.set('No share link available for this survey.');
      return;
    }
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/join/${shareToken}`);
      this.toastService.success(this.t()('shareLinkCopied'));
    } catch {
      this.toastService.error(this.t()('shareLinkFailed'));
    }
  }

  protected editCurrentSurvey(): void {
    const surveyId = this.survey()?.id;
    if (!surveyId) return;
    this.creatorMenuOpen.set(false);
    void this.router.navigate(['/'], { queryParams: { edit: surveyId } });
  }

  protected duplicateCurrentSurvey(): void {
    const surveyId = this.survey()?.id;
    if (!surveyId) return;
    this.creatorMenuOpen.set(false);
    void this.router.navigate(['/'], { queryParams: { duplicate: surveyId } });
  }

  protected async exportResultsCsv(): Promise<void> {
    const survey = this.survey();
    if (!survey || this.exportingCsv()) return;
    this.exportingCsv.set(true);
    this.creatorMenuOpen.set(false);
    try {
      const csv = await this.surveyService.buildResultsCsv(survey.id);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${survey.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_results.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      this.creatorActionMessage.set('Export failed. Please try again.');
    } finally {
      this.exportingCsv.set(false);
    }
  }

  protected openDeleteConfirm(): void {
    this.creatorMenuOpen.set(false);
    this.showDeleteConfirm.set(true);
  }

  protected cancelDelete(): void {
    this.showDeleteConfirm.set(false);
  }

  protected async deleteCurrentSurvey(): Promise<void> {
    const survey = this.survey();
    if (!survey || this.deletingSurvey()) return;
    this.deletingSurvey.set(true);
    const deleted = await this.surveyService.deleteSurvey(survey.id);
    this.deletingSurvey.set(false);
    this.showDeleteConfirm.set(false);
    if (!deleted) {
      this.toastService.error(this.error() ?? 'Could not delete survey.');
      return;
    }
    this.toastService.success('Survey deleted.');
    void this.router.navigate(['/']);
  }

  protected toggleAnswer(questionId: string, answerId: string, allowMultiple: boolean): void {
    this.selectedAnswers.update((state) => {
      const current = state[questionId] ?? [];
      if (!allowMultiple) {
        return { ...state, [questionId]: current.includes(answerId) ? [] : [answerId] };
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
      this.submitMessage.set(this.t()('responseError'));
      return;
    }

    const answers = Object.entries(this.selectedAnswers())
      .filter(([, ids]) => ids.length > 0)
      .map(([questionId, selectedAnswerIds]) => ({ questionId, selectedAnswerIds }));

    if (answers.length === 0) {
      this.submitMessage.set(this.t()('selectAtLeastOne'));
      return;
    }

    this.submitting.set(true);
    this.submitMessage.set(null);

    const saved = await this.surveyService.submitSurveyResponse({ surveyId: survey.id, answers });

    if (!saved) {
      this.submitMessage.set(this.error() ?? this.t()('responseError'));
      this.submitting.set(false);
      return;
    }

    this.surveyService.savePreviousAnswers(survey.id, this.selectedAnswers());
    await this.refreshResults(survey.id);
    this.submitted.set(true);
    this.alreadyVoted.set(true);
    this.resultsOpen.set(true);
    this.submitMessage.set(this.t()('responseSaved'));
    this.toastService.success(this.t()('responseSavedToast'));
    this.submitting.set(false);
  }

  protected toggleResults(): void {
    this.resultsOpen.update((v) => !v);
  }

  protected switchTab(tab: 'form' | 'results'): void {
    this.mobileActiveTab.set(tab);
  }

  protected async copyShareLink(): Promise<void> {
    const shareToken = this.survey()?.shareToken;
    if (!shareToken || typeof navigator === 'undefined' || !navigator.clipboard) {
      this.toastService.error('No share link available.');
      return;
    }
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/join/${shareToken}`);
      this.toastService.success(this.t()('shareLinkCopied'));
    } catch {
      this.toastService.error(this.t()('shareLinkFailed'));
    }
  }

  protected updateAccessCode(value: string): void {
    this.accessCode.set(value);
  }

  protected applyAccessCode(): void {
    if (!this.joinToken) return;
    const code = this.accessCode().trim();
    if (!code) return;
    void this.loadSurveyByJoinToken(this.joinToken, code);
  }

  private optionLabel(index: number): string {
    return String.fromCharCode(65 + index);
  }

  private async loadSurveyContext(surveyId: string): Promise<void> {
    await this.surveyService.loadSurveyById(surveyId);
    await this.refreshResults(surveyId);
    const voted = this.surveyService.hasAlreadyVoted(surveyId);
    this.alreadyVoted.set(voted);
    if (voted) {
      this.selectedAnswers.set(this.surveyService.getPreviousAnswers(surveyId));
    }
    this.startLiveSubscription(surveyId);
  }

  private async refreshResults(surveyId: string): Promise<void> {
    this.resultsLoading.set(true);
    const results = await this.surveyService.loadSurveyResults(surveyId);
    this.liveResults.set(results);
    this.resultsLoading.set(false);
  }

  private async loadSurveyByJoinToken(joinToken: string, accessCode?: string): Promise<void> {
    const loaded = await this.surveyService.loadSurveyByShareToken(joinToken, accessCode);
    if (!loaded) {
      this.accessCodeRequired.set(
        this.error() === 'Access code required.' || this.error() === 'Invalid access code.'
      );
      return;
    }

    this.accessCodeRequired.set(false);
    const surveyId = this.survey()?.id;
    if (!surveyId) return;

    await this.refreshResults(surveyId);
    this.startLiveSubscription(surveyId);
  }

  private startLiveSubscription(surveyId: string): void {
    const cleanup = this.surveyService.subscribeToSurveyUpdates(
      surveyId,
      () => void this.refreshResults(surveyId),
      (status) => this.isLive.set(status === 'SUBSCRIBED'),
    );
    this.destroyRef.onDestroy(cleanup);
  }
}
