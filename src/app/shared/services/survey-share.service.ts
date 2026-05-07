import { Injectable } from '@angular/core';
import { Survey } from '../models/survey.model';
import { supabaseClient } from './supabase-client';
import { SurveyStateService } from './survey-state.service';

type RealtimeStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR';

/**
 * Verwaltet den Zugriff auf geteilte Umfragen und Echtzeit-Abonnements.
 */
@Injectable({ providedIn: 'root' })
export class SurveyShareService {
  private readonly supabase = supabaseClient;

  constructor(private readonly state: SurveyStateService) {}

  /**
   * Lädt eine Umfrage über einen Share-Token (öffentlich oder privat).
   * @returns true wenn die Umfrage erfolgreich geladen wurde
   */
  async loadSurveyByShareToken(shareToken: string, accessCode?: string): Promise<boolean> {
    this.state.setLoading(true);
    this.state.setError(null);
    try {
      const participantToken = this.state.ensureParticipantToken(`share-${shareToken}`);
      const { data, error } = await this.supabase.functions.invoke('survey-access', {
        body: { shareToken, accessCode, participantToken },
      });
      if (error) throw new Error(error.message || 'Failed to load survey');
      if (!data?.survey) throw new Error('SURVEY_NOT_FOUND');
      if (accessCode) this.state.setShareAccessCode(shareToken, accessCode);
      this.state.setCurrentSurvey(this.mapSharedSurvey(data.survey));
      const surveyId = data.survey.id as string;
      this.state.setSharedResults(surveyId, Array.isArray(data.results) ? data.results : []);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load survey';
      this.state.setError(this.normalizeError(msg));
      return false;
    } finally {
      this.state.setLoading(false);
    }
  }

  /**
   * Abonniert Echtzeit-Updates für neue Antworten auf eine Umfrage.
   * @returns Cleanup-Funktion zum Beenden des Abonnements
   */
  subscribeToSurveyUpdates(
    surveyId: string,
    onUpdate: () => void,
    onStatusChange?: (status: RealtimeStatus) => void,
  ): () => void {
    const channel = this.supabase
      .channel(`survey-responses:${surveyId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'survey_responses', filter: `survey_id=eq.${surveyId}` },
        () => onUpdate(),
      )
      .subscribe((status) => onStatusChange?.(status as RealtimeStatus));

    return () => { void this.supabase.removeChannel(channel); };
  }

  // ── Private: mappers ──────────────────────────────────────────────────────

  private mapSharedSurvey(raw: any): Survey {
    return {
      id: raw.id,
      creatorId: raw.creatorId,
      title: raw.title,
      description: raw.description ?? undefined,
      category: raw.category,
      status: raw.status,
      visibility: raw.visibility,
      isAnonymous: raw.isAnonymous ?? false,
      shareToken: raw.shareToken ?? undefined,
      accessCode: undefined,
      questions: this.mapSharedQuestions(raw.questions),
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      endsAt: raw.endsAt,
      totalResponses: raw.totalResponses ?? 0,
    };
  }

  private mapSharedQuestions(raw: any): Survey['questions'] {
    if (!Array.isArray(raw)) return [];
    return raw.map((q: any) => ({
      id: q.id,
      text: q.text,
      description: q.description ?? undefined,
      type: q.type,
      allowMultiple: !!q.allowMultiple,
      order: q.order,
      answers: Array.isArray(q.answers)
        ? q.answers.map((a: any) => ({ id: a.id, text: a.text, order: a.order }))
        : [],
    }));
  }

  private normalizeError(message: string): string {
    if (message.includes('ACCESS_CODE_REQUIRED')) return 'Access code required.';
    if (message.includes('INVALID_ACCESS_CODE')) return 'Invalid access code.';
    if (message.includes('SURVEY_CLOSED')) return 'This survey is already closed.';
    if (message.includes('SURVEY_NOT_FOUND')) return 'Survey not found.';
    return message;
  }
}
