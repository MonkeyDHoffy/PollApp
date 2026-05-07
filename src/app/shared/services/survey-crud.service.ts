import { Injectable } from '@angular/core';
import {
  CreateSurveyDTO,
  CreateSurveyResult,
  Survey,
  UpdateSurveyDTO,
} from '../models/survey.model';
import { DEMO_SURVEYS } from '../demo/demo-surveys';
import { supabaseClient } from './supabase-client';
import { SurveyStateService } from './survey-state.service';

/**
 * Encapsulates all database CRUD operations for surveys.
 * Reads and writes state exclusively through {@link SurveyStateService}.
 */
@Injectable({ providedIn: 'root' })
export class SurveyCrudService {
  private readonly supabase = supabaseClient;
  private useLegacySurveyColumns = false;

  constructor(private readonly state: SurveyStateService) {}

  // ── Public CRUD ───────────────────────────────────────────────────────────

  /** Loads all surveys from the database and stores them in state. */
  async loadAllSurveys(): Promise<void> {
    this.state.setLoading(true);
    this.state.setError(null);
    try {
      await this.fetchAndStoreAllSurveys();
    } catch (err) {
      this.state.setError(err instanceof Error ? err.message : 'Failed to load surveys');
    } finally {
      this.state.setLoading(false);
    }
  }

  /** Loads a single survey by ID and sets the currentSurvey state. */
  async loadSurveyById(surveyId: string): Promise<void> {
    if (this.state.isDemoSurveyId(surveyId)) {
      return this.loadDemoSurvey(surveyId);
    }
    this.state.setLoading(true);
    this.state.setError(null);
    try {
      await this.fetchAndStoreSurveyById(surveyId);
    } catch (err) {
      this.state.setError(err instanceof Error ? err.message : 'Failed to load survey');
    } finally {
      this.state.setLoading(false);
    }
  }

  /** Creates a new survey with questions and answers. */
  async createSurvey(dto: CreateSurveyDTO): Promise<CreateSurveyResult | null> {
    this.state.setLoading(true);
    this.state.setError(null);
    try {
      return await this.performCreateSurvey(dto);
    } catch (err) {
      this.state.setError(err instanceof Error ? err.message : 'Failed to create survey');
      return null;
    } finally {
      this.state.setLoading(false);
    }
  }

  /** Updates metadata of an existing survey. */
  async updateSurvey(surveyId: string, updates: UpdateSurveyDTO): Promise<boolean> {
    this.state.setLoading(true);
    this.state.setError(null);
    try {
      return await this.performUpdateSurvey(surveyId, updates);
    } catch (err) {
      this.state.setError(err instanceof Error ? err.message : 'Failed to update survey');
      return false;
    } finally {
      this.state.setLoading(false);
    }
  }

  /** Deletes a survey and removes it from local state. */
  async deleteSurvey(surveyId: string): Promise<boolean> {
    this.state.setLoading(true);
    this.state.setError(null);
    try {
      return await this.performDeleteSurvey(surveyId);
    } catch (err) {
      this.state.setError(err instanceof Error ? err.message : 'Failed to delete survey');
      return false;
    } finally {
      this.state.setLoading(false);
    }
  }

  // ── Private: fetch helpers ────────────────────────────────────────────────

  private async fetchAndStoreAllSurveys(): Promise<void> {
    const { data, error } = await this.supabase
      .from('surveys')
      .select(this.buildSelectQuery())
      .order('created_at', { ascending: false });
    if (error) {
      if (await this.handleLegacyFallback(error, () => this.loadAllSurveys())) return;
      throw error;
    }
    this.state.setAllSurveys((data ?? []).map((row) => this.mapSurveyRow(row)));
  }

  private async fetchAndStoreSurveyById(surveyId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('surveys')
      .select(this.buildSelectQuery())
      .eq('id', surveyId)
      .single();
    if (error) {
      if (await this.handleLegacyFallback(error, () => this.loadSurveyById(surveyId))) return;
      throw error;
    }
    this.state.setCurrentSurvey(this.mapSurveyRow(data));
  }

  /** Resolves a demo survey synchronously and stores it in state. */
  private loadDemoSurvey(surveyId: string): void {
    this.state.setLoading(true);
    this.state.setError(null);
    const demo = DEMO_SURVEYS.find((s) => s.id === surveyId) ?? null;
    this.state.setCurrentSurvey(this.state.cloneSurvey(demo));
    if (!demo) this.state.setError('Demo survey not found');
    this.state.setLoading(false);
  }

  // ── Private: CRUD helpers ─────────────────────────────────────────────────

  private async performCreateSurvey(dto: CreateSurveyDTO): Promise<CreateSurveyResult> {
    const { id: userId, email } = await this.getAuthUser();
    const payload = this.buildSurveyInsertPayload(dto, userId, email ?? null);
    const created = await this.insertSurveyRow(payload);
    await this.insertQuestionsWithAnswers(created.id, dto.questions);
    await this.loadAllSurveys();
    return { id: created.id, shareToken: created.share_token ?? undefined };
  }

  private async performUpdateSurvey(surveyId: string, updates: UpdateSurveyDTO): Promise<boolean> {
    const payload = this.buildSurveyUpdatePayload(updates);
    const { error } = await this.supabase.from('surveys').update(payload).eq('id', surveyId);
    if (error) throw error;
    await this.loadAllSurveys();
    if (this.state.currentSurvey()?.id === surveyId) await this.loadSurveyById(surveyId);
    return true;
  }

  private async performDeleteSurvey(surveyId: string): Promise<boolean> {
    const { error } = await this.supabase.from('surveys').delete().eq('id', surveyId);
    if (error) throw error;
    this.state.updateAllSurveys((surveys) => surveys.filter((s) => s.id !== surveyId));
    if (this.state.currentSurvey()?.id === surveyId) this.state.setCurrentSurvey(null);
    return true;
  }

  // ── Private: auth helpers ─────────────────────────────────────────────────

  private async getAuthUser(): Promise<{ id: string; email?: string }> {
    const { data: { user }, error } = await this.supabase.auth.getUser();
    if (error) throw error;
    if (!user) throw new Error('Please log in before creating a survey.');
    return user;
  }

  // ── Private: payload builders ─────────────────────────────────────────────

  private buildSurveyInsertPayload(
    dto: CreateSurveyDTO,
    userId: string,
    email: string | null,
  ): Record<string, unknown> {
    const base: Record<string, unknown> = {
      creator_id: userId,
      creator_email: email,
      title: dto.title,
      description: dto.description ?? null,
      category: dto.category,
      status: dto.status ?? 'published',
      ends_at: dto.endsAt ?? null,
    };
    if (!this.useLegacySurveyColumns) {
      base['visibility'] = dto.visibility ?? 'public';
      base['is_anonymous'] = dto.isAnonymous ?? false;
      base['share_token'] = this.state.generateToken(12);
      base['access_code'] = dto.accessCode ?? null;
    }
    return base;
  }

  private buildSurveyUpdatePayload(updates: UpdateSurveyDTO): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    if (updates.title !== undefined) payload['title'] = updates.title;
    if (updates.description !== undefined) payload['description'] = updates.description ?? null;
    if (updates.category !== undefined) payload['category'] = updates.category;
    if (updates.status !== undefined) payload['status'] = updates.status;
    if (updates.endsAt !== undefined) payload['ends_at'] = updates.endsAt ?? null;
    if (!this.useLegacySurveyColumns) {
      if (updates.visibility !== undefined) payload['visibility'] = updates.visibility;
      if (updates.accessCode !== undefined) payload['access_code'] = updates.accessCode || null;
      if (updates.isAnonymous !== undefined) payload['is_anonymous'] = updates.isAnonymous;
    }
    return payload;
  }

  // ── Private: DB inserts ───────────────────────────────────────────────────

  private async insertSurveyRow(
    payload: Record<string, unknown>,
  ): Promise<{ id: string; share_token?: string | null }> {
    const select = this.useLegacySurveyColumns ? 'id' : 'id, share_token';
    const { data, error } = await this.supabase
      .from('surveys').insert(payload).select(select).single();
    if (error) return this.handleInsertRowError(error, payload);
    return data as unknown as { id: string; share_token?: string | null };
  }

  private async handleInsertRowError(
    error: unknown,
    payload: Record<string, unknown>,
  ): Promise<{ id: string; share_token?: string | null }> {
    if (!this.useLegacySurveyColumns && this.isLegacySchemaError(error)) {
      this.useLegacySurveyColumns = true;
      this.state.setSchemaNotice(this.schemaNoticeText());
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { visibility, is_anonymous, share_token, access_code, ...rest } = payload as Record<string, unknown>;
      return this.insertSurveyRow(rest);
    }
    throw error;
  }

  private async insertQuestionsWithAnswers(
    surveyId: string,
    questions: CreateSurveyDTO['questions'],
  ): Promise<void> {
    for (let i = 0; i < questions.length; i++) {
      await this.insertQuestion(surveyId, questions[i], i);
    }
  }

  private async insertQuestion(
    surveyId: string,
    question: CreateSurveyDTO['questions'][0],
    index: number,
  ): Promise<void> {
    const row = this.buildQuestionRow(surveyId, question, index);
    const { data: created, error } = await this.supabase
      .from('survey_questions').insert(row).select('id').single();
    if (error) throw error;
    await this.insertAnswers(created.id, question.answers);
  }

  private buildQuestionRow(
    surveyId: string,
    question: CreateSurveyDTO['questions'][0],
    index: number,
  ): Record<string, unknown> {
    return {
      survey_id: surveyId,
      question_text: question.text,
      question_description: question.description ?? null,
      question_type: question.type,
      allow_multiple: question.allowMultiple ?? false,
      sort_order: index,
    };
  }

  private async insertAnswers(
    questionId: string,
    answers: { text: string }[],
  ): Promise<void> {
    if (answers.length === 0) return;
    const rows = answers.map((a, idx) => ({
      question_id: questionId,
      answer_text: a.text,
      sort_order: idx,
    }));
    const { error } = await this.supabase.from('survey_answers').insert(rows);
    if (error) throw error;
  }

  // ── Private: row mappers ──────────────────────────────────────────────────

  private mapSurveyRow(row: any): Survey {
    return {
      id: row.id,
      creatorId: row.creator_id,
      title: row.title,
      description: row.description ?? undefined,
      category: row.category,
      status: row.status,
      visibility: row.visibility ?? 'public',
      isAnonymous: row.is_anonymous ?? false,
      shareToken: row.share_token ?? undefined,
      accessCode: row.access_code ?? undefined,
      questions: this.mapQuestionRows(row.survey_questions),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      endsAt: row.ends_at ?? '',
      totalResponses: this.extractResponseCount(row.survey_responses),
    };
  }

  private mapQuestionRows(raw: any): Survey['questions'] {
    const rows: any[] = Array.isArray(raw) ? raw : [];
    return rows
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((q) => ({
        id: q.id,
        text: q.question_text,
        description: q.question_description ?? undefined,
        type: q.question_type,
        allowMultiple: q.allow_multiple,
        order: q.sort_order,
        answers: this.mapAnswerRows(q.survey_answers),
      }));
  }

  private mapAnswerRows(raw: any): Survey['questions'][0]['answers'] {
    const rows: any[] = Array.isArray(raw) ? raw : [];
    return rows
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((a) => ({ id: a.id, text: a.answer_text, order: a.sort_order }));
  }

  /** Extracts the total response count from a Supabase aggregate result. */
  private extractResponseCount(raw: any): number {
    return Array.isArray(raw) && raw.length > 0 ? (raw[0]?.count ?? 0) : 0;
  }

  // ── Private: schema helpers ───────────────────────────────────────────────

  /** Returns the appropriate SELECT query based on the detected schema version. */
  private buildSelectQuery(): string {
    return this.useLegacySurveyColumns ? this.legacySelectQuery() : this.fullSelectQuery();
  }

  private legacySelectQuery(): string {
    return `
      id, creator_id, title, description, category, status,
      ends_at, created_at, updated_at,
      survey_questions (
        id, question_text, question_type, allow_multiple, sort_order,
        survey_answers ( id, answer_text, sort_order )
      )
    `;
  }

  private fullSelectQuery(): string {
    return `
      id, creator_id, title, description, category, status,
      visibility, is_anonymous, share_token, access_code,
      ends_at, created_at, updated_at,
      survey_responses(count),
      survey_questions (
        id, question_text, question_description, question_type, allow_multiple, sort_order,
        survey_answers ( id, answer_text, sort_order )
      )
    `;
  }

  /**
   * Switches to legacy schema mode, sets the notice, and retries the given operation.
   * Returns true when the fallback was applied.
   */
  private async handleLegacyFallback(
    error: unknown,
    retryFn: () => Promise<void>,
  ): Promise<boolean> {
    if (this.useLegacySurveyColumns || !this.isLegacySchemaError(error)) return false;
    this.useLegacySurveyColumns = true;
    this.state.setSchemaNotice(this.schemaNoticeText());
    await retryFn();
    return true;
  }

  private isLegacySchemaError(err: unknown): boolean {
    const text = this.errorText(err).toLowerCase();
    const legacyColumns = ['visibility', 'is_anonymous', 'share_token', 'access_code', 'question_description'];
    return text.includes('column') && legacyColumns.some((col) => text.includes(col));
  }

  private errorText(err: unknown): string {
    if (!err) return '';
    if (typeof err === 'string') return err;
    if (err instanceof Error) return err.message;
    if (typeof err === 'object') {
      const e = err as { message?: string; details?: string; hint?: string; code?: string };
      return [e.message, e.details, e.hint, e.code].filter(Boolean).join(' ');
    }
    return '';
  }

  private schemaNoticeText(): string {
    return 'Supabase schema is outdated. Please run supabase/schema.sql in the Supabase SQL Editor and reload the app to enable private sharing features.';
  }
}
