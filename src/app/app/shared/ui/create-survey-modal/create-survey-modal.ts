import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import {
  CreateSurveyDTO,
  Survey,
  SurveyQuestion,
  UpdateSurveyDTO,
} from '../../../../shared/models/survey.model';
import { SurveyService } from '../../../../shared/services/survey.service';
import { LangService } from '../../../../shared/services/lang.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { ButtonComponent } from '../button/button';

/** Minimal survey data shape needed to pre-fill the form for edit or duplicate mode. */
interface SurveyFormData {
  id?: string;
  title: string;
  description?: string;
  endsAt?: string;
  category: string;
  visibility?: 'public' | 'private';
  isAnonymous?: boolean;
  accessCode?: string;
  shareToken?: string;
  questions: Survey['questions'];
}

/** Available survey category labels. */
const CATEGORIES = [
  'Team Activities',
  'Health & Wellness',
  'Gaming & Entertainment',
  'Education & Learning',
  'Lifestyle & Preferences',
  'Technology & Innovation',
  'Other',
] as const;

/** Validator that rejects dates before today. */
function pastDateValidator(control: AbstractControl): ValidationErrors | null {
  if (!control.value) return null;
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return control.value < today ? { pastDate: true } : null;
}

/**
 * Modal for creating or editing a survey.
 * Handles the full flow: form entry → publish confirmation → share link.
 * In edit mode (editSurveyId is set), saving is immediate without a confirm step.
 */
@Component({
  selector: 'app-create-survey-modal',
  imports: [ReactiveFormsModule, ButtonComponent],
  templateUrl: './create-survey-modal.html',
  styleUrl: './create-survey-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateSurveyModalComponent implements OnInit {
  private readonly surveyService = inject(SurveyService);
  private readonly langService = inject(LangService);
  private readonly toastService = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  protected readonly t = this.langService.t;

  /** Survey ID to update. When set, the modal runs in edit mode. */
  @Input() editSurveyId: string | null = null;

  /** Pre-fill data for edit or duplicate mode. Null means blank create mode. */
  @Input() surveyData: SurveyFormData | null = null;

  /** Emits when the modal has been closed and should be removed from the DOM. */
  readonly closed = output<void>();

  protected readonly categories = CATEGORIES;

  // ── UI state ─────────────────────────────────────────────────────────────

  protected readonly submitAttempted = signal(false);
  protected readonly confirmDiscardOpen = signal(false);
  protected readonly publishConfirmOpen = signal(false);
  protected readonly publishStep = signal<'confirm' | 'success'>('confirm');
  protected readonly publishedShareLink = signal<string | null>(null);
  protected readonly publishSuccessMessage = signal<string | null>(null);

  // ── Computed state ───────────────────────────────────────────────────────

  protected readonly isEditMode = computed(() => !!this.editSurveyId);
  protected readonly createError = computed(() => this.surveyService.error());
  protected readonly createLoading = computed(() => this.surveyService.loading());
  protected readonly isPrivateSurvey = computed(
    () => this.form.controls.visibility.value === 'private'
  );
  protected readonly isAnonymousSurvey = computed(
    () => this.form.controls.anonymous.value
  );
  protected readonly hasUnsavedChanges = computed(() =>
    this.checkForUnsavedChanges()
  );

  // ── Form ─────────────────────────────────────────────────────────────────

  protected readonly form = this.fb.group({
    title: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(120)]),
    description: this.fb.nonNullable.control('', [Validators.maxLength(300)]),
    endDate: this.fb.nonNullable.control('', [pastDateValidator]),
    category: this.fb.nonNullable.control('', [Validators.required]),
    visibility: this.fb.nonNullable.control<'public' | 'private'>('public'),
    anonymous: this.fb.nonNullable.control(false),
    accessCode: this.fb.nonNullable.control('', [Validators.maxLength(40)]),
    questions: this.fb.array([this.createQuestionGroup()]),
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.surveyService.clearError();
    if (this.surveyData) {
      this.fillFormFromSurvey(this.surveyData);
      if (this.editSurveyId) {
        this.publishedShareLink.set(this.buildShareLink(this.surveyData.shareToken));
      }
    }
  }

  // ── Question form helpers ─────────────────────────────────────────────────

  protected get questionsArray(): FormArray {
    return this.form.controls.questions as FormArray;
  }

  /** Returns the answers FormArray for a given question index. */
  protected questionAnswersArray(questionIndex: number): FormArray {
    return this.questionsArray.at(questionIndex).get('answers') as FormArray;
  }

  protected onVisibilityChange(): void {
    if (this.form.controls.visibility.value === 'public') {
      this.form.controls.accessCode.setValue('');
    }
  }

  protected addQuestion(): void {
    this.questionsArray.push(this.createQuestionGroup());
  }

  protected removeQuestion(index: number): void {
    if (this.questionsArray.length <= 1) return;
    this.questionsArray.removeAt(index);
  }

  protected addAnswer(questionIndex: number): void {
    this.questionAnswersArray(questionIndex).push(this.createAnswerControl());
  }

  protected removeAnswer(questionIndex: number, answerIndex: number): void {
    const answers = this.questionAnswersArray(questionIndex);
    if (answers.length <= 2) return;
    answers.removeAt(answerIndex);
  }

  /** Returns the letter label (A, B, C…) for a given answer index. */
  protected answerLabel(index: number): string {
    return String.fromCharCode(65 + index);
  }

  // ── Modal lifecycle ───────────────────────────────────────────────────────

  /** Closes the modal, showing a discard confirm if there are unsaved changes. */
  protected requestClose(): void {
    if (this.hasUnsavedChanges() && !this.publishSuccessMessage()) {
      this.confirmDiscardOpen.set(true);
      return;
    }
    this.close();
  }

  protected confirmDiscard(): void {
    this.confirmDiscardOpen.set(false);
    this.close();
  }

  protected cancelDiscard(): void {
    this.confirmDiscardOpen.set(false);
  }

  // ── Publish / Save ────────────────────────────────────────────────────────

  /** Validates and either saves (edit) or opens the publish confirm dialog (create). */
  protected async publishOrSave(): Promise<void> {
    this.submitAttempted.set(true);
    this.surveyService.clearError();
    if (!this.isFormValid()) return;
    if (this.editSurveyId) {
      await this.saveEditedSurvey();
    } else {
      this.openPublishConfirm();
    }
  }

  /** Executes the actual survey creation after the user confirms. */
  protected async confirmPublish(): Promise<void> {
    const dto = this.buildCreateDto();
    const created = await this.surveyService.createSurvey(dto);
    if (!created) return;
    const visibility = this.form.controls.visibility.value;
    this.publishedShareLink.set(this.buildShareLink(created.shareToken));
    this.publishSuccessMessage.set(this.resolvePublishMessage(visibility));
    this.publishStep.set('success');
  }

  protected cancelPublishConfirm(): void {
    this.publishConfirmOpen.set(false);
  }

  /** Closes the modal and navigates the user back to the home page. */
  protected async goHomeAfterPublish(): Promise<void> {
    this.publishConfirmOpen.set(false);
    this.close();
    void this.router.navigate(['/']);
  }

  /** Copies the published share link to the clipboard. */
  protected async copyShareLink(): Promise<void> {
    const link = this.publishedShareLink();
    if (!link || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(link);
      this.toastService.success(this.t()('linkCopied'));
    } catch {
      this.toastService.error(this.t()('copyFailed'));
    }
  }

  // ── Private: validation & form reading ───────────────────────────────────

  private isFormValid(): boolean {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return false;
    }
    const { visibility, accessCode } = this.form.controls;
    return !(visibility.value === 'private' && !accessCode.value.trim());
  }

  private openPublishConfirm(): void {
    this.publishConfirmOpen.set(true);
    this.publishStep.set('confirm');
  }

  private async saveEditedSurvey(): Promise<void> {
    const dto = this.buildUpdateDto();
    const updated = await this.surveyService.updateSurvey(this.editSurveyId!, dto);
    if (!updated) return;
    this.publishSuccessMessage.set(this.t()('surveyUpdated'));
  }

  private resolvePublishMessage(visibility: 'public' | 'private'): string {
    return visibility === 'private'
      ? this.t()('privatePublished')
      : this.t()('publicPublished');
  }

  private checkForUnsavedChanges(): boolean {
    const { title, description, category, questions } = this.form.value;
    const hasQuestionText = (questions ?? []).some(
      (q: Record<string, unknown>) => ((q['questionText'] ?? '') as string).trim().length > 0
    );
    return (
      (title ?? '').trim().length > 0 ||
      (description ?? '').trim().length > 0 ||
      (category ?? '').trim().length > 0 ||
      hasQuestionText
    );
  }

  private close(): void {
    this.surveyService.clearError();
    this.closed.emit();
  }

  // ── Private: DTO builders ─────────────────────────────────────────────────

  private buildCreateDto(): CreateSurveyDTO {
    const vals = this.extractFormValues();
    return {
      title: vals.title,
      description: vals.description || undefined,
      category: vals.category || 'General',
      endsAt: vals.endDate ? new Date(vals.endDate).toISOString() : undefined,
      status: 'published',
      visibility: vals.visibility,
      isAnonymous: vals.anonymous,
      accessCode: vals.visibility === 'private' ? vals.accessCode : undefined,
      questions: this.buildQuestionsDto(),
    };
  }

  private buildUpdateDto(): UpdateSurveyDTO {
    const vals = this.extractFormValues();
    return {
      title: vals.title,
      description: vals.description || undefined,
      category: vals.category || 'General',
      endsAt: vals.endDate ? new Date(vals.endDate).toISOString() : undefined,
      visibility: vals.visibility,
      isAnonymous: vals.anonymous,
      accessCode: vals.visibility === 'private' ? vals.accessCode : '',
      status: 'published',
    };
  }

  private extractFormValues() {
    return {
      title: this.form.controls.title.value.trim(),
      description: this.form.controls.description.value.trim(),
      category: this.form.controls.category.value.trim(),
      endDate: this.form.controls.endDate.value.trim(),
      visibility: this.form.controls.visibility.value,
      anonymous: this.form.controls.anonymous.value,
      accessCode: this.form.controls.accessCode.value.trim(),
    };
  }

  private buildQuestionsDto() {
    return this.questionsArray.controls.map((ctrl) =>
      this.buildQuestionDto(ctrl as FormGroup)
    );
  }

  private buildQuestionDto(ctrl: FormGroup) {
    const text = (ctrl.get('questionText')?.value as string).trim();
    const description = (ctrl.get('questionDescription')?.value as string).trim();
    const allowMultiple = !!ctrl.get('allowMultiple')?.value;
    const answersArray = ctrl.get('answers') as FormArray;
    return {
      text,
      description: description || undefined,
      type: (allowMultiple ? 'checkboxes' : 'multiple_choice') as 'checkboxes' | 'multiple_choice',
      allowMultiple,
      answers: answersArray.controls
        .map((c) => ({ text: (c.value as string).trim() }))
        .filter((a) => a.text.length > 0),
    };
  }

  // ── Private: form initialization ──────────────────────────────────────────

  private fillFormFromSurvey(survey: SurveyFormData): void {
    this.form.reset({
      title: survey.title,
      description: survey.description ?? '',
      endDate: this.toDateInputValue(survey.endsAt),
      category: survey.category,
      visibility: survey.visibility ?? 'public',
      anonymous: survey.isAnonymous ?? false,
      accessCode: survey.accessCode ?? '',
    });
    const groups = survey.questions.length > 0
      ? survey.questions.map((q) => this.createQuestionGroupFromData(q))
      : [this.createQuestionGroup()];
    this.form.setControl('questions', this.fb.array(groups));
  }

  private createQuestionGroupFromData(question: SurveyQuestion): FormGroup {
    return this.fb.group({
      questionText: this.fb.nonNullable.control(question.text, [
        Validators.required, Validators.maxLength(160),
      ]),
      questionDescription: this.fb.nonNullable.control(question.description ?? '', [
        Validators.maxLength(200),
      ]),
      allowMultiple: this.fb.control({ value: !!question.allowMultiple, disabled: true }),
      answers: this.fb.array(
        question.answers.map((a) =>
          this.fb.nonNullable.control(a.text, [Validators.required, Validators.maxLength(120)])
        )
      ),
    });
  }

  private createQuestionGroup(): FormGroup {
    return this.fb.group({
      questionText: this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(160)]),
      questionDescription: this.fb.nonNullable.control('', [Validators.maxLength(200)]),
      allowMultiple: this.fb.nonNullable.control(false),
      answers: this.fb.array([this.createAnswerControl(), this.createAnswerControl()]),
    });
  }

  private createAnswerControl(): FormControl<string> {
    return this.fb.nonNullable.control('', [Validators.required, Validators.maxLength(120)]);
  }

  // ── Private: utilities ────────────────────────────────────────────────────

  private buildShareLink(shareToken?: string): string | null {
    return shareToken && typeof window !== 'undefined'
      ? `${window.location.origin}/join/${shareToken}`
      : null;
  }

  private toDateInputValue(isoDate?: string): string {
    if (!isoDate) return '';
    const date = new Date(isoDate);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  }

}
