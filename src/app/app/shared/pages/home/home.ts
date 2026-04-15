import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
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

type SurveyStatus = 'active' | 'past' | 'all';
type CategoryFilter = string | 'all';

type Survey = {
  id: string;
  creatorId: string;
  creatorEmail?: string;
  category: string;
  title: string;
  badgeLabel: string;
  status: SurveyStatus;
  tone?: 'base' | 'muted';
  description?: string;
  visibility?: 'public' | 'private';
  shareToken?: string;
  accessCode?: string;
  endsAt?: string;
  questions: AppSurvey['questions'];
};

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
export class HomeComponent {
  private readonly fb = inject(FormBuilder);
  private readonly surveyService = inject(SurveyService);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  // State signals
  protected readonly selectedStatus = signal<SurveyStatus>('all');
  protected readonly selectedCategory = signal<CategoryFilter>('all');
  protected readonly selectedSort = signal('Newest first');
  protected readonly searchQuery = signal('');
  protected readonly surveysLoading = computed(
    () => this.surveyService.loading() && this.allSurveys().length === 0
  );
  protected readonly createSurveyOpen = signal(false);
  protected readonly editSurveyId = signal<string | null>(null);
  protected readonly pendingEditFromQuery = signal<string | null>(this.route.snapshot.queryParamMap.get('edit'));
  protected readonly editOpenedFromQuery = signal(false);
  protected readonly submitAttempted = signal(false);
  protected readonly isDemoMode = signal(this.route.snapshot.routeConfig?.path === 'demo');
  protected readonly canViewSurveys = computed(() => this.isDemoMode() || !!this.authUser());
  protected readonly canCreateSurvey = computed(() => !!this.authUser());
  protected readonly isEditingSurvey = computed(() => !!this.editSurveyId());
  protected readonly publishedShareLink = signal<string | null>(null);
  protected readonly publishSuccessMessage = signal<string | null>(null);
  protected readonly guestModeLabel = computed(() =>
    this.isDemoMode() ? 'Gastmodus beenden' : 'Gastmodus'
  );
  protected readonly createError = computed(() => this.surveyService.error());
  protected readonly createLoading = computed(() => this.surveyService.loading());
  protected readonly schemaNotice = computed(() => this.surveyService.schemaNotice());
  protected readonly authUser = computed(() => this.authService.user());
  protected readonly authLoading = computed(() => this.authService.loading());
  protected readonly authError = computed(() => this.authService.error());
  protected readonly authMessage = computed(() => this.authService.message());

  protected readonly authEmailControl = this.fb.nonNullable.control('', [
    Validators.required,
    Validators.email,
  ]);

  protected readonly createSurveyForm = this.fb.group({
    title: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(120)]),
    description: this.fb.nonNullable.control('', [Validators.maxLength(300)]),
    endDate: this.fb.nonNullable.control(''),
    category: this.fb.nonNullable.control('', [Validators.required]),
    visibility: this.fb.nonNullable.control<'public' | 'private'>('public'),
    accessCode: this.fb.nonNullable.control('', [Validators.maxLength(40)]),
    questions: this.fb.array([this.buildQuestionGroup()]),
  });

  protected readonly allSurveys = computed<Survey[]>(() =>
    (this.canViewSurveys()
      ? (this.isDemoMode() ? this.surveyService.getDemoSurveys() : this.surveyService.allSurveys())
      : []
    ).map((survey) => this.mapSurveyToHomeSurvey(survey))
  );

  protected readonly mySurveys = computed(() => {
    const userId = this.authUser()?.id;
    if (!userId || this.isDemoMode()) {
      return [] as Survey[];
    }

    return this.allSurveys().filter((survey) => survey.creatorId === userId);
  });

  protected readonly publicSurveys = computed(() => {
    if (this.isDemoMode()) {
      return this.allSurveys();
    }

    return this.allSurveys().filter((survey) => survey.tone === 'base');
  });

  // Categories for dropdown
  protected readonly categories = [
    'Team Activities',
    'Health & Wellness',
    'Gaming & Entertainment',
    'Education & Learning',
    'Lifestyle & Preferences',
    'Technology & Innovation',
  ];

  protected readonly sortOptions = ['Newest first', 'Oldest first', 'A → Z', 'Z → A'];

  // Computed: Ending soon surveys (erste 3 active)
  protected readonly endingSoonSurveys = computed(() =>
    this.publicSurveys()
      .filter((s) => s.status === 'active')
      .slice(0, 3)
  );

  // Computed: Filtered and sorted surveys
  protected readonly filteredSurveys = computed(() => {
    let filtered = this.publicSurveys();

    // Filter nach Status
    if (this.selectedStatus() !== 'all') {
      filtered = filtered.filter((s) => s.status === this.selectedStatus());
    }

    // Filter nach Kategorie
    if (this.selectedCategory() !== 'all') {
      filtered = filtered.filter(
        (s) => s.category.toLowerCase() === (this.selectedCategory() as string).toLowerCase()
      );
    }

    // Suche
    const query = this.searchQuery().toLowerCase().trim();
    if (query) {
      filtered = filtered.filter((s) => s.title.toLowerCase().includes(query));
    }

    // Sortierung
    const sort = this.selectedSort();
    return [...filtered].sort((a, b) => {
      if (sort === 'A → Z') return a.title.localeCompare(b.title);
      if (sort === 'Z → A') return b.title.localeCompare(a.title);
      if (sort === 'Oldest first') return new Date(a.endsAt ?? 0).getTime() - new Date(b.endsAt ?? 0).getTime();
      // Default: Newest first
      return new Date(b.endsAt ?? 0).getTime() - new Date(a.endsAt ?? 0).getTime();
    });
  });

  constructor() {
    effect(() => {
      if (this.editOpenedFromQuery()) {
        return;
      }

      const targetId = this.pendingEditFromQuery();
      if (!targetId) {
        return;
      }

      const survey = this.mySurveys().find((entry) => entry.id === targetId);
      if (!survey) {
        return;
      }

      this.openEditSurveyModal(survey.id);
      this.editOpenedFromQuery.set(true);
      this.pendingEditFromQuery.set(null);
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { edit: null },
        queryParamsHandling: 'merge',
      });
    });
  }

  // Methods for filter interaction
  protected onFilterActive(): void {
    this.selectedStatus.set(this.selectedStatus() === 'active' ? 'all' : 'active');
  }

  protected onFilterPast(): void {
    this.selectedStatus.set(this.selectedStatus() === 'past' ? 'all' : 'past');
  }

  protected onCategoryChange(category: string): void {
    this.selectedCategory.set(category === this.selectedCategory() ? 'all' : category);
  }

  protected onSortChange(sort: string): void {
    this.selectedSort.set(sort);
  }

  protected toggleAllFilters(): void {
    this.selectedStatus.set('all');
    this.selectedCategory.set('all');
  }

  protected openCreateSurveyModal(): void {
    if (!this.canCreateSurvey()) {
      this.authService.clearNotices();
      return;
    }

    this.surveyService.clearError();
    this.editSurveyId.set(null);
    this.submitAttempted.set(false);
    this.publishedShareLink.set(null);
    this.publishSuccessMessage.set(null);
    this.resetCreateSurveyForm();
    this.createSurveyOpen.set(true);
  }

  protected async sendMagicLink(): Promise<void> {
    this.authEmailControl.markAsTouched();
    if (this.authEmailControl.invalid) {
      return;
    }

    const email = this.authEmailControl.value.trim();
    await this.authService.sendMagicLink(email);
  }

  protected async signOut(): Promise<void> {
    await this.authService.signOut();
  }

  protected closeCreateSurveyModal(): void {
    this.surveyService.clearError();
    this.submitAttempted.set(false);
    this.publishedShareLink.set(null);
    this.publishSuccessMessage.set(null);
    this.editSurveyId.set(null);
    this.createSurveyOpen.set(false);
    this.resetCreateSurveyForm();
  }

  protected readonly isPrivateSurvey = computed(
    () => this.createSurveyForm.controls.visibility.value === 'private'
  );

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
    if (this.questionsArray.length <= 1) {
      return;
    }
    this.questionsArray.removeAt(questionIndex);
  }

  protected addAnswer(questionIndex: number): void {
    this.questionAnswersArray(questionIndex).push(this.buildAnswerControl());
  }

  protected removeAnswer(questionIndex: number, answerIndex: number): void {
    const answers = this.questionAnswersArray(questionIndex);
    if (answers.length <= 2) {
      return;
    }
    answers.removeAt(answerIndex);
  }

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
      this.surveyService.clearError();
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
            .map((answerControl) => ({ text: (answerControl.value as string).trim() }))
            .filter((answer) => answer.text.length > 0),
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

      if (!updated) {
        return;
      }

      const editedSurvey = this.mySurveys().find((survey) => survey.id === editSurveyId);
      this.publishedShareLink.set(this.buildShareLink(editedSurvey?.shareToken));
      this.publishSuccessMessage.set('Survey updated. The share link remains active.');
      return;
    }

    const created = await this.surveyService.createSurvey(dto);
    if (!created) {
      return;
    }

    const shareLink = this.buildShareLink(created.shareToken);

    this.publishedShareLink.set(shareLink);
    this.publishSuccessMessage.set(
      visibility === 'private'
        ? 'Private survey published. Share this link with the access code.'
        : 'Survey published. Share this link with participants.'
    );
  }

  protected async copyPublishedShareLink(): Promise<void> {
    const link = this.publishedShareLink();
    if (!link || typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }

    try {
      await navigator.clipboard.writeText(link);
      this.publishSuccessMessage.set('Share link copied to clipboard.');
    } catch {
      this.publishSuccessMessage.set('Could not copy link automatically.');
    }
  }

  protected openEditSurveyModal(surveyId: string): void {
    const survey = this.mySurveys().find((entry) => entry.id === surveyId);
    if (!survey) {
      return;
    }

    this.surveyService.clearError();
    this.editSurveyId.set(surveyId);
    this.submitAttempted.set(false);
    this.publishSuccessMessage.set(null);
    this.publishedShareLink.set(this.buildShareLink(survey.shareToken));
    this.fillCreateSurveyForm(survey);
    this.createSurveyOpen.set(true);
  }

  protected answerLabel(index: number): string {
    return String.fromCharCode(65 + index);
  }

  protected openSurvey(surveyId: string): void {
    void this.router.navigate(['/survey', surveyId]);
  }

  protected openDemo(): void {
    void this.router.navigate([this.isDemoMode() ? '/' : '/demo']);
  }

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

    const questionGroups = survey.questions.length > 0
      ? survey.questions.map((question) => this.fb.group({
          questionText: this.fb.nonNullable.control(question.text, [Validators.required, Validators.maxLength(160)]),
          questionDescription: this.fb.nonNullable.control(question.description ?? '', [Validators.maxLength(200)]),
          allowMultiple: this.fb.nonNullable.control(!!question.allowMultiple),
          answers: this.fb.array(
            question.answers.map((answer) =>
              this.fb.nonNullable.control(answer.text, [Validators.required, Validators.maxLength(120)])
            )
          ),
        }))
      : [this.buildQuestionGroup()];

    this.createSurveyForm.setControl('questions', this.fb.array(questionGroups));
  }

  private buildShareLink(shareToken?: string): string | null {
    return shareToken && typeof window !== 'undefined'
      ? `${window.location.origin}/join/${shareToken}`
      : null;
  }

  private toDateInputValue(isoDate?: string): string {
    if (!isoDate) {
      return '';
    }

    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    return date.toISOString().slice(0, 10);
  }

  private toBadgeLabel(endDate: Date | null): string {
    if (!endDate) {
      return 'No end date';
    }

    const now = new Date();
    const delta = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (delta < 0) {
      return `Ended ${Math.abs(delta)} day${Math.abs(delta) === 1 ? '' : 's'} ago`;
    }
    return `Ends in ${delta} day${delta === 1 ? '' : 's'}`;
  }

  private mapSurveyToHomeSurvey(survey: AppSurvey): Survey {
    const now = new Date();
    const endsAt = new Date(survey.endsAt);
    const isPast = !Number.isNaN(endsAt.getTime()) && endsAt.getTime() < now.getTime();

    return {
      id: survey.id,
      creatorId: survey.creatorId,
      creatorEmail: survey.creatorEmail,
      category: survey.category,
      title: survey.title,
      description: survey.description,
      badgeLabel: this.toBadgeLabel(Number.isNaN(endsAt.getTime()) ? null : endsAt),
      status: survey.status === 'published' && !isPast ? 'active' : 'past',
      tone: survey.status === 'published' && !isPast ? 'base' : 'muted',
      visibility: survey.visibility,
      shareToken: survey.shareToken,
      accessCode: survey.accessCode,
      endsAt: survey.endsAt,
      questions: survey.questions,
    };
  }
}
