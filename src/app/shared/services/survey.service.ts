import { Injectable, computed, signal } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  Survey,
  SurveyListItem,
  CreateSurveyDTO,
  UpdateSurveyDTO,
  SurveyResponse,
  SurveyResult,
} from '../models/survey.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class SurveyService {
  private readonly supabase: SupabaseClient = createClient(
    environment.supabaseUrl,
    environment.supabasePublishableKey
  );

  // Signals für State Management
  private allSurveysSignal = signal<Survey[]>([]);
  private currentSurveySignal = signal<Survey | null>(null);
  private userResponsesSignal = signal<SurveyResponse[]>([]);
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
          ends_at: surveyData.endsAt ?? null,
        })
        .select('id')
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
      // TODO: Ersetze mit echtem Supabase Insert
      // const { error } = await this.supabase
      //   .from('survey_responses')
      //   .insert([response]);
      // if (error) throw error;
      // this.userResponsesSignal.update((responses) => [...responses, response]);
      return true;
    } catch (err) {
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
}
