import { Injectable, Signal, inject } from '@angular/core';
import {
  CreateSurveyDTO,
  CreateSurveyResult,
  Survey,
  SurveyParticipant,
  SurveyResponse,
  SurveyResult,
  UpdateSurveyDTO,
} from '../models/survey.model';
import { DEMO_SURVEYS } from '../demo/demo-surveys';
import { supabaseClient } from './supabase-client';
import { SurveyStateService } from './survey-state.service';
import { SurveyCrudService } from './survey-crud.service';
import { SurveyVotingService } from './survey-voting.service';
import { SurveyShareService } from './survey-share.service';
import { SurveyExportService } from './survey-export.service';

/**
 * Public API facade for all survey operations.
 * Delegates to specialised sub-services; components should only inject this service.
 */
@Injectable({ providedIn: 'root' })
export class SurveyService {
  private readonly state = inject(SurveyStateService);
  private readonly crud = inject(SurveyCrudService);
  private readonly voting = inject(SurveyVotingService);
  private readonly share = inject(SurveyShareService);
  private readonly exportSvc = inject(SurveyExportService);

  // ── State signals (read-only) ─────────────────────────────────────────────

  readonly allSurveys: Signal<Survey[]> = this.state.allSurveys;
  readonly currentSurvey: Signal<Survey | null> = this.state.currentSurvey;
  readonly userResponses: Signal<SurveyResponse[]> = this.state.userResponses;
  readonly loading: Signal<boolean> = this.state.loading;
  readonly error: Signal<string | null> = this.state.error;
  readonly schemaNotice: Signal<string | null> = this.state.schemaNotice;
  readonly activeSurveys: Signal<Survey[]> = this.state.activeSurveys;
  readonly pastSurveys: Signal<Survey[]> = this.state.pastSurveys;
  readonly endingSoonSurveys: Signal<Survey[]> = this.state.endingSoonSurveys;

  constructor() {
    void this.crud.loadAllSurveys();
    supabaseClient.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        this.state.setCurrentSurvey(null);
        this.state.clearUserResponses();
      }
      void this.crud.loadAllSurveys();
    });
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  /** Clears the current error state. */
  clearError(): void { this.state.clearError(); }
  /** Sets the currently displayed survey. */
  setCurrentSurvey(survey: Survey | null): void { this.state.setCurrentSurvey(survey); }

  /** Loads all surveys from the database. */
  loadAllSurveys(): Promise<void> { return this.crud.loadAllSurveys(); }
  /** Loads a single survey by ID. */
  loadSurveyById(id: string): Promise<void> { return this.crud.loadSurveyById(id); }
  /** Creates a new survey and returns its ID and share token. */
  createSurvey(dto: CreateSurveyDTO): Promise<CreateSurveyResult | null> { return this.crud.createSurvey(dto); }
  /** Updates survey metadata. Returns `true` on success. */
  updateSurvey(id: string, updates: UpdateSurveyDTO): Promise<boolean> { return this.crud.updateSurvey(id, updates); }
  /** Deletes a survey. Returns `true` on success. */
  deleteSurvey(id: string): Promise<boolean> { return this.crud.deleteSurvey(id); }

  // ── Voting & results ──────────────────────────────────────────────────────

  /** Saves a participant's answers. Returns `true` on success. */
  submitSurveyResponse(response: SurveyResponse): Promise<boolean> { return this.voting.submitSurveyResponse(response); }
  /** Loads result aggregates for a survey. */
  loadSurveyResults(id: string, bustCache?: boolean): Promise<SurveyResult[]> { return this.voting.loadSurveyResults(id, bustCache); }
  /** Returns the total participant count. */
  loadParticipantCount(id: string): Promise<number> { return this.voting.loadParticipantCount(id); }
  /** Returns the list of participants with names and timestamps. */
  loadSurveyParticipants(id: string): Promise<SurveyParticipant[]> { return this.voting.loadSurveyParticipants(id); }
  /** Checks the database to see if a user has already responded. */
  checkUserHasResponded(surveyId: string, userId: string): Promise<boolean> { return this.voting.checkUserHasResponded(surveyId, userId); }
  /** Checks localStorage for a prior vote flag. */
  hasAlreadyVoted(surveyId: string, userId?: string | null): boolean { return this.voting.hasAlreadyVoted(surveyId, userId); }
  /** Persists the selected answer IDs in localStorage. */
  savePreviousAnswers(surveyId: string, answers: Record<string, string[]>): void { this.voting.savePreviousAnswers(surveyId, answers); }
  /** Retrieves previously persisted answer IDs from localStorage. */
  getPreviousAnswers(surveyId: string): Record<string, string[]> { return this.voting.getPreviousAnswers(surveyId); }

  // ── Share & realtime ──────────────────────────────────────────────────────

  /** Loads a survey via a share token and optional access code. */
  loadSurveyByShareToken(token: string, code?: string): Promise<boolean> { return this.share.loadSurveyByShareToken(token, code); }

  /** Subscribes to real-time result updates. Returns a cleanup function. */
  subscribeToSurveyUpdates(
    surveyId: string,
    onUpdate: () => void,
    onStatusChange?: (status: 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR') => void,
  ): () => void {
    return this.share.subscribeToSurveyUpdates(surveyId, onUpdate, onStatusChange);
  }

  // ── Export ────────────────────────────────────────────────────────────────

  /** Builds a CSV string with all results of the given survey. */
  buildResultsCsv(surveyId: string): Promise<string> { return this.exportSvc.buildResultsCsv(surveyId); }

  // ── Demo helpers ──────────────────────────────────────────────────────────

  /** Returns deep-cloned copies of the static demo surveys. */
  getDemoSurveys(): Survey[] {
    return DEMO_SURVEYS.map((s) => ({
      ...s,
      questions: s.questions.map((q) => ({ ...q, answers: q.answers.map((a) => ({ ...a })) })),
    }));
  }
}
