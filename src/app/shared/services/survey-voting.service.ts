import { Injectable } from '@angular/core';
import { SurveyParticipant, SurveyResponse, SurveyResult } from '../models/survey.model';
import { supabaseClient } from './supabase-client';
import { SurveyStateService } from './survey-state.service';

/** Database representation of a survey question with its answers. */
interface DbQuestion {
  id: string;
  question_text: string;
  sort_order: number;
  survey_answers: DbAnswer[];
}

/** Database representation of a survey answer option. */
interface DbAnswer {
  id: string;
  answer_text: string;
  sort_order: number;
}

/**
 * Encapsulates all voting and result operations.
 * Manages the voting history via localStorage and Supabase.
 */
@Injectable({ providedIn: 'root' })
export class SurveyVotingService {
  private readonly supabase = supabaseClient;

  constructor(private readonly state: SurveyStateService) {}

  // ── Public: submit ────────────────────────────────────────────────────────

  /** Saves the user's answers for a survey. */
  async submitSurveyResponse(response: SurveyResponse): Promise<boolean> {
    this.state.setLoading(true);
    this.state.setError(null);
    try {
      return await this.routeSubmit(response);
    } catch (err) {
      this.state.setError(err instanceof Error ? err.message : 'Failed to submit response');
      return false;
    } finally {
      this.state.setLoading(false);
    }
  }

  // ── Public: read results ──────────────────────────────────────────────────

  /** Computes the results for a survey from the responses in the database. */
  async loadSurveyResults(surveyId: string, bustCache = false): Promise<SurveyResult[]> {
    if (this.state.isDemoSurveyId(surveyId)) {
      return this.state.cloneResults(this.state.getDemoResults()[surveyId] ?? []);
    }
    const cached = !bustCache ? this.state.getSharedResults(surveyId) : undefined;
    if (cached) return this.state.cloneResults(cached);
    return this.fetchLiveSurveyResults(surveyId);
  }

  /** Returns the current participant count for a survey. */
  async loadParticipantCount(surveyId: string): Promise<number> {
    if (this.state.isDemoSurveyId(surveyId)) return 0;
    const { count } = await this.supabase
      .from('survey_responses')
      .select('*', { count: 'exact', head: true })
      .eq('survey_id', surveyId);
    return count ?? 0;
  }

  /** Loads the participant list (name + timestamp) for a survey. */
  async loadSurveyParticipants(surveyId: string): Promise<SurveyParticipant[]> {
    if (this.state.isDemoSurveyId(surveyId)) return [];
    try {
      const { data, error } = await this.supabase
        .from('survey_responses')
        .select('respondent_name, created_at')
        .eq('survey_id', surveyId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        name: (row.respondent_name as string | null) ?? null,
        respondedAt: row.created_at as string,
      }));
    } catch {
      return [];
    }
  }

  // ── Public: vote tracking (localStorage) ─────────────────────────────────

  /** Checks the database to determine if the signed-in user has already responded. */
  async checkUserHasResponded(surveyId: string, userId: string): Promise<boolean> {
    const { count } = await this.supabase
      .from('survey_responses')
      .select('*', { count: 'exact', head: true })
      .eq('survey_id', surveyId)
      .eq('respondent_id', userId);
    return (count ?? 0) > 0;
  }

  /** Checks localStorage to determine if a guest or user has already voted. */
  hasAlreadyVoted(surveyId: string, userId?: string | null): boolean {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(`pollapp.voted.${surveyId}.${userId ?? 'guest'}`) === '1';
  }

  /** Saves the selected answers to localStorage for later restoration. */
  savePreviousAnswers(surveyId: string, answers: Record<string, string[]>): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(`pollapp.answers.${surveyId}`, JSON.stringify(answers));
  }

  /** Reads the most recently saved answers from localStorage. */
  getPreviousAnswers(surveyId: string): Record<string, string[]> {
    if (typeof localStorage === 'undefined') return {};
    try {
      const raw = localStorage.getItem(`pollapp.answers.${surveyId}`);
      return raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    } catch {
      return {};
    }
  }

  // ── Private: submit routing ───────────────────────────────────────────────

  private async routeSubmit(response: SurveyResponse): Promise<boolean> {
    if (this.state.isDemoSurveyId(response.surveyId)) {
      this.applyDemoResponse(response);
      return true;
    }
    const survey = this.state.currentSurvey();
    if (survey?.visibility === 'private' && survey.shareToken) {
      return this.submitPrivateSurveyResponse(response, survey.shareToken);
    }
    return this.submitPublicSurveyResponse(response);
  }

  // ── Private: submit paths ─────────────────────────────────────────────────

  private async submitPrivateSurveyResponse(
    response: SurveyResponse,
    shareToken: string,
  ): Promise<boolean> {
    const { data: { user } } = await this.supabase.auth.getUser();
    const participantToken = user ? null : this.state.ensureParticipantToken(`share-${shareToken}`);
    await this.invokePrivateSubmit(response, shareToken, participantToken);
    this.markAsVoted(response.surveyId, user?.id);
    this.recordPrivateResponse(response, participantToken);
    return true;
  }

  private async invokePrivateSubmit(
    response: SurveyResponse,
    shareToken: string,
    participantToken: string | null,
  ): Promise<void> {
    const accessCode = this.state.getShareAccessCode(shareToken);
    const { error } = await this.supabase.functions.invoke('survey-submit', {
      body: {
        shareToken,
        accessCode,
        participantToken: participantToken ?? '',
        answers: response.answers,
        respondentName: response.respondentName ?? null,
      },
    });
    if (error) throw new Error(error.message || 'Failed to submit response');
  }

  /** Stores the private response in local state after a successful submission. */
  private recordPrivateResponse(response: SurveyResponse, participantToken: string | null): void {
    this.state.addUserResponse({
      ...response,
      participantToken: participantToken ?? undefined,
      id: `shared-${Date.now()}`,
      respondedAt: new Date().toISOString(),
    });
  }

  private async submitPublicSurveyResponse(response: SurveyResponse): Promise<boolean> {
    const { data: { user } } = await this.supabase.auth.getUser();
    const participantToken = user
      ? null
      : (response.participantToken ?? this.state.ensureParticipantToken(response.surveyId));
    const created = await this.insertPublicResponse(response, user?.id ?? null, participantToken);
    await this.insertResponseAnswers(created.id, response.answers);
    this.markAsVoted(response.surveyId, user?.id);
    this.state.addUserResponse({
      ...response, id: created.id, respondentId: user?.id, respondedAt: created.created_at,
    });
    return true;
  }

  private async insertPublicResponse(
    response: SurveyResponse,
    userId: string | null,
    participantToken: string | null,
  ): Promise<{ id: string; created_at: string }> {
    const { data: created, error } = await this.supabase
      .from('survey_responses')
      .insert({
        survey_id: response.surveyId,
        respondent_id: userId,
        participant_token: participantToken,
        respondent_name: response.respondentName ?? null,
      })
      .select('id, created_at')
      .single();
    if (error) { this.handleDuplicateError(error); throw error; }
    return created as { id: string; created_at: string };
  }

  private handleDuplicateError(err: unknown): void {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('ALREADY_SUBMITTED')) {
      this.state.setError('You already submitted this survey.');
      return;
    }
    if (typeof err === 'object' && err && 'code' in err && (err as { code: string }).code === '23505') {
      this.state.setError('You already submitted this survey.');
    }
  }

  private async insertResponseAnswers(
    responseId: string,
    answers: SurveyResponse['answers'],
  ): Promise<void> {
    const rows = answers.flatMap((a) =>
      a.selectedAnswerIds.map((answerId) => ({
        response_id: responseId,
        question_id: a.questionId,
        answer_id: answerId,
      }))
    );
    if (rows.length === 0) return;
    const { error } = await this.supabase.from('survey_response_answers').insert(rows);
    if (error) throw error;
  }

  // ── Private: demo response ────────────────────────────────────────────────

  private applyDemoResponse(response: SurveyResponse): void {
    const current = this.state.cloneResults(this.state.getDemoResults()[response.surveyId] ?? []);
    this.applyAnswersToDemoResults(current, response.answers);
    this.state.updateDemoResults((s) => ({ ...s, [response.surveyId]: current }));
    this.state.addUserResponse({
      ...response, id: `demo-response-${Date.now()}`, respondedAt: new Date().toISOString(),
    });
    this.incrementDemoResponseCount(response.surveyId);
  }

  private applyAnswersToDemoResults(
    results: SurveyResult[],
    answers: SurveyResponse['answers'],
  ): void {
    for (const group of answers) {
      const row = results.find((r) => r.questionId === group.questionId);
      if (!row) continue;
      for (const answerId of group.selectedAnswerIds) {
        const found = row.answers.find((a) => a.id === answerId);
        if (found) found.count += 1;
      }
      const total = row.answers.reduce((s, a) => s + a.count, 0);
      row.answers = row.answers.map((a) => ({
        ...a,
        percentage: total === 0 ? 0 : Math.round((a.count / total) * 100),
      }));
    }
  }

  /** Increments the totalResponses counter on the current survey in state. */
  private incrementDemoResponseCount(surveyId: string): void {
    const survey = this.state.currentSurvey();
    if (survey?.id === surveyId) {
      this.state.setCurrentSurvey({ ...survey, totalResponses: survey.totalResponses + 1 });
    }
  }

  // ── Private: DB queries ───────────────────────────────────────────────────

  private async fetchLiveSurveyResults(surveyId: string): Promise<SurveyResult[]> {
    try {
      const questions = await this.fetchQuestions(surveyId);
      const answerCounts = await this.fetchAnswerCounts(surveyId);
      return this.buildResults(questions, answerCounts);
    } catch (err) {
      this.state.setError(err instanceof Error ? err.message : 'Failed to load survey results');
      return [];
    }
  }

  private async fetchQuestions(surveyId: string): Promise<DbQuestion[]> {
    const { data, error } = await this.supabase
      .from('survey_questions')
      .select('id, question_text, sort_order, survey_answers ( id, answer_text, sort_order )')
      .eq('survey_id', surveyId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  private async fetchAnswerCounts(surveyId: string): Promise<Map<string, number>> {
    const { data, error } = await this.supabase
      .from('survey_response_answers')
      .select('answer_id, survey_responses!inner ( survey_id )')
      .eq('survey_responses.survey_id', surveyId);
    if (error) throw error;
    const map = new Map<string, number>();
    for (const row of data ?? []) {
      const id = row.answer_id as string;
      map.set(id, (map.get(id) ?? 0) + 1);
    }
    return map;
  }

  private buildResults(questions: DbQuestion[], answerCounts: Map<string, number>): SurveyResult[] {
    return questions.map((q) => this.buildQuestionResult(q, answerCounts));
  }

  private buildQuestionResult(q: DbQuestion, answerCounts: Map<string, number>): SurveyResult {
    const answers: DbAnswer[] = Array.isArray(q.survey_answers) ? q.survey_answers : [];
    const total = answers.reduce((s, a) => s + (answerCounts.get(a.id) ?? 0), 0);
    return {
      questionId: q.id,
      questionText: q.question_text,
      answers: answers
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((a) => this.buildAnswerResult(a, answerCounts, total)),
    };
  }

  private buildAnswerResult(a: DbAnswer, answerCounts: Map<string, number>, total: number): { id: string; text: string; count: number; percentage: number } {
    const count = answerCounts.get(a.id) ?? 0;
    return {
      id: a.id,
      text: a.answer_text,
      count,
      percentage: total === 0 ? 0 : Math.round((count / total) * 100),
    };
  }

  // ── Private: vote tracking helpers ───────────────────────────────────────

  private markAsVoted(surveyId: string, userId?: string | null): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(`pollapp.voted.${surveyId}.${userId ?? 'guest'}`, '1');
  }
}
