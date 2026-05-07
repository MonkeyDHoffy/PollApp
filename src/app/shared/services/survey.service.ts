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
 * Öffentliche API für alle Survey-Operationen.
 * Delegiert an spezialisierte Sub-Services; Komponenten binden ausschließlich diesen Service ein.
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

  clearError(): void { this.state.clearError(); }
  setCurrentSurvey(survey: Survey | null): void { this.state.setCurrentSurvey(survey); }

  loadAllSurveys(): Promise<void> { return this.crud.loadAllSurveys(); }
  loadSurveyById(id: string): Promise<void> { return this.crud.loadSurveyById(id); }
  createSurvey(dto: CreateSurveyDTO): Promise<CreateSurveyResult | null> { return this.crud.createSurvey(dto); }
  updateSurvey(id: string, updates: UpdateSurveyDTO): Promise<boolean> { return this.crud.updateSurvey(id, updates); }
  deleteSurvey(id: string): Promise<boolean> { return this.crud.deleteSurvey(id); }

  // ── Voting & results ──────────────────────────────────────────────────────

  submitSurveyResponse(response: SurveyResponse): Promise<boolean> { return this.voting.submitSurveyResponse(response); }
  loadSurveyResults(id: string, bustCache?: boolean): Promise<SurveyResult[]> { return this.voting.loadSurveyResults(id, bustCache); }
  loadParticipantCount(id: string): Promise<number> { return this.voting.loadParticipantCount(id); }
  loadSurveyParticipants(id: string): Promise<SurveyParticipant[]> { return this.voting.loadSurveyParticipants(id); }
  checkUserHasResponded(surveyId: string, userId: string): Promise<boolean> { return this.voting.checkUserHasResponded(surveyId, userId); }
  hasAlreadyVoted(surveyId: string, userId?: string | null): boolean { return this.voting.hasAlreadyVoted(surveyId, userId); }
  savePreviousAnswers(surveyId: string, answers: Record<string, string[]>): void { this.voting.savePreviousAnswers(surveyId, answers); }
  getPreviousAnswers(surveyId: string): Record<string, string[]> { return this.voting.getPreviousAnswers(surveyId); }

  // ── Share & realtime ──────────────────────────────────────────────────────

  loadSurveyByShareToken(token: string, code?: string): Promise<boolean> { return this.share.loadSurveyByShareToken(token, code); }

  subscribeToSurveyUpdates(
    surveyId: string,
    onUpdate: () => void,
    onStatusChange?: (status: 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR') => void,
  ): () => void {
    return this.share.subscribeToSurveyUpdates(surveyId, onUpdate, onStatusChange);
  }

  // ── Export ────────────────────────────────────────────────────────────────

  buildResultsCsv(surveyId: string): Promise<string> { return this.exportSvc.buildResultsCsv(surveyId); }

  // ── Demo helpers ──────────────────────────────────────────────────────────

  getDemoSurveys(): Survey[] {
    return DEMO_SURVEYS.map((s) => ({
      ...s,
      questions: s.questions.map((q) => ({ ...q, answers: q.answers.map((a) => ({ ...a })) })),
    }));
  }
}
