import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  signal,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ButtonComponent } from '../../ui/button/button';
import { HighlightCardComponent } from '../../ui/highlight-card/highlight-card';
import { SurveyListViewComponent } from '../../ui/survey-list-view/survey-list-view';
import { DropdownMenuComponent } from '../../ui/dropdown-menu/dropdown-menu';
import { SurveyService } from '../../../../shared/services/survey.service';
import { CreateSurveyDTO, Survey as AppSurvey, UpdateSurveyDTO } from '../../../../shared/models/survey.model';
import { AuthService } from '../../../../shared/services/auth.service';
import { GuestService } from '../../../../shared/services/guest.service';
import { LangService } from '../../../../shared/services/lang.service';
import { ToastService } from '../../../../shared/services/toast.service';

type SurveyStatus = 'active' | 'past' | 'all';
type CategoryFilter = string | 'all' | 'my-surveys';
type SortKey = 'newest' | 'oldest' | 'az' | 'za';
type BadgeTone = 'active' | 'expiring' | 'ended' | 'none';

type Survey = {
  id: string;
  creatorId: string;
  creatorEmail?: string;
  category: string;
  title: string;
  badgeLabel: string;
  badgeTone: BadgeTone;
  status: SurveyStatus;
  tone?: 'base' | 'muted';
  description?: string;
  visibility?: 'public' | 'private';
  shareToken?: string;
  accessCode?: string;
  endsAt?: string;
  createdAt: string;
  questions: AppSurvey['questions'];
  responseCount: number;
};

const SORT_KEYS: SortKey[] = ['newest', 'oldest', 'az', 'za'];

@Component({
  selector: 'app-home',
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    HighlightCardComponent,
    SurveyListViewComponent,
    DropdownMenuComponent,
  ],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly surveyService = inject(SurveyService);
  private readonly authService = inject(AuthService);
  protected readonly guestService = inject(GuestService);
  protected readonly langService = inject(LangService);
  private readonly toastService = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly t = this.langService.t;

  // ── Auth & Guest ─────────────────────────────────────────────────────────

  protected readonly authInitialized = computed(() => this.authService.initialized());
  protected readonly authUser = computed(() => this.authService.user());
  protected readonly authDisplayName = computed(() => this.authService.displayName());
  protected readonly authLoading = computed(() => this.authService.loading());
  protected readonly authError = computed(() => this.authService.error());
  protected readonly authMessage = computed(() => this.authService.message());
  protected readonly needsDisplayName = computed(() => this.authService.needsDisplayName());

  protected readonly canViewSurveys = computed(
    () => !!this.authUser() || this.guestService.isGuest()
  );
  protected readonly canCreateSurvey = computed(() => !!this.authUser());
  protected readonly isGuestMode = computed(
    () => this.guestService.isGuest() && !this.authUser()
  );

  // ── Survey data ──────────────────────────────────────────────────────────

  protected readonly surveysLoading = computed(
    () => this.surveyService.loading() && this.allSurveys().length === 0
  );
  protected readonly createError = computed(() => this.surveyService.error());
  protected readonly createLoading = computed(() => this.surveyService.loading());
  protected readonly schemaNotice = computed(() => this.surveyService.schemaNotice());

  protected readonly allSurveys = computed<Survey[]>(() =>
    (this.canViewSurveys() ? this.surveyService.allSurveys() : []).map((s) =>
      this.mapSurveyToHomeSurvey(s)
    )
  );

  protected readonly mySurveys = computed(() => {
    const userId = this.authUser()?.id;
    if (!userId) return [] as Survey[];
    return this.allSurveys().filter((s) => s.creatorId === userId);
  });

  protected readonly publicSurveys = computed(() => {
    const userId = this.authUser()?.id;
    return this.allSurveys().filter(
      (s) => s.tone === 'base' || (userId !== undefined && s.creatorId === userId)
    );
  });

  // ── Filters & Sort ───────────────────────────────────────────────────────

  protected readonly selectedStatus = signal<SurveyStatus>('all');
  protected readonly selectedCategory = signal<CategoryFilter>('all');
  protected readonly selectedSortKey = signal<SortKey>('newest');
  protected readonly searchQuery = signal('');

  protected readonly sortOptionLabels = computed(() => [
    this.t()('newestFirst'),
    this.t()('oldestFirst'),
    'A → Z',
    'Z → A',
  ]);

  protected readonly selectedSortLabel = computed(
    () => this.sortOptionLabels()[SORT_KEYS.indexOf(this.selectedSortKey())]
  );

  protected readonly filterCategoryOptions = computed<string[]>(() => {
    const base: string[] = [this.t()('all'), ...this.categories];
    if (this.authUser()) return [...base, this.t()('mySurveys')];
    return base;
  });

  protected readonly selectedCategoryLabel = computed(() => {
    const cat = this.selectedCategory();
    if (cat === 'all') return this.t()('all');
    if (cat === 'my-surveys') return this.t()('mySurveys');
    return cat;
  });

  protected readonly endingSoonSurveys = computed(() =>
    this.publicSurveys()
      .filter((s) => s.status === 'active')
      .sort((a, b) => {
        const aDate = a.endsAt ? new Date(a.endsAt).getTime() : Infinity;
        const bDate = b.endsAt ? new Date(b.endsAt).getTime() : Infinity;
        return aDate - bDate;
      })
  );

  protected readonly filteredSurveys = computed(() => {
    const category = this.selectedCategory();
    const isMySurveys = category === 'my-surveys';
    const userId = this.authUser()?.id;

    let filtered: Survey[] = isMySurveys
      ? userId
        ? this.allSurveys().filter((s) => s.creatorId === userId)
        : []
      : this.publicSurveys();

    if (this.selectedStatus() !== 'all') {
      filtered = filtered.filter((s) => s.status === this.selectedStatus());
    }

    if (!isMySurveys && category !== 'all') {
      filtered = filtered.filter(
        (s) => s.category.toLowerCase() === (category as string).toLowerCase()
      );
    }

    const query = this.searchQuery().toLowerCase().trim();
    if (query) {
      filtered = filtered.filter((s) => s.title.toLowerCase().includes(query));
    }

    const sortKey = this.selectedSortKey();
    return [...filtered].sort((a, b) => {
      if (sortKey === 'az') return a.title.localeCompare(b.title);
      if (sortKey === 'za') return b.title.localeCompare(a.title);
      if (sortKey === 'oldest')
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      // newest (default)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  });

  protected readonly categories = [
    'Team Activities',
    'Health & Wellness',
    'Gaming & Entertainment',
    'Education & Learning',
    'Lifestyle & Preferences',
    'Technology & Innovation',
    'Other',
  ];

  // ── Modal state ──────────────────────────────────────────────────────────

  protected readonly createSurveyOpen = signal(false);
  protected readonly editSurveyId = signal<string | null>(null);
  protected readonly pendingEditFromQuery = signal<string | null>(
    this.route.snapshot.queryParamMap.get('edit')
  );
  protected readonly pendingDuplicateFromQuery = signal<string | null>(
    this.route.snapshot.queryParamMap.get('duplicate')
  );
  protected readonly editOpenedFromQuery = signal(false);
  protected readonly duplicateOpenedFromQuery = signal(false);
  protected readonly submitAttempted = signal(false);
  protected readonly publishedShareLink = signal<string | null>(null);
  protected readonly publishSuccessMessage = signal<string | null>(null);
  protected readonly confirmDiscardOpen = signal(false);
  protected readonly previewMode = signal(false);

  protected readonly isEditingSurvey = computed(() => !!this.editSurveyId());
  protected readonly isPrivateSurvey = computed(
    () => this.createSurveyForm.controls.visibility.value === 'private'
  );

  protected readonly hasUnsavedChanges = computed(() => {
    if (!this.createSurveyOpen()) return false;
    const form = this.createSurveyForm.value;
    const title = (form.title ?? '').trim();
    const description = (form.description ?? '').trim();
    const category = (form.category ?? '').trim();
    const hasQuestionContent = (form.questions ?? []).some(
      (q: any) => ((q.questionText ?? '') as string).trim().length > 0
    );
    return title.length > 0 || description.length > 0 || category.length > 0 || hasQuestionContent;
  });

  // ── Auth panel (sign-in dropdown) ────────────────────────────────────────

  protected readonly authPanelOpen = signal(false);
  protected readonly authPanelEmailTouched = signal(false);

  @HostListener('document:keydown.escape')
  protected onEscapeKey(): void {
    if (this.editingDisplayName()) { this.cancelEditName(); return; }
    if (this.authPanelOpen()) { this.closeAuthPanel(); return; }
    if (this.guestModalOpen()) { this.closeGuestModal(); return; }
  }

  protected openAuthPanel(): void {
    this.authService.clearNotices();
    this.authEmailControl.reset('');
    this.authPanelEmailTouched.set(false);
    this.authPanelOpen.set(true);
  }

  protected closeAuthPanel(): void {
    this.authPanelOpen.set(false);
  }

  // ── Guest modal state ────────────────────────────────────────────────────

  protected readonly guestModalOpen = signal(false);
  protected readonly guestNameInput = signal('');
  protected readonly guestNameError = signal(false);

  // ── Form ─────────────────────────────────────────────────────────────────

  protected readonly authEmailControl = this.fb.nonNullable.control('', [
    Validators.required,
    Validators.email,
  ]);
  protected readonly authForm = this.fb.group({ email: this.authEmailControl });
  protected readonly onboardingNameControl = this.fb.nonNullable.control('', [
    Validators.required,
    Validators.maxLength(40),
  ]);
  protected readonly onboardingForm = this.fb.group({ name: this.onboardingNameControl });
  protected readonly onboardingSubmitting = signal(false);

  protected readonly createSurveyForm = this.fb.group({
    title: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(120)]),
    description: this.fb.nonNullable.control('', [Validators.maxLength(300)]),
    endDate: this.fb.nonNullable.control(''),
    category: this.fb.nonNullable.control('', [Validators.required]),
    visibility: this.fb.nonNullable.control<'public' | 'private'>('public'),
    accessCode: this.fb.nonNullable.control('', [Validators.maxLength(40)]),
    questions: this.fb.array([this.buildQuestionGroup()]),
  });

  protected readonly previewData = computed(() => {
    const form = this.createSurveyForm.value;
    return {
      title: form.title?.trim() || 'Untitled survey',
      description: form.description?.trim() || '',
      category: form.category?.trim() || '',
      questions: (form.questions ?? []).map((q: any, qIdx: number) => ({
        index: qIdx,
        text: (q.questionText ?? '').trim() || `Question ${qIdx + 1}`,
        description: (q.questionDescription ?? '').trim(),
        allowMultiple: !!q.allowMultiple,
        answers: (q.answers ?? [])
          .map((a: string, aIdx: number) => ({
            label: String.fromCharCode(65 + aIdx),
            text: (a ?? '').trim(),
          }))
          .filter((a: { label: string; text: string }) => a.text.length > 0),
      })),
    };
  });

  // ── ViewChildren & parallax ──────────────────────────────────────────────

  protected readonly editingDisplayName = signal(false);
  protected readonly displayNameEditValue = signal('');
  protected readonly displayNameSaving = signal(false);

  @ViewChild('carouselTrack') carouselTrackRef?: ElementRef<HTMLDivElement>;
  @ViewChild('heroVisuals') heroVisualsRef?: ElementRef<HTMLElement>;
  @ViewChild('nameEditInput') private nameEditInputRef?: ElementRef<HTMLInputElement>;

  private heroTargetX = 0;
  private heroTargetY = 0;
  private heroCurrX = 0;
  private heroCurrY = 0;
  private heroRafId?: number;

  // ── Constructor ──────────────────────────────────────────────────────────

  constructor() {
    effect(() => {
      if (this.editOpenedFromQuery()) return;
      const targetId = this.pendingEditFromQuery();
      if (!targetId) return;
      const survey = this.mySurveys().find((s) => s.id === targetId);
      if (!survey) return;
      this.openEditSurveyModal(survey.id);
      this.editOpenedFromQuery.set(true);
      this.pendingEditFromQuery.set(null);
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { edit: null },
        queryParamsHandling: 'merge',
      });
    });

    effect(() => {
      if (this.duplicateOpenedFromQuery()) return;
      const targetId = this.pendingDuplicateFromQuery();
      if (!targetId) return;
      const survey = this.allSurveys().find((s) => s.id === targetId);
      if (!survey) return;
      this.openDuplicateSurveyModal(survey.id);
      this.duplicateOpenedFromQuery.set(true);
      this.pendingDuplicateFromQuery.set(null);
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { duplicate: null },
        queryParamsHandling: 'merge',
      });
    });
  }

  // ── Filter handlers ──────────────────────────────────────────────────────

  protected onFilterActive(): void {
    this.selectedStatus.set(this.selectedStatus() === 'active' ? 'all' : 'active');
  }

  protected onFilterPast(): void {
    this.selectedStatus.set(this.selectedStatus() === 'past' ? 'all' : 'past');
  }

  protected onCategoryChange(label: string): void {
    const t = this.t();
    if (label === t('all')) {
      this.selectedCategory.set('all');
    } else if (label === t('mySurveys')) {
      this.selectedCategory.set('my-surveys');
    } else {
      this.selectedCategory.set(label === this.selectedCategoryLabel() ? 'all' : label);
    }
  }

  protected onSortChange(label: string): void {
    const idx = this.sortOptionLabels().indexOf(label);
    if (idx >= 0) this.selectedSortKey.set(SORT_KEYS[idx]);
  }

  protected toggleAllFilters(): void {
    this.selectedStatus.set('all');
    this.selectedCategory.set('all');
  }

  // ── Auth handlers ────────────────────────────────────────────────────────

  protected async sendMagicLink(): Promise<void> {
    this.authPanelEmailTouched.set(true);
    this.authEmailControl.markAsTouched();
    if (this.authEmailControl.invalid) return;
    const ok = await this.authService.sendMagicLink(this.authEmailControl.value.trim());
    if (ok) {
      this.toastService.success(this.t()('magicLinkSent'));
    } else {
      const err = this.authError();
      if (err) this.toastService.error(err);
    }
  }

  protected async submitOnboardingName(): Promise<void> {
    this.onboardingNameControl.markAsTouched();
    const val = this.onboardingNameControl.value.trim();
    if (!val) return;
    this.onboardingSubmitting.set(true);
    await this.authService.updateDisplayName(val);
    this.onboardingSubmitting.set(false);
    this.onboardingNameControl.reset('');
  }

  protected async signOut(): Promise<void> {
    await this.authService.signOut();
  }

  // ── Guest modal ──────────────────────────────────────────────────────────

  protected openGuestModal(): void {
    this.guestNameInput.set('');
    this.guestNameError.set(false);
    this.guestModalOpen.set(true);
  }

  protected closeGuestModal(): void {
    this.guestModalOpen.set(false);
  }

  protected onGuestNameInput(value: string): void {
    this.guestNameInput.set(value);
    if (this.guestNameError()) this.guestNameError.set(false);
  }

  protected confirmGuestMode(): void {
    const name = this.guestNameInput().trim();
    if (!name) {
      this.guestNameError.set(true);
      return;
    }
    this.guestService.startSession(name);
    this.guestModalOpen.set(false);
  }

  protected endGuestMode(): void {
    this.guestService.endSession();
  }

  protected startEditName(): void {
    this.displayNameEditValue.set(this.authDisplayName() ?? '');
    this.editingDisplayName.set(true);
    setTimeout(() => this.nameEditInputRef?.nativeElement?.focus(), 0);
  }

  protected cancelEditName(): void {
    this.editingDisplayName.set(false);
  }

  protected async saveDisplayName(): Promise<void> {
    const val = this.displayNameEditValue().trim();
    if (!val || val === this.authDisplayName()) {
      this.cancelEditName();
      return;
    }
    this.displayNameSaving.set(true);
    await this.authService.updateDisplayName(val);
    this.displayNameSaving.set(false);
    this.editingDisplayName.set(false);
    this.toastService.success(this.t()('nameSaved'));
  }

  protected endGuestModeAndSignIn(): void {
    this.guestService.endSession();
    this.openAuthPanel();
  }

  protected onAuthInputChange(): void {
    if (this.authError()) this.authService.clearNotices();
  }

  // ── Create / Edit modal ──────────────────────────────────────────────────

  protected openCreateSurveyModal(): void {
    if (!this.canCreateSurvey()) return;
    this.surveyService.clearError();
    this.editSurveyId.set(null);
    this.submitAttempted.set(false);
    this.publishedShareLink.set(null);
    this.publishSuccessMessage.set(null);
    this.previewMode.set(false);
    this.resetCreateSurveyForm();
    this.createSurveyOpen.set(true);
  }

  protected requestCloseModal(): void {
    if (this.hasUnsavedChanges() && !this.publishSuccessMessage()) {
      this.confirmDiscardOpen.set(true);
      return;
    }
    this.closeCreateSurveyModal();
  }

  protected confirmDiscard(): void {
    this.confirmDiscardOpen.set(false);
    this.closeCreateSurveyModal();
  }

  protected cancelDiscard(): void {
    this.confirmDiscardOpen.set(false);
  }

  protected closeCreateSurveyModal(): void {
    this.surveyService.clearError();
    this.submitAttempted.set(false);
    this.publishedShareLink.set(null);
    this.publishSuccessMessage.set(null);
    this.editSurveyId.set(null);
    this.previewMode.set(false);
    this.createSurveyOpen.set(false);
    this.confirmDiscardOpen.set(false);
    this.resetCreateSurveyForm();
  }

  // ── Question helpers ─────────────────────────────────────────────────────

  protected get questionsArray(): FormArray {
    return this.createSurveyForm.controls.questions as FormArray;
  }

  protected questionAnswersArray(questionIndex: number): FormArray {
    return this.questionsArray.at(questionIndex).get('answers') as FormArray;
  }

  protected addQuestion(): void {
    this.questionsArray.push(this.buildQuestionGroup());
  }

  protected removeQuestion(questionIndex: number): void {
    if (this.questionsArray.length <= 1) return;
    this.questionsArray.removeAt(questionIndex);
  }

  protected addAnswer(questionIndex: number): void {
    this.questionAnswersArray(questionIndex).push(this.buildAnswerControl());
  }

  protected removeAnswer(questionIndex: number, answerIndex: number): void {
    const answers = this.questionAnswersArray(questionIndex);
    if (answers.length <= 2) return;
    answers.removeAt(answerIndex);
  }

  protected answerLabel(index: number): string {
    return String.fromCharCode(65 + index);
  }

  // ── Publish / Save ───────────────────────────────────────────────────────

  protected async publishSurvey(): Promise<void> {
    this.submitAttempted.set(true);
    this.surveyService.clearError();

    if (this.createSurveyForm.invalid) {
      this.createSurveyForm.markAllAsTouched();
      return;
    }

    const title = this.createSurveyForm.controls.title.value.trim();
    const description = this.createSurveyForm.controls.description.value.trim();
    const category = this.createSurveyForm.controls.category.value.trim();
    const endDateRaw = this.createSurveyForm.controls.endDate.value.trim();
    const visibility = this.createSurveyForm.controls.visibility.value;
    const accessCode = this.createSurveyForm.controls.accessCode.value.trim();

    if (visibility === 'private' && !accessCode) {
      this.submitAttempted.set(true);
      return;
    }

    const dto: CreateSurveyDTO = {
      title,
      description: description || undefined,
      category: category || 'General',
      endsAt: endDateRaw ? new Date(endDateRaw).toISOString() : undefined,
      status: 'published',
      visibility,
      accessCode: visibility === 'private' ? accessCode : undefined,
      questions: this.questionsArray.controls.map((questionControl) => {
        const questionText = (questionControl.get('questionText')?.value as string).trim();
        const questionDescription = (questionControl.get('questionDescription')?.value as string).trim();
        const allowMultiple = !!questionControl.get('allowMultiple')?.value;
        const answersArray = questionControl.get('answers') as FormArray;
        return {
          text: questionText,
          description: questionDescription || undefined,
          type: allowMultiple ? 'checkboxes' : 'multiple_choice',
          allowMultiple,
          answers: answersArray.controls
            .map((c) => ({ text: (c.value as string).trim() }))
            .filter((a) => a.text.length > 0),
        };
      }),
    };

    const editSurveyId = this.editSurveyId();
    if (editSurveyId) {
      const updated = await this.surveyService.updateSurvey(editSurveyId, {
        title: dto.title,
        description: dto.description,
        category: dto.category,
        endsAt: dto.endsAt,
        visibility: dto.visibility,
        accessCode: dto.visibility === 'private' ? dto.accessCode : '',
        status: 'published',
      } satisfies UpdateSurveyDTO);

      if (!updated) return;

      const editedSurvey = this.mySurveys().find((s) => s.id === editSurveyId);
      this.publishedShareLink.set(this.buildShareLink(editedSurvey?.shareToken));
      this.publishSuccessMessage.set(this.t()('surveyUpdated'));
      return;
    }

    const created = await this.surveyService.createSurvey(dto);
    if (!created) return;

    this.publishedShareLink.set(this.buildShareLink(created.shareToken));
    this.publishSuccessMessage.set(
      visibility === 'private' ? this.t()('privatePublished') : this.t()('publicPublished')
    );
  }

  protected async copyPublishedShareLink(): Promise<void> {
    const link = this.publishedShareLink();
    if (!link || typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(link);
      this.publishSuccessMessage.set(this.t()('linkCopied'));
    } catch {
      this.publishSuccessMessage.set(this.t()('copyFailed'));
    }
  }

  protected openEditSurveyModal(surveyId: string): void {
    const survey = this.mySurveys().find((s) => s.id === surveyId);
    if (!survey) return;
    this.surveyService.clearError();
    this.editSurveyId.set(surveyId);
    this.submitAttempted.set(false);
    this.publishSuccessMessage.set(null);
    this.publishedShareLink.set(this.buildShareLink(survey.shareToken));
    this.fillCreateSurveyForm(survey);
    this.createSurveyOpen.set(true);
  }

  protected openDuplicateSurveyModal(surveyId: string): void {
    const survey = this.allSurveys().find((s) => s.id === surveyId);
    if (!survey) return;
    this.surveyService.clearError();
    this.editSurveyId.set(null);
    this.submitAttempted.set(false);
    this.publishedShareLink.set(null);
    this.publishSuccessMessage.set(null);
    this.fillCreateSurveyForm({ ...survey, title: `${survey.title} (Copy)` });
    this.createSurveyOpen.set(true);
  }

  // ── Navigation ───────────────────────────────────────────────────────────

  protected openSurvey(surveyId: string): void {
    void this.router.navigate(['/survey', surveyId]);
  }

  protected async onShareLinkClicked(shareToken: string): Promise<void> {
    const link = `${window.location.origin}/join/${shareToken}`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(link);
        this.toastService.success(this.t()('shareLinkCopied'));
      } catch {
        this.toastService.error(this.t()('shareLinkFailed'));
      }
    }
  }

  // ── Carousel ─────────────────────────────────────────────────────────────

  protected carouselScroll(dir: -1 | 1): void {
    const el = this.carouselTrackRef?.nativeElement;
    if (!el) return;
    const item = el.querySelector('.surveys__carousel-item') as HTMLElement | null;
    const itemWidth = item ? item.offsetWidth + 24 : 340;
    el.scrollBy({ left: dir * itemWidth * 2, behavior: 'smooth' });
  }

  // ── Hero parallax ─────────────────────────────────────────────────────────

  protected onHeroMouseMove(event: MouseEvent): void {
    this.updateHeroTarget(event.clientX, event.clientY);
  }

  protected onHeroMouseLeave(): void {
    this.heroTargetX = 0;
    this.heroTargetY = 0;
    this.scheduleHeroLerp();
  }

  protected onHeroTouchMove(event: TouchEvent): void {
    const touch = event.touches[0];
    if (touch) this.updateHeroTarget(touch.clientX, touch.clientY);
  }

  protected onHeroTouchEnd(): void {
    this.heroTargetX = 0;
    this.heroTargetY = 0;
    this.scheduleHeroLerp();
  }

  private updateHeroTarget(clientX: number, clientY: number): void {
    const el = this.heroVisualsRef?.nativeElement;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    this.heroTargetX = ((clientX - rect.left) / rect.width - 0.5) * 2;
    this.heroTargetY = ((clientY - rect.top) / rect.height - 0.5) * 2;
    this.scheduleHeroLerp();
  }

  private scheduleHeroLerp(): void {
    if (this.heroRafId != null) return;
    const tick = () => {
      const ease = 0.072;
      this.heroCurrX += (this.heroTargetX - this.heroCurrX) * ease;
      this.heroCurrY += (this.heroTargetY - this.heroCurrY) * ease;
      const el = this.heroVisualsRef?.nativeElement;
      if (el) {
        el.style.setProperty('--px', this.heroCurrX.toFixed(4));
        el.style.setProperty('--py', this.heroCurrY.toFixed(4));
      }
      const stillMoving =
        Math.abs(this.heroTargetX - this.heroCurrX) > 0.0008 ||
        Math.abs(this.heroTargetY - this.heroCurrY) > 0.0008;
      if (stillMoving) {
        this.heroRafId = requestAnimationFrame(tick);
      } else {
        this.heroRafId = undefined;
      }
    };
    this.heroRafId = requestAnimationFrame(tick);
  }

  ngOnDestroy(): void {
    if (this.heroRafId != null) cancelAnimationFrame(this.heroRafId);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private buildQuestionGroup(): FormGroup {
    return this.fb.group({
      questionText: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(160)]),
      questionDescription: this.fb.nonNullable.control('', [Validators.maxLength(200)]),
      allowMultiple: this.fb.nonNullable.control(false),
      answers: this.fb.array([this.buildAnswerControl(), this.buildAnswerControl()]),
    });
  }

  private buildAnswerControl(): FormControl<string> {
    return this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(120)]);
  }

  private resetCreateSurveyForm(): void {
    this.createSurveyForm.reset({
      title: '',
      description: '',
      endDate: '',
      category: '',
      visibility: 'public',
      accessCode: '',
    });
    this.createSurveyForm.setControl('questions', this.fb.array([this.buildQuestionGroup()]));
  }

  private fillCreateSurveyForm(survey: Survey): void {
    this.createSurveyForm.reset({
      title: survey.title,
      description: survey.description ?? '',
      endDate: this.toDateInputValue(survey.endsAt),
      category: survey.category,
      visibility: survey.visibility ?? 'public',
      accessCode: survey.accessCode ?? '',
    });

    const questionGroups =
      survey.questions.length > 0
        ? survey.questions.map((q) =>
            this.fb.group({
              questionText: this.fb.nonNullable.control(q.text, [
                Validators.required,
                Validators.maxLength(160),
              ]),
              questionDescription: this.fb.nonNullable.control(q.description ?? '', [
                Validators.maxLength(200),
              ]),
              allowMultiple: this.fb.control({ value: !!q.allowMultiple, disabled: true }),
              answers: this.fb.array(
                q.answers.map((a) =>
                  this.fb.nonNullable.control(a.text, [Validators.required, Validators.maxLength(120)])
                )
              ),
            })
          )
        : [this.buildQuestionGroup()];

    this.createSurveyForm.setControl('questions', this.fb.array(questionGroups));
  }

  private buildShareLink(shareToken?: string): string | null {
    return shareToken && typeof window !== 'undefined'
      ? `${window.location.origin}/join/${shareToken}`
      : null;
  }

  private toDateInputValue(isoDate?: string): string {
    if (!isoDate) return '';
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
  }

  private toBadgeLabel(endDate: Date | null): string {
    if (!endDate) return this.t()('noEndDate');
    const now = new Date();
    const delta = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (delta < 0) {
      const abs = Math.abs(delta);
      return this.langService.lang() === 'de'
        ? `Vor ${abs} Tag${abs === 1 ? '' : 'en'} beendet`
        : `Ended ${abs} day${abs === 1 ? '' : 's'} ago`;
    }
    return this.langService.lang() === 'de'
      ? `Endet in ${delta} Tag${delta === 1 ? '' : 'en'}`
      : `Ends in ${delta} day${delta === 1 ? '' : 's'}`;
  }

  private mapSurveyToHomeSurvey(survey: AppSurvey): Survey {
    const now = new Date();
    const endsAt = new Date(survey.endsAt);
    const validDate = !Number.isNaN(endsAt.getTime());
    const isPast = validDate && endsAt.getTime() < now.getTime();
    const daysLeft = validDate
      ? Math.ceil((endsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;

    let badgeTone: BadgeTone = 'none';
    if (isPast) badgeTone = 'ended';
    else if (daysLeft !== null && daysLeft <= 3) badgeTone = 'expiring';
    else if (validDate) badgeTone = 'active';

    return {
      id: survey.id,
      creatorId: survey.creatorId,
      creatorEmail: survey.creatorEmail,
      category: survey.category,
      title: survey.title,
      description: survey.description,
      badgeLabel: this.toBadgeLabel(validDate ? endsAt : null),
      badgeTone,
      status: survey.status === 'published' && !isPast ? 'active' : 'past',
      tone: survey.status === 'published' && !isPast ? 'base' : 'muted',
      visibility: survey.visibility,
      shareToken: survey.shareToken,
      accessCode: survey.accessCode,
      endsAt: survey.endsAt,
      createdAt: survey.createdAt,
      questions: survey.questions,
      responseCount: survey.totalResponses,
    };
  }
}
