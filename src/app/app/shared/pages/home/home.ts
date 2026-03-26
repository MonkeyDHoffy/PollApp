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

  // State signals
  protected readonly selectedStatus = signal<SurveyStatus>('all');
  protected readonly selectedCategory = signal<CategoryFilter>('all');
  protected readonly createSurveyOpen = signal(false);

  protected readonly createSurveyForm = this.fb.group({
    title: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(120)]),
    description: this.fb.nonNullable.control('', [Validators.maxLength(300)]),
    endDate: this.fb.nonNullable.control(''),
    category: this.fb.nonNullable.control('', [Validators.required]),
    questions: this.fb.array([this.buildQuestionGroup()]),
  });

  // Mock survey data - später von API
  protected readonly allSurveys = signal<Survey[]>([
    {
      id: '1',
      category: 'Team activities',
      title: "Let's Plan the Next Team Event Together",
      badgeLabel: 'Ends in 1 Day',
      status: 'active',
      tone: 'base',
    },
    {
      id: '2',
      category: 'Health & Wellness',
      title: 'Fit & wellness survey!',
      badgeLabel: 'Ends in 2 Days',
      status: 'active',
      tone: 'base',
    },
    {
      id: '3',
      category: 'Gaming & Entertainment',
      title: 'Gaming habits and favorite games!',
      badgeLabel: 'Ends in 3 Days',
      status: 'active',
      tone: 'base',
    },
    {
      id: '4',
      category: 'Education & Learning',
      title: 'Online Learning Preferences',
      badgeLabel: 'Ends in 4 Days',
      status: 'active',
      tone: 'base',
    },
    {
      id: '5',
      category: 'Technology & Innovation',
      title: 'Your views on AI and future tech',
      badgeLabel: 'Ends in 5 Days',
      status: 'active',
      tone: 'base',
    },
    {
      id: '6',
      category: 'Lifestyle & Preferences',
      title: 'Coffee or tea - which do you prefer?',
      badgeLabel: 'Ends in 1 Day',
      status: 'active',
      tone: 'base',
    },
    {
      id: '7',
      category: 'Gaming & Entertainment',
      title: 'Gaming habits and favorite games!',
      badgeLabel: 'Ends in 3 Days',
      status: 'past',
      tone: 'muted',
    },
    {
      id: '8',
      category: 'Healthy Lifestyle',
      title: 'Healthier future: Fit & wellness survey!',
      badgeLabel: 'Ends in 2 Days',
      status: 'past',
      tone: 'muted',
    },
    {
      id: '9',
      category: 'Team activities',
      title: "Let's Plan the Next Team Event Together",
      badgeLabel: 'Ends in 1 Day',
      status: 'past',
      tone: 'muted',
    },
    {
      id: '10',
      category: 'Technology & Innovation',
      title: 'Remote work tools and productivity',
      badgeLabel: 'Ended 2 days ago',
      status: 'past',
      tone: 'muted',
    },
    {
      id: '11',
      category: 'Education & Learning',
      title: 'Skills you want to learn in 2026',
      badgeLabel: 'Ended 5 days ago',
      status: 'past',
      tone: 'muted',
    },
    {
      id: '12',
      category: 'Health & Wellness',
      title: 'Workplace wellness program feedback',
      badgeLabel: 'Ended 1 week ago',
      status: 'past',
      tone: 'muted',
    },
  ]);

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
    this.createSurveyOpen.set(true);
  }

  protected closeCreateSurveyModal(): void {
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

  protected publishSurvey(): void {
    if (this.createSurveyForm.invalid) {
      this.createSurveyForm.markAllAsTouched();
      return;
    }

    const title = this.createSurveyForm.controls.title.value.trim();
    const category = this.createSurveyForm.controls.category.value.trim();
    const endDateRaw = this.createSurveyForm.controls.endDate.value.trim();

    const endDate = endDateRaw ? new Date(endDateRaw) : null;
    const now = new Date();
    const isPast = !!endDate && endDate.getTime() < now.getTime();

    this.allSurveys.update((surveys) => [
      {
        id: `${Date.now()}`,
        category: category || 'General',
        title,
        badgeLabel: this.toBadgeLabel(endDate),
        status: isPast ? 'past' : 'active',
        tone: isPast ? 'muted' : 'base',
      },
      ...surveys,
    ]);

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
}
