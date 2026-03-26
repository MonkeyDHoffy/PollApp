import { Injectable, signal, computed } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  Survey,
  SurveyListItem,
  CreateSurveyDTO,
  UpdateSurveyDTO,
  SurveyResponse,
  SurveyResult,
  SurveyStatus,
} from '../models/survey.model';

@Injectable({
  providedIn: 'root',
})
export class SurveyService {
  private supabase: SupabaseClient;

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
    // TODO: Ersetze mit echten Supabase Credentials
    const SUPABASE_URL = 'https://your-project.supabase.co';
    const SUPABASE_KEY = 'your-anon-key';

    this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Initialisiere mit Mock-Daten (später durch Supabase ersetzen)
    this.initializeMockData();
  }

  /**
   * ==================== MOCK DATA (Temporär) ====================
   */
  private initializeMockData(): void {
    const mockSurveys: Survey[] = [
      {
        id: '1',
        creatorId: 'user-1',
        title: "Let's Plan the Next Team Event Together",
        description: 'Help us plan the perfect team activities',
        category: 'Team activities',
        status: 'published',
        questions: [
          {
            id: 'q1',
            text: 'Which date would work best for you?',
            type: 'multiple_choice',
            answers: [
              { id: 'a1', text: 'A. 19.09.2025, Friday', order: 0 },
              { id: 'a2', text: 'B. 10.10.2025, Friday', order: 1 },
              { id: 'a3', text: 'C. 11.10.2025, Saturday', order: 2 },
              { id: 'a4', text: 'D. 31.10.2025, Friday', order: 3 },
            ],
            order: 0,
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 86400000).toISOString(), // 1 Tage
        totalResponses: 45,
      },
      {
        id: '2',
        creatorId: 'user-2',
        title: 'Fit & wellness survey!',
        category: 'Health & Wellness',
        status: 'published',
        questions: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 2 * 86400000).toISOString(), // 2 Tage
        totalResponses: 32,
      },
    ];

    this.allSurveysSignal.set(mockSurveys);
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
      // TODO: Ersetze mit echtem Supabase Query
      // const { data, error } = await this.supabase
      //   .from('surveys')
      //   .select('*')
      //   .order('created_at', { ascending: false });
      // if (error) throw error;
      // this.allSurveysSignal.set(data);
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
      // TODO: Ersetze mit echtem Supabase Query
      // const { data, error } = await this.supabase
      //   .from('surveys')
      //   .select('*')
      //   .eq('id', surveyId)
      //   .single();
      // if (error) throw error;
      // this.currentSurveySignal.set(data);
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
      // TODO: Ersetze mit echtem Supabase Insert
      // const { data, error } = await this.supabase
      //   .from('surveys')
      //   .insert([surveyData])
      //   .select()
      //   .single();
      // if (error) throw error;
      // this.allSurveysSignal.update((surveys) => [...surveys, data]);
      // return data.id;
      return null;
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
}
