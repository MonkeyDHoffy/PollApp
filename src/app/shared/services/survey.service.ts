import { Injectable, computed, signal } from '@angular/core';
import {
  Survey,
  SurveyListItem,
  CreateSurveyDTO,
  CreateSurveyResult,
  UpdateSurveyDTO,
  SurveyResponse,
  SurveyResult,
} from '../models/survey.model';
import { DEMO_SURVEY_RESULTS, DEMO_SURVEYS } from '../demo/demo-surveys';
import { supabaseClient } from './supabase-client';

@Injectable({
  providedIn: 'root',
})
export class SurveyService {
  private readonly supabase = supabaseClient;
  private useLegacySurveyColumns = false;

  // Signals für State Management
  private allSurveysSignal = signal<Survey[]>([]);
  private currentSurveySignal = signal<Survey | null>(null);
  private userResponsesSignal = signal<SurveyResponse[]>([]);
  private demoResultsSignal = signal<Record<string, SurveyResult[]>>(this.buildDemoResultsState());
  private sharedResultsSignal = signal<Record<string, SurveyResult[]>>({});
  private shareAccessCodeSignal = signal<Record<string, string>>({});
  private loadingSignal = signal(false);
  private errorSignal = signal<string | null>(null);
  private schemaNoticeSignal = signal<string | null>(null);

  // Public Computed Signals
  readonly allSurveys = this.allSurveysSignal.asReadonly();
  readonly currentSurvey = this.currentSurveySignal.asReadonly();
  readonly userResponses = this.userResponsesSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly schemaNotice = this.schemaNoticeSignal.asReadonly();

  clearError(): void {
    this.errorSignal.set(null);
  }

  // Gefilterte Listen (Computed)
  readonly activeSurveys = computed(() =>
    this.allSurveys()
      .filter((s) => s.status === 'published' && new Date(s.endsAt) > new Date())
      .sort((a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime())
  );

  readonly pastSurveys = computed(() =>
    this.allSurveys()
      .filter((s) => s.status === 'published' && new Date(s.endsAt) <= new Date())
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  );

  readonly endingSoonSurveys = computed(() =>
    this.activeSurveys().slice(0, 3)
  );

  constructor() {
    void this.loadAllSurveys();

    this.supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        this.currentSurveySignal.set(null);
        this.userResponsesSignal.set([]);
      }

      void this.loadAllSurveys();
    });
  }

  /**
   * ==================== SUPABASE CRUD METHODS ====================
   */

  /**
   * Alle Umfragen laden
   */
  async loadAllSurveys(): Promise<void> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const { data, error } = await this.supabase
        .from('surveys')
        .select(this.getSurveySelectQuery())
        .order('created_at', { ascending: false });

      if (error) {
        if (!this.useLegacySurveyColumns && this.isLegacySchemaError(error)) {
          this.useLegacySurveyColumns = true;
          this.setSchemaNotice();
          await this.loadAllSurveys();
          return;
        }
        throw error;
      }

      this.allSurveysSignal.set((data ?? []).map((row) => this.mapSurveyRow(row)));
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Failed to load surveys');
    } finally {
      this.loadingSignal.set(false);
    }
  }

  /**
   * Einzelne Umfrage laden
   */
  async loadSurveyById(surveyId: string): Promise<void> {
    if (this.isDemoSurveyId(surveyId)) {
      this.loadingSignal.set(true);
      this.errorSignal.set(null);
      this.currentSurveySignal.set(this.cloneSurvey(this.getDemoSurveyById(surveyId) ?? null));
      this.loadingSignal.set(false);

      if (!this.currentSurveySignal()) {
        this.errorSignal.set('Demo survey not found');
      }
      return;
    }

    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const { data, error } = await this.supabase
        .from('surveys')
        .select(this.getSurveySelectQuery())
        .eq('id', surveyId)
        .single();

      if (error) {
        if (!this.useLegacySurveyColumns && this.isLegacySchemaError(error)) {
          this.useLegacySurveyColumns = true;
          this.setSchemaNotice();
          await this.loadSurveyById(surveyId);
          return;
        }
        throw error;
      }

      this.currentSurveySignal.set(this.mapSurveyRow(data));
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Failed to load survey');
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async loadSurveyByShareToken(shareToken: string, accessCode?: string): Promise<boolean> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const participantToken = this.ensureParticipantToken(`share-${shareToken}`);
      const { data, error } = await this.supabase.functions.invoke('survey-access', {
        body: {
          shareToken,
          accessCode,
          participantToken,
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to load survey');
      }

      if (!data?.survey) {
        throw new Error('SURVEY_NOT_FOUND');
      }

      if (accessCode) {
        this.shareAccessCodeSignal.update((state) => ({
          ...state,
          [shareToken]: accessCode,
        }));
      }

      this.currentSurveySignal.set(this.mapSharedSurvey(data.survey));
      const surveyId = data.survey.id as string;
      this.sharedResultsSignal.update((state) => ({
        ...state,
        [surveyId]: Array.isArray(data.results) ? data.results : [],
      }));

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load survey';
      this.errorSignal.set(this.normalizeShareError(message));
      return false;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  /**
   * Neue Umfrage erstellen
   */
  async createSurvey(surveyData: CreateSurveyDTO): Promise<CreateSurveyResult | null> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const {
        data: { user },
        error: userError,
      } = await this.supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user) {
        throw new Error('Please log in before creating a survey.');
      }

      const insertPayload: Record<string, unknown> = {
        creator_id: user.id,
        title: surveyData.title,
        description: surveyData.description ?? null,
        category: surveyData.category,
        status: surveyData.status ?? 'published',
        ends_at: surveyData.endsAt ?? null,
      };

      if (!this.useLegacySurveyColumns) {
        insertPayload['visibility'] = surveyData.visibility ?? 'public';
        insertPayload['share_token'] = this.generateShareToken();
        insertPayload['access_code'] = surveyData.accessCode ?? null;
      }

      let createdSurvey: { id: string; share_token?: string | null } | null = null;
      let surveyInsertError: unknown = null;

      if (this.useLegacySurveyColumns) {
        const { data, error } = await this.supabase
          .from('surveys')
          .insert(insertPayload)
          .select('id')
          .single();
        createdSurvey = data;
        surveyInsertError = error;
      } else {
        const { data, error } = await this.supabase
          .from('surveys')
          .insert(insertPayload)
          .select('id, share_token')
          .single();
        createdSurvey = data;
        surveyInsertError = error;
      }

      if (surveyInsertError) {
        if (!this.useLegacySurveyColumns && this.isLegacySchemaError(surveyInsertError)) {
          this.useLegacySurveyColumns = true;
          this.setSchemaNotice();
          return this.createSurvey(surveyData);
        }
        throw surveyInsertError;
      }

      if (!createdSurvey) {
        throw new Error('Failed to create survey');
      }

      for (let questionIndex = 0; questionIndex < surveyData.questions.length; questionIndex++) {
        const question = surveyData.questions[questionIndex];

        const { data: createdQuestion, error: questionInsertError } = await this.supabase
          .from('survey_questions')
          .insert({
            survey_id: createdSurvey.id,
            question_text: question.text,
            question_type: question.type,
            allow_multiple: question.allowMultiple ?? false,
            sort_order: questionIndex,
          })
          .select('id')
          .single();

        if (questionInsertError) {
          throw questionInsertError;
        }

        if (question.answers.length > 0) {
          const answerRows = question.answers.map((answer, answerIndex) => ({
            question_id: createdQuestion.id,
            answer_text: answer.text,
            sort_order: answerIndex,
          }));

          const { error: answersInsertError } = await this.supabase
            .from('survey_answers')
            .insert(answerRows);

          if (answersInsertError) {
            throw answersInsertError;
          }
        }
      }

      await this.loadAllSurveys();
      return {
        id: createdSurvey.id,
        shareToken: createdSurvey.share_token ?? undefined,
      };
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Failed to create survey');
      return null;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  /**
   * Umfrage aktualisieren
   */
  async updateSurvey(surveyId: string, updates: UpdateSurveyDTO): Promise<boolean> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const updatePayload: Record<string, unknown> = {};

      if (updates.title !== undefined) {
        updatePayload['title'] = updates.title;
      }
      if (updates.description !== undefined) {
        updatePayload['description'] = updates.description ?? null;
      }
      if (updates.category !== undefined) {
        updatePayload['category'] = updates.category;
      }
      if (updates.status !== undefined) {
        updatePayload['status'] = updates.status;
      }
      if (updates.endsAt !== undefined) {
        updatePayload['ends_at'] = updates.endsAt ?? null;
      }
      if (!this.useLegacySurveyColumns) {
        if (updates.visibility !== undefined) {
          updatePayload['visibility'] = updates.visibility;
        }
        if (updates.accessCode !== undefined) {
          updatePayload['access_code'] = updates.accessCode || null;
        }
      }

      const { error } = await this.supabase
        .from('surveys')
        .update(updatePayload)
        .eq('id', surveyId);

      if (error) {
        throw error;
      }

      await this.loadAllSurveys();

      if (this.currentSurveySignal()?.id === surveyId) {
        await this.loadSurveyById(surveyId);
      }

      return true;
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Failed to update survey');
      return false;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  /**
   * Umfrage löschen
   */
  async deleteSurvey(surveyId: string): Promise<boolean> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const { error } = await this.supabase
        .from('surveys')
        .delete()
        .eq('id', surveyId);

      if (error) {
        throw error;
      }

      this.allSurveysSignal.update((surveys) => surveys.filter((survey) => survey.id !== surveyId));

      if (this.currentSurveySignal()?.id === surveyId) {
        this.currentSurveySignal.set(null);
      }

      return true;
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Failed to delete survey');
      return false;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  /**
   * ==================== RESPONSE & RESULTS ====================
   */

  /**
   * Nutzer-Antwort speichern
   */
  async submitSurveyResponse(response: SurveyResponse): Promise<boolean> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      if (this.isDemoSurveyId(response.surveyId)) {
        this.applyDemoResponse(response);
        return true;
      }

      const currentSurvey = this.currentSurveySignal();
      if (currentSurvey?.visibility === 'private' && currentSurvey.shareToken) {
        const participantToken = this.ensureParticipantToken(`share-${currentSurvey.shareToken}`);
        const accessCode = this.shareAccessCodeSignal()[currentSurvey.shareToken] ?? undefined;

        const { error } = await this.supabase.functions.invoke('survey-submit', {
          body: {
            shareToken: currentSurvey.shareToken,
            accessCode,
            participantToken,
            answers: response.answers,
          },
        });

        if (error) {
          throw new Error(error.message || 'Failed to submit response');
        }

        this.userResponsesSignal.update((responses) => [
          ...responses,
          {
            ...response,
            participantToken,
            id: `shared-${Date.now()}`,
            respondedAt: new Date().toISOString(),
          },
        ]);

        return true;
      }

      const {
        data: { user },
        error: userError,
      } = await this.supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      const { data: createdResponse, error: responseInsertError } = await this.supabase
        .from('survey_responses')
        .insert({
          survey_id: response.surveyId,
          respondent_id: user?.id ?? null,
          participant_token: response.participantToken ?? this.ensureParticipantToken(response.surveyId),
        })
        .select('id, created_at')
        .single();

      if (responseInsertError) {
        throw responseInsertError;
      }

      const answerRows = response.answers.flatMap((answer) =>
        answer.selectedAnswerIds.map((answerId) => ({
          response_id: createdResponse.id,
          question_id: answer.questionId,
          answer_id: answerId,
        }))
      );

      if (answerRows.length > 0) {
        const { error: answersInsertError } = await this.supabase
          .from('survey_response_answers')
          .insert(answerRows);

        if (answersInsertError) {
          throw answersInsertError;
        }
      }

      this.userResponsesSignal.update((responses) => [
        ...responses,
        {
          ...response,
          id: createdResponse.id,
          respondentId: user?.id,
          respondedAt: createdResponse.created_at,
        },
      ]);

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit response';
      if (message.includes('ALREADY_SUBMITTED')) {
        this.errorSignal.set('You already submitted this survey.');
        return false;
      }

      if (typeof err === 'object' && err && 'code' in err && err.code === '23505') {
        this.errorSignal.set('You already submitted this survey.');
        return false;
      }

      this.errorSignal.set(message);
      return false;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  /**
   * Ergebnisse für eine Umfrage berechnen
   */
  calculateResults(surveyId: string): SurveyResult[] {
    const survey = this.allSurveys().find((s) => s.id === surveyId);
    if (!survey) return [];

    return survey.questions.map((question) => ({
      questionId: question.id,
      questionText: question.text,
      answers: question.answers.map((answer) => ({
        id: answer.id,
        text: answer.text,
        count: Math.floor(Math.random() * 50), // Mock
        percentage: Math.floor(Math.random() * 100),
      })),
    }));
  }

  async loadSurveyResults(surveyId: string): Promise<SurveyResult[]> {
    if (this.isDemoSurveyId(surveyId)) {
      return this.cloneResults(this.demoResultsSignal()[surveyId] ?? []);
    }

    const sharedResults = this.sharedResultsSignal()[surveyId];
    if (sharedResults) {
      return this.cloneResults(sharedResults);
    }

    try {
      const { data: surveyData, error: surveyError } = await this.supabase
        .from('survey_questions')
        .select(
          `
          id,
          question_text,
          sort_order,
          survey_answers (
            id,
            answer_text,
            sort_order
          )
        `
        )
        .eq('survey_id', surveyId)
        .order('sort_order', { ascending: true });

      if (surveyError) {
        throw surveyError;
      }

      const { data: responseData, error: responseError } = await this.supabase
        .from('survey_response_answers')
        .select(
          `
          question_id,
          answer_id,
          survey_responses!inner (
            survey_id
          )
        `
        )
        .eq('survey_responses.survey_id', surveyId);

      if (responseError) {
        throw responseError;
      }

      const answerCountMap = new Map<string, number>();
      for (const row of responseData ?? []) {
        const answerId = row.answer_id as string;
        answerCountMap.set(answerId, (answerCountMap.get(answerId) ?? 0) + 1);
      }

      return (surveyData ?? []).map((questionRow) => {
        const answerRows = Array.isArray(questionRow.survey_answers) ? questionRow.survey_answers : [];
        const totalCount = answerRows.reduce(
          (sum, answerRow) => sum + (answerCountMap.get(answerRow.id) ?? 0),
          0
        );

        return {
          questionId: questionRow.id,
          questionText: questionRow.question_text,
          answers: answerRows
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((answerRow) => {
              const count = answerCountMap.get(answerRow.id) ?? 0;
              return {
                id: answerRow.id,
                text: answerRow.answer_text,
                count,
                percentage: totalCount === 0 ? 0 : Math.round((count / totalCount) * 100),
              };
            }),
        };
      });
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Failed to load survey results');
      return [];
    }
  }

  /**
   * ==================== REALTIME SUBSCRIPTION ====================
   */

  /**
   * Subscribe zu Live-Updates für eine Umfrage.
   * Gibt eine Cleanup-Funktion zurück, die beim Verlassen der Seite aufgerufen werden soll.
   */
  subscribeToSurveyUpdates(
    surveyId: string,
    onUpdate: () => void,
    onStatusChange?: (status: 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR') => void,
  ): () => void {
    const channel = this.supabase
      .channel(`survey-responses:${surveyId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'survey_responses', filter: `survey_id=eq.${surveyId}` },
        () => onUpdate(),
      )
      .subscribe((status) => onStatusChange?.(status as 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR'));

    return () => {
      void this.supabase.removeChannel(channel);
    };
  }

  /**
   * ==================== HELPER METHODS ====================
   */

  /**
   * Setze aktuelle Umfrage (Client-seitig)
   */
  setCurrentSurvey(survey: Survey | null): void {
    this.currentSurveySignal.set(survey);
  }

  getDemoSurveys(): Survey[] {
    return DEMO_SURVEYS.map((survey) => ({
      ...survey,
      questions: survey.questions.map((question) => ({
        ...question,
        answers: question.answers.map((answer) => ({ ...answer })),
      })),
    }));
  }

  /**
   * Konvertiere Survey zu UI-Format (SurveyListItem)
   */
  toListItem(survey: Survey): SurveyListItem {
    const endsAt = new Date(survey.endsAt);
    const now = new Date();
    const daysUntilEnd = Math.ceil((endsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    return {
      id: survey.id,
      category: survey.category,
      title: survey.title,
      badgeLabel: `Ends in ${daysUntilEnd} day${daysUntilEnd !== 1 ? 's' : ''}`,
      status: survey.status,
      tone: survey.status === 'published' ? 'base' : 'muted',
    };
  }

  private mapSurveyRow(row: any): Survey {
    const questionRows = Array.isArray(row.survey_questions) ? row.survey_questions : [];

    return {
      id: row.id,
      creatorId: row.creator_id,
      title: row.title,
      description: row.description ?? undefined,
      category: row.category,
      status: row.status,
      visibility: row.visibility ?? 'public',
      shareToken: row.share_token ?? undefined,
      accessCode: row.access_code ?? undefined,
      questions: questionRows
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((question: any) => {
          const answerRows = Array.isArray(question.survey_answers) ? question.survey_answers : [];
          return {
            id: question.id,
            text: question.question_text,
            type: question.question_type,
            allowMultiple: question.allow_multiple,
            order: question.sort_order,
            answers: answerRows
              .sort((a: any, b: any) => a.sort_order - b.sort_order)
              .map((answer: any) => ({
                id: answer.id,
                text: answer.answer_text,
                order: answer.sort_order,
              })),
          };
        }),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      endsAt: row.ends_at ?? row.created_at,
      totalResponses: 0,
    };
  }

  private generateShareToken(): string {
    const randomSource = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now()}${Math.random().toString(36).slice(2)}`;

    return randomSource.slice(0, 12);
  }

  private getSurveySelectQuery(): string {
    const base = `
      id,
      creator_id,
      title,
      description,
      category,
      status,
      ends_at,
      created_at,
      updated_at,
      survey_questions (
        id,
        question_text,
        question_type,
        allow_multiple,
        sort_order,
        survey_answers (
          id,
          answer_text,
          sort_order
        )
      )
    `;

    if (this.useLegacySurveyColumns) {
      return base;
    }

    return `
      id,
      creator_id,
      title,
      description,
      category,
      status,
      visibility,
      share_token,
      access_code,
      ends_at,
      created_at,
      updated_at,
      survey_questions (
        id,
        question_text,
        question_type,
        allow_multiple,
        sort_order,
        survey_answers (
          id,
          answer_text,
          sort_order
        )
      )
    `;
  }

  private isLegacySchemaError(err: unknown): boolean {
    const text = this.errorToText(err).toLowerCase();
    return (
      text.includes('column')
      && (text.includes('visibility') || text.includes('share_token') || text.includes('access_code'))
    );
  }

  private errorToText(err: unknown): string {
    if (!err) {
      return '';
    }

    if (typeof err === 'string') {
      return err;
    }

    if (err instanceof Error) {
      return err.message;
    }

    if (typeof err === 'object') {
      const maybeError = err as { message?: string; details?: string; hint?: string; code?: string };
      return [maybeError.message, maybeError.details, maybeError.hint, maybeError.code]
        .filter((part): part is string => !!part)
        .join(' ');
    }

    return '';
  }

  private setSchemaNotice(): void {
    this.schemaNoticeSignal.set(
      'Supabase schema is outdated. Please run supabase/schema.sql in the Supabase SQL Editor and reload the app to enable private sharing features.'
    );
  }

  private isDemoSurveyId(surveyId: string): boolean {
    return surveyId.startsWith('demo-');
  }

  private getDemoSurveyById(surveyId: string): Survey | undefined {
    return DEMO_SURVEYS.find((survey) => survey.id === surveyId);
  }

  private buildDemoResultsState(): Record<string, SurveyResult[]> {
    return Object.fromEntries(
      Object.entries(DEMO_SURVEY_RESULTS).map(([surveyId, results]) => [surveyId, this.cloneResults(results)])
    );
  }

  private applyDemoResponse(response: SurveyResponse): void {
    const currentResults = this.cloneResults(this.demoResultsSignal()[response.surveyId] ?? []);

    for (const answerGroup of response.answers) {
      const resultRow = currentResults.find((result) => result.questionId === answerGroup.questionId);
      if (!resultRow) {
        continue;
      }

      for (const answerId of answerGroup.selectedAnswerIds) {
        const resultAnswer = resultRow.answers.find((answer) => answer.id === answerId);
        if (resultAnswer) {
          resultAnswer.count += 1;
        }
      }

      const total = resultRow.answers.reduce((sum, answer) => sum + answer.count, 0);
      resultRow.answers = resultRow.answers.map((answer) => ({
        ...answer,
        percentage: total === 0 ? 0 : Math.round((answer.count / total) * 100),
      }));
    }

    this.demoResultsSignal.update((state) => ({
      ...state,
      [response.surveyId]: currentResults,
    }));

    this.userResponsesSignal.update((responses) => [
      ...responses,
      {
        ...response,
        id: `demo-response-${responses.length + 1}`,
        respondedAt: new Date().toISOString(),
      },
    ]);

    const currentSurvey = this.currentSurveySignal();
    if (currentSurvey?.id === response.surveyId) {
      this.currentSurveySignal.set({
        ...currentSurvey,
        totalResponses: currentSurvey.totalResponses + 1,
      });
    }
  }

  private cloneSurvey(survey: Survey | null): Survey | null {
    if (!survey) {
      return null;
    }

    return {
      ...survey,
      questions: survey.questions.map((question) => ({
        ...question,
        answers: question.answers.map((answer) => ({ ...answer })),
      })),
    };
  }

  private cloneResults(results: SurveyResult[]): SurveyResult[] {
    return results.map((result) => ({
      ...result,
      answers: result.answers.map((answer) => ({ ...answer })),
    }));
  }

  private ensureParticipantToken(surveyId: string): string {
    const storageKey = `pollapp.participant.${surveyId}`;
    const storedToken = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null;
    if (storedToken) {
      return storedToken;
    }

    const tokenSource = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now()}${Math.random().toString(36).slice(2)}`;
    const token = tokenSource.slice(0, 24);

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(storageKey, token);
    }

    return token;
  }

  private mapSharedSurvey(survey: any): Survey {
    return {
      id: survey.id,
      creatorId: survey.creatorId,
      title: survey.title,
      description: survey.description ?? undefined,
      category: survey.category,
      status: survey.status,
      visibility: survey.visibility,
      shareToken: survey.shareToken ?? undefined,
      accessCode: undefined,
      questions: Array.isArray(survey.questions)
        ? survey.questions.map((question: any) => ({
            id: question.id,
            text: question.text,
            type: question.type,
            allowMultiple: !!question.allowMultiple,
            order: question.order,
            answers: Array.isArray(question.answers)
              ? question.answers.map((answer: any) => ({
                  id: answer.id,
                  text: answer.text,
                  order: answer.order,
                }))
              : [],
          }))
        : [],
      createdAt: survey.createdAt,
      updatedAt: survey.updatedAt,
      endsAt: survey.endsAt,
      totalResponses: survey.totalResponses ?? 0,
    };
  }

  private normalizeShareError(message: string): string {
    if (message.includes('ACCESS_CODE_REQUIRED')) {
      return 'Access code required.';
    }

    if (message.includes('INVALID_ACCESS_CODE')) {
      return 'Invalid access code.';
    }

    if (message.includes('SURVEY_CLOSED')) {
      return 'This survey is already closed.';
    }

    if (message.includes('SURVEY_NOT_FOUND')) {
      return 'Survey not found.';
    }

    return message;
  }
}
