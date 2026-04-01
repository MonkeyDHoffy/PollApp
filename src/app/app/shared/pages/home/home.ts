import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
import { CreateSurveyDTO } from '../../../../shared/models/survey.model';

type SurveyStatus = 'active' | 'past' | 'all';
type CategoryFilter = string | 'all';

type Survey = {
  id: string;
  category: string;
  title: string;
  badgeLabel: string;
  status: SurveyStatus;
  tone?: 'base' | 'muted';
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

  // State signals
  protected readonly selectedStatus = signal<SurveyStatus>('all');
  protected readonly selectedCategory = signal<CategoryFilter>('all');
  protected readonly createSurveyOpen = signal(false);
  protected readonly submitAttempted = signal(false);
  protected readonly createError = computed(() => this.surveyService.error());
  protected readonly createLoading = computed(() => this.surveyService.loading());

  protected readonly createSurveyForm = this.fb.group({
    title: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(120)]),
    description: this.fb.nonNullable.control('', [Validators.maxLength(300)]),
    endDate: this.fb.nonNullable.control(''),
    category: this.fb.nonNullable.control('', [Validators.required]),
    questions: this.fb.array([this.buildQuestionGroup()]),
  });

  protected readonly allSurveys = computed<Survey[]>(() =>
    this.surveyService.allSurveys().map((survey) => this.mapSurveyToHomeSurvey(survey))
  );

  // Categories for dropdown
  protected readonly categories = [
    'Team Activities',
    'Health & Wellness',
    'Gaming & Entertainment',
    'Education & Learning',
    'Lifestyle & Preferences',
    'Technology & Innovation',
  ];

  // Computed: Ending soon surveys (erste 3 active)
  protected readonly endingSoonSurveys = computed(() =>
    this.allSurveys()
      .filter((s) => s.status === 'active')
      .slice(0, 3)
  );

  // Computed: Filtered surveys based on selected status and category
  protected readonly filteredSurveys = computed(() => {
    let filtered = this.allSurveys();

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

    return filtered;
  });

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

  protected toggleAllFilters(): void {
    this.selectedStatus.set('all');
    this.selectedCategory.set('all');
  }

  protected openCreateSurveyModal(): void {
    this.surveyService.clearError();
    this.submitAttempted.set(false);
    this.createSurveyOpen.set(true);
  }

  protected closeCreateSurveyModal(): void {
    this.surveyService.clearError();
    this.submitAttempted.set(false);
    this.createSurveyOpen.set(false);
    this.resetCreateSurveyForm();
  }

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

    const dto: CreateSurveyDTO = {
      title,
      description: description || undefined,
      category: category || 'General',
      endsAt: endDateRaw ? new Date(endDateRaw).toISOString() : undefined,
      status: 'published',
      questions: this.questionsArray.controls.map((questionControl) => {
        const questionText = (questionControl.get('questionText')?.value as string).trim();
        const allowMultiple = !!questionControl.get('allowMultiple')?.value;
        const answersArray = questionControl.get('answers') as FormArray;

        return {
          text: questionText,
          type: allowMultiple ? 'checkboxes' : 'multiple_choice',
          allowMultiple,
          answers: answersArray.controls
            .map((answerControl) => ({ text: (answerControl.value as string).trim() }))
            .filter((answer) => answer.text.length > 0),
        };
      }),
    };

    const surveyId = await this.surveyService.createSurvey(dto);
    if (!surveyId) {
      return;
    }

    this.closeCreateSurveyModal();
  }

  protected answerLabel(index: number): string {
    return String.fromCharCode(65 + index);
  }

  private buildQuestionGroup(): FormGroup {
    return this.fb.group({
      questionText: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(160)]),
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
    });
    this.createSurveyForm.setControl('questions', this.fb.array([this.buildQuestionGroup()]));
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

  private mapSurveyToHomeSurvey(survey: {
    id: string;
    category: string;
    title: string;
    status: string;
    endsAt: string;
  }): Survey {
    const now = new Date();
    const endsAt = new Date(survey.endsAt);
    const isPast = !Number.isNaN(endsAt.getTime()) && endsAt.getTime() < now.getTime();

    return {
      id: survey.id,
      category: survey.category,
      title: survey.title,
      badgeLabel: this.toBadgeLabel(Number.isNaN(endsAt.getTime()) ? null : endsAt),
      status: survey.status === 'published' && !isPast ? 'active' : 'past',
      tone: survey.status === 'published' && !isPast ? 'base' : 'muted',
    };
  }
}
