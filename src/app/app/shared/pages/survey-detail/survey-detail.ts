import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  QueryList,
  ViewChildren,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SurveyParticipant, SurveyResult } from '../../../../shared/models/survey.model';
import { SurveyService } from '../../../../shared/services/survey.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { LangService } from '../../../../shared/services/lang.service';
import { GuestService } from '../../../../shared/services/guest.service';
import { ButtonComponent } from '../../ui/button/button';
import { ConfirmDialogComponent } from '../../ui/confirm-dialog/confirm-dialog';
import { ParticipantsPopupComponent } from '../../ui/participants-popup/participants-popup';
import { AuthService } from '../../../../shared/services/auth.service';

/** A question shaped for the survey response UI. */
type QuestionView = {
  id: string;
  index: number;
  text: string;
  description?: string;
  allowMultiple: boolean;
  answers: Array<{ id: string; text: string; optionLabel: string }>;
};

/**
 * Survey detail page: renders questions, collects responses, and shows live results.
 * Supports public and private surveys (share token + access code),
 * demo mode, and real-time result updates after submission.
 * Handles creator tools (edit, duplicate, export, delete) and participant management.
 */
@Component({
  selector: 'app-survey-detail',
  imports: [ButtonComponent, RouterLink, ConfirmDialogComponent, ParticipantsPopupComponent],
  templateUrl: './survey-detail.html',
  styleUrl: './survey-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SurveyDetailComponent implements AfterViewInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly surveyService = inject(SurveyService);
  private readonly authService = inject(AuthService);
  private readonly guestService = inject(GuestService);
  private readonly toastService = inject(ToastService);
  protected readonly langService = inject(LangService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly surveyId = this.route.snapshot.paramMap.get('id');
  private readonly joinToken = this.route.snapshot.paramMap.get('token');
  private readonly joinCode = this.route.snapshot.queryParamMap.get('code');

  protected readonly t = this.langService.t;

  // ── Service-derived state ─────────────────────────────────────────────────

  protected readonly survey = computed(() => this.surveyService.currentSurvey());
  protected readonly loading = computed(() => this.surveyService.loading());
  protected readonly error = computed(() => this.surveyService.error());
  protected readonly schemaNotice = computed(() => this.surveyService.schemaNotice());
  protected readonly authUser = computed(() => this.authService.user());
  protected readonly isAnonymous = computed(() => this.survey()?.isAnonymous ?? false);

  // ── Intersection observer for sticky progress bar ─────────────────────────

  @ViewChildren('progressSentinel') private progressSentinels!: QueryList<ElementRef<HTMLElement>>;
  @ViewChildren('progressBar') private progressBars!: QueryList<ElementRef<HTMLElement>>;
  private progressObserver?: IntersectionObserver;

  // ── UI state ──────────────────────────────────────────────────────────────

  protected readonly creatorMenuOpen = signal(false);
  protected readonly creatorActionMessage = signal<string | null>(null);
  protected readonly deletingSurvey = signal(false);
  protected readonly showDeleteConfirm = signal(false);
  protected readonly showCompleteConfirm = signal(false);
  protected readonly exportingCsv = signal(false);
  protected readonly alreadyVoted = signal(false);
  protected readonly submitted = signal(false);
  protected readonly submitting = signal(false);
  protected readonly submitMessage = signal<string | null>(null);
  protected readonly accessCode = signal('');
  protected readonly accessCodeRequired = signal(false);
  protected readonly selectedAnswers = signal<Record<string, string[]>>({});
  protected readonly isInitializing = signal(true);
  protected readonly liveResults = signal<SurveyResult[]>([]);
  protected readonly isLive = signal(false);
  protected readonly resultsLoading = signal(false);
  protected readonly resultsFlash = signal(false);
  protected readonly mobileActiveTab = signal<'form' | 'results'>('form');
  protected readonly participants = signal<SurveyParticipant[]>([]);
  protected readonly participantsOpen = signal(false);
  protected readonly participantsLoading = signal(false);

  // ── Computed ──────────────────────────────────────────────────────────────

  protected readonly isCreatorSurvey = computed(() => {
    const userId = this.authUser()?.id;
    const survey = this.survey();
    return !!(userId && survey && survey.creatorId === userId);
  });

  protected readonly questions = computed<QuestionView[]>(() => {
    const survey = this.survey();
    if (!survey) return [];
    return survey.questions.map((q, idx) => ({
      id: q.id,
      index: idx,
      text: q.text,
      description: q.description,
      allowMultiple: !!q.allowMultiple,
      answers: q.answers.map((a, aIdx) => ({
        id: a.id,
        text: a.text,
        optionLabel: this.optionLabel(aIdx),
      })),
    }));
  });

  protected readonly resultsRows = computed(() => {
    const survey = this.survey();
    if (!survey) return [];
    const resultMap = this.buildResultMap();
    return survey.questions.map((q) => ({
      questionId: q.id,
      questionText: q.text,
      answers: q.answers.map((a, aIdx) => ({
        id: a.id,
        label: this.optionLabel(aIdx),
        percentage: resultMap.get(q.id)?.get(a.id)?.percentage ?? 0,
        count: resultMap.get(q.id)?.get(a.id)?.count ?? 0,
      })),
    }));
  });

  protected readonly hasResults = computed(() =>
    this.resultsRows().some((row) => row.answers.some((a) => a.count > 0))
  );

  protected readonly answerPercentageMap = computed(() => {
    const map = new Map<string, number>();
    for (const row of this.resultsRows()) {
      for (const answer of row.answers) {
        map.set(`${row.questionId}:${answer.id}`, answer.percentage);
      }
    }
    return map;
  });

  /** Returns the result percentage for a specific answer option. */
  protected answerPct(questionId: string, answerId: string): number {
    return this.answerPercentageMap().get(`${questionId}:${answerId}`) ?? 0;
  }

  protected readonly isSurveyEnded = computed(() => {
    const endsAt = this.survey()?.endsAt;
    return endsAt ? new Date(endsAt) < new Date() : false;
  });

  protected readonly totalQuestionsCount = computed(() => this.survey()?.questions.length ?? 0);

  protected readonly answeredQuestionsCount = computed(() =>
    Object.values(this.selectedAnswers()).filter((ids) => ids.length > 0).length
  );

  protected readonly participantCount = signal(0);

  protected readonly formattedEndsAt = computed(() => {
    const endsAt = this.survey()?.endsAt;
    if (!endsAt) return this.t()('noEndDate');
    const date = new Date(endsAt);
    if (Number.isNaN(date.getTime())) return this.t()('noEndDate');
    return new Intl.DateTimeFormat(
      this.langService.lang() === 'de' ? 'de-DE' : 'en-GB',
      { day: '2-digit', month: '2-digit', year: 'numeric' }
    ).format(date);
  });

  // ── Constructor ───────────────────────────────────────────────────────────

  constructor() {
    const load = this.surveyId
      ? this.loadSurveyContext(this.surveyId)
      : this.joinToken
      ? this.loadSurveyByJoinToken(this.joinToken, this.joinCode ?? undefined)
      : Promise.resolve();
    void load.finally(() => this.isInitializing.set(false));
    effect(() => this.flashResultsOnChange());
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  /** Wires up the IntersectionObserver for the sticky progress bar after the view renders. */
  ngAfterViewInit(): void {
    this.progressSentinels.changes.subscribe(() => this.setupProgressObserver());
    this.setupProgressObserver();
  }

  // ── Creator actions ───────────────────────────────────────────────────────

  /** Toggles the creator action menu open/closed. */
  protected toggleCreatorMenu(): void {
    this.creatorMenuOpen.update((open) => !open);
  }

  /** Copies the survey's share link to the clipboard. */
  protected async copyCreatorLink(): Promise<void> {
    const shareToken = this.survey()?.shareToken;
    this.creatorMenuOpen.set(false);
    if (!shareToken || !navigator.clipboard) {
      this.creatorActionMessage.set('No share link available for this survey.');
      return;
    }
    await this.writeShareLinkToClipboard(shareToken);
  }

  /** Navigates to the home page with an `edit` query param to open the edit modal. */
  protected editCurrentSurvey(): void {
    const surveyId = this.survey()?.id;
    if (!surveyId) return;
    this.creatorMenuOpen.set(false);
    void this.router.navigate(['/'], { queryParams: { edit: surveyId } });
  }

  /** Navigates to the home page with a `duplicate` query param to open the duplicate modal. */
  protected duplicateCurrentSurvey(): void {
    const surveyId = this.survey()?.id;
    if (!surveyId) return;
    this.creatorMenuOpen.set(false);
    void this.router.navigate(['/'], { queryParams: { duplicate: surveyId } });
  }

  /** Exports all survey responses as a downloadable CSV file. */
  protected async exportResultsCsv(): Promise<void> {
    const survey = this.survey();
    if (!survey || this.exportingCsv()) return;
    this.exportingCsv.set(true);
    this.creatorMenuOpen.set(false);
    try {
      const csv = await this.surveyService.buildResultsCsv(survey.id);
      this.downloadCsvFile(csv, survey.title);
    } catch {
      this.creatorActionMessage.set('Export failed. Please try again.');
    } finally {
      this.exportingCsv.set(false);
    }
  }

  /** Opens the delete confirmation dialog. */
  protected openDeleteConfirm(): void {
    this.creatorMenuOpen.set(false);
    this.showDeleteConfirm.set(true);
  }

  /** Dismisses the delete confirmation dialog without deleting. */
  protected cancelDelete(): void {
    this.showDeleteConfirm.set(false);
  }

  /** Deletes the survey and navigates home on success. */
  protected async deleteCurrentSurvey(): Promise<void> {
    const survey = this.survey();
    if (!survey || this.deletingSurvey()) return;
    this.deletingSurvey.set(true);
    const deleted = await this.surveyService.deleteSurvey(survey.id);
    this.deletingSurvey.set(false);
    this.showDeleteConfirm.set(false);
    if (!deleted) { this.toastService.error(this.error() ?? 'Could not delete survey.'); return; }
    this.toastService.success('Survey deleted.');
    void this.router.navigate(['/']);
  }

  // ── Response / voting ─────────────────────────────────────────────────────

  /** Toggles the selected state of an answer option. */
  protected toggleAnswer(questionId: string, answerId: string, allowMultiple: boolean): void {
    this.selectedAnswers.update((state) => {
      const current = state[questionId] ?? [];
      if (!allowMultiple) {
        return { ...state, [questionId]: current.includes(answerId) ? [] : [answerId] };
      }
      const updated = current.includes(answerId)
        ? current.filter((id) => id !== answerId)
        : [...current, answerId];
      return { ...state, [questionId]: updated };
    });
  }

  /** Returns true when the given answer is currently selected. */
  protected isSelected(questionId: string, answerId: string): boolean {
    return (this.selectedAnswers()[questionId] ?? []).includes(answerId);
  }

  /** Opens the submit confirmation dialog, or shows an error if nothing is selected. */
  protected openCompleteConfirm(): void {
    const hasAnswers = Object.values(this.selectedAnswers()).some((ids) => ids.length > 0);
    if (!hasAnswers) { this.submitMessage.set(this.t()('selectAtLeastOne')); return; }
    this.showCompleteConfirm.set(true);
  }

  /** Dismisses the submit confirmation dialog without submitting. */
  protected cancelCompleteConfirm(): void {
    this.showCompleteConfirm.set(false);
  }

  /** Submits the user's answers and updates the UI to show results. */
  protected async completeSurvey(): Promise<void> {
    this.showCompleteConfirm.set(false);
    if (!this.validateBeforeSubmit()) return;
    this.submitting.set(true);
    const survey = this.survey();
    const saved = await this.surveyService.submitSurveyResponse({
      surveyId: survey!.id,
      answers: this.buildAnswerPayload(),
      respondentName: this.resolveRespondentName(),
    });
    if (!saved) { this.handleSubmitError(); return; }
    await this.handleSubmitSuccess(survey!.id);
  }

  /** Checks survey existence and answers before submission. Sets error if invalid. */
  private validateBeforeSubmit(): boolean {
    const survey = this.survey();
    if (!survey) { this.submitMessage.set(this.t()('responseError')); return false; }
    if (this.buildAnswerPayload().length === 0) { this.submitMessage.set(this.t()('selectAtLeastOne')); return false; }
    this.submitMessage.set(null);
    return true;
  }

  // ── Navigation & sharing ──────────────────────────────────────────────────

  /** Navigates back to the home page. */
  protected goHome(): void {
    void this.router.navigate(['/']);
  }

  /** Toggles the results panel open/closed on desktop. */
  protected toggleResults(): void {
    this.resultsOpen.update((v) => !v);
  }
  private readonly resultsOpen = signal(true);

  /** Switches between the form and results tabs on mobile. */
  protected switchTab(tab: 'form' | 'results'): void {
    this.mobileActiveTab.set(tab);
  }

  /** Copies the survey's public share link to the clipboard. */
  protected async copyShareLink(): Promise<void> {
    const shareToken = this.survey()?.shareToken;
    if (!shareToken || !navigator.clipboard) {
      this.toastService.error('No share link available.');
      return;
    }
    await this.writeShareLinkToClipboard(shareToken);
  }

  /** Loads participants lazily and opens the popup. */
  protected async openParticipants(): Promise<void> {
    const surveyId = this.survey()?.id;
    if (!surveyId) return;
    this.participantsLoading.set(true);
    const list = await this.surveyService.loadSurveyParticipants(surveyId);
    this.participants.set(list);
    this.participantsLoading.set(false);
    this.participantsOpen.set(true);
  }

  /** Closes the participants popup. */
  protected closeParticipants(): void {
    this.participantsOpen.set(false);
  }

  /** Updates the access code input value in state. */
  protected updateAccessCode(value: string): void {
    this.accessCode.set(value);
  }

  /** Submits the entered access code to reload the private survey. */
  protected applyAccessCode(): void {
    if (!this.joinToken) return;
    const code = this.accessCode().trim();
    if (!code) return;
    void this.loadSurveyByJoinToken(this.joinToken, code);
  }

  // ── Private: progress bar observer ───────────────────────────────────────

  private setupProgressObserver(): void {
    this.progressObserver?.disconnect();
    const sentinel = this.progressSentinels.first?.nativeElement;
    const bar = this.progressBars.first?.nativeElement;
    if (!sentinel || !bar) return;
    this.progressObserver = new IntersectionObserver(
      ([entry]) => bar.classList.toggle('is-stuck', !entry.isIntersecting),
      { threshold: 0, rootMargin: '0px' }
    );
    this.progressObserver.observe(sentinel);
    this.destroyRef.onDestroy(() => this.progressObserver?.disconnect());
  }

  // ── Private: data loading ─────────────────────────────────────────────────

  private async loadSurveyContext(surveyId: string): Promise<void> {
    await this.surveyService.loadSurveyById(surveyId);
    this.participantCount.set(this.surveyService.currentSurvey()?.totalResponses ?? 0);
    await this.refreshResults(surveyId);
    const userId = this.authUser()?.id;
    const voted = userId
      ? await this.surveyService.checkUserHasResponded(surveyId, userId)
      : this.surveyService.hasAlreadyVoted(surveyId);
    this.alreadyVoted.set(voted);
    if (voted) this.selectedAnswers.set(this.surveyService.getPreviousAnswers(surveyId));
    this.startLiveSubscription(surveyId);
  }

  private async refreshResults(surveyId: string): Promise<void> {
    this.resultsLoading.set(true);
    const [results, count] = await Promise.all([
      this.surveyService.loadSurveyResults(surveyId, true),
      this.surveyService.loadParticipantCount(surveyId),
    ]);
    this.liveResults.set(results);
    this.participantCount.set(count);
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

  // ── Private: submit helpers ───────────────────────────────────────────────

  /** Returns the display name of the current user (auth or guest), or null if anonymous. */
  private resolveRespondentName(): string | null {
    return this.authService.displayName() ?? this.guestService.guestName();
  }

  private buildAnswerPayload() {
    return Object.entries(this.selectedAnswers())
      .filter(([, ids]) => ids.length > 0)
      .map(([questionId, selectedAnswerIds]) => ({ questionId, selectedAnswerIds }));
  }

  private handleSubmitError(): void {
    this.submitMessage.set(this.error() ?? this.t()('responseError'));
    this.submitting.set(false);
  }

  private async handleSubmitSuccess(surveyId: string): Promise<void> {
    this.surveyService.savePreviousAnswers(surveyId, this.selectedAnswers());
    await this.refreshResults(surveyId);
    this.submitted.set(true);
    this.alreadyVoted.set(true);
    this.submitMessage.set(this.t()('responseSaved'));
    this.toastService.success(this.t()('responseSavedToast'));
    this.submitting.set(false);
  }

  // ── Private: creator action helpers ──────────────────────────────────────

  private async writeShareLinkToClipboard(shareToken: string): Promise<void> {
    const link = `${window.location.origin}/join/${shareToken}`;
    try {
      await navigator.clipboard.writeText(link);
      this.toastService.success(this.t()('shareLinkCopied'));
    } catch {
      this.toastService.error(this.t()('shareLinkFailed'));
    }
  }

  private downloadCsvFile(csv: string, title: string): void {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_results.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // ── Private: result map & flash ───────────────────────────────────────────

  /**
   * Builds a questionId → answerId → answer-data map for result rendering.
   * When the user has not yet voted, selected answers are speculatively included.
   */
  private buildResultMap() {
    const base = this.liveResults();
    const selections = (!this.alreadyVoted() && !this.submitted()) ? this.selectedAnswers() : {};
    const hasSelections = Object.values(selections).some((ids) => ids.length > 0);
    if (!hasSelections) {
      return new Map(base.map((r) => [r.questionId, new Map(r.answers.map((a) => [a.id, a]))]));
    }
    return new Map(base.map((r) => this.buildPreviewResultEntry(r, selections)));
  }

  private buildPreviewResultEntry(
    r: { questionId: string; answers: Array<{ id: string; count: number; percentage: number; text: string }> },
    selections: Record<string, string[]>,
  ) {
    const selectedIds = selections[r.questionId] ?? [];
    const augmented = r.answers.map((a) => ({
      ...a, count: a.count + (selectedIds.includes(a.id) ? 1 : 0),
    }));
    const total = augmented.reduce((sum, a) => sum + a.count, 0);
    const previewed = augmented.map((a) => ({
      ...a, percentage: total > 0 ? Math.round((a.count / total) * 100) : 0,
    }));
    return [r.questionId, new Map(previewed.map((a) => [a.id, a]))] as const;
  }

  private flashResultsOnChange(): void {
    const results = this.liveResults();
    if (results.some((r) => r.answers.some((a) => a.count > 0))) {
      this.resultsFlash.set(true);
      setTimeout(() => this.resultsFlash.set(false), 700);
    }
  }

  // ── Private: utilities ────────────────────────────────────────────────────

  private optionLabel(index: number): string {
    return String.fromCharCode(65 + index);
  }
}
