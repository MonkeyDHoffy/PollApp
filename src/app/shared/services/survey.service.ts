import { Injectable, computed, signal } from '@angular/core';
import {
  Survey,
  SurveyListItem,
  CreateSurveyDTO,
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

  // Signals für State Management
  private allSurveysSignal = signal<Survey[]>([]);
  private currentSurveySignal = signal<Survey | null>(null);
  private userResponsesSignal = signal<SurveyResponse[]>([]);
  private demoResultsSignal = signal<Record<string, SurveyResult[]>>(this.buildDemoResultsState());
  private loadingSignal = signal(false);
  private errorSignal = signal<string | null>(null);

  // Public Computed Signals
  readonly allSurveys = this.allSurveysSignal.asReadonly();
  readonly currentSurvey = this.currentSurveySignal.asReadonly();
  readonly userResponses = this.userResponsesSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

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
        .select(
          `
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
        `
        )
        .order('created_at', { ascending: false });

      if (error) {
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
        .select(
          `
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
        `
        )
        .eq('id', surveyId)
        .single();

      if (error) {
        throw error;
      }

      this.currentSurveySignal.set(this.mapSurveyRow(data));
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Failed to load survey');
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async loadSurveyByShareToken(shareToken: string): Promise<void> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const { data, error } = await this.supabase
        .from('surveys')
        .select(
          `
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
        `
        )
        .eq('share_token', shareToken)
        .eq('status', 'published')
        .single();

      if (error) {
        throw error;
      }

      this.currentSurveySignal.set(this.mapSurveyRow(data));
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'Failed to load survey');
    } finally {
      this.loadingSignal.set(false);
    }
  }

  /**
   * Neue Umfrage erstellen
   */
  async createSurvey(surveyData: CreateSurveyDTO): Promise<string | null> {
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

      const { data: createdSurvey, error: surveyInsertError } = await this.supabase
        .from('surveys')
        .insert({
          creator_id: user.id,
          title: surveyData.title,
          description: surveyData.description ?? null,
          category: surveyData.category,
          status: surveyData.status ?? 'published',
          visibility: surveyData.visibility ?? 'public',
          share_token: this.generateShareToken(),
          access_code: surveyData.accessCode ?? null,
          ends_at: surveyData.endsAt ?? null,
        })
        .select('id, share_token')
        .single();

      if (surveyInsertError) {
        throw surveyInsertError;
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
      return createdSurvey.id;
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
      // TODO: Ersetze mit echtem Supabase Update
      // const { error } = await this.supabase
      //   .from('surveys')
      //   .update(updates)
      //   .eq('id', surveyId);
      // if (error) throw error;
      // this.allSurveysSignal.update((surveys) =>
      //   surveys.map((s) => (s.id === surveyId ? { ...s, ...updates } : s))
      // );
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
      // TODO: Ersetze mit echtem Supabase Delete
      // const { error } = await this.supabase
      //   .from('surveys')
      //   .delete()
      //   .eq('id', surveyId);
      // if (error) throw error;
      // this.allSurveysSignal.update((surveys) => surveys.filter((s) => s.id !== surveyId));
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
      if (typeof err === 'object' && err && 'code' in err && err.code === '23505') {
        this.errorSignal.set('You already submitted this survey.');
        return false;
      }

      this.errorSignal.set(err instanceof Error ? err.message : 'Failed to submit response');
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
   * Subscribe zu Live-Updates (später für Realtime Results)
   */
  subscribeToSurveyUpdates(surveyId: string, callback: (data: any) => void): void {
    // TODO: Supabase Realtime Subscribe
    // this.supabase
    //   .channel(`surveys:${surveyId}`)
    //   .on(
    //     'postgres_changes',
    //     { event: '*', schema: 'public', table: 'survey_responses', filter: `survey_id=eq.${surveyId}` },
    //     callback
    //   )
    //   .subscribe();
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
}
