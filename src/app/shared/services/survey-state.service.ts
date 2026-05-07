import { Injectable, computed, signal } from '@angular/core';
import { Survey, SurveyResponse, SurveyResult } from '../models/survey.model';
import { DEMO_SURVEY_RESULTS } from '../demo/demo-surveys';

/**
 * Centraler State-Container für alle Survey-Signale.
 * Sub-Services schreiben über die Mutations-Methoden, Komponenten lesen nur-lesbare Signale.
 */
@Injectable({ providedIn: 'root' })
export class SurveyStateService {
  private readonly _allSurveys = signal<Survey[]>([]);
  private readonly _currentSurvey = signal<Survey | null>(null);
  private readonly _userResponses = signal<SurveyResponse[]>([]);
  private readonly _demoResults = signal<Record<string, SurveyResult[]>>(this.buildInitialDemoResults());
  private readonly _sharedResults = signal<Record<string, SurveyResult[]>>({});
  private readonly _shareAccessCodes = signal<Record<string, string>>({});
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _schemaNotice = signal<string | null>(null);

  // ── Public read-only signals ──────────────────────────────────────────────

  readonly allSurveys = this._allSurveys.asReadonly();
  readonly currentSurvey = this._currentSurvey.asReadonly();
  readonly userResponses = this._userResponses.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly schemaNotice = this._schemaNotice.asReadonly();

  readonly activeSurveys = computed(() =>
    this._allSurveys()
      .filter((s) => s.status === 'published' && new Date(s.endsAt) > new Date())
      .sort((a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime())
  );

  readonly pastSurveys = computed(() =>
    this._allSurveys()
      .filter((s) => s.status === 'published' && new Date(s.endsAt) <= new Date())
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  );

  readonly endingSoonSurveys = computed(() => this.activeSurveys().slice(0, 3));

  // ── State mutations (used by sub-services) ────────────────────────────────

  setLoading(v: boolean): void { this._loading.set(v); }
  setError(msg: string | null): void { this._error.set(msg); }
  clearError(): void { this._error.set(null); }
  setSchemaNotice(msg: string): void { this._schemaNotice.set(msg); }
  setCurrentSurvey(survey: Survey | null): void { this._currentSurvey.set(survey); }
  setAllSurveys(surveys: Survey[]): void { this._allSurveys.set(surveys); }
  updateAllSurveys(fn: (surveys: Survey[]) => Survey[]): void { this._allSurveys.update(fn); }
  clearUserResponses(): void { this._userResponses.set([]); }
  addUserResponse(response: SurveyResponse): void {
    this._userResponses.update((rs) => [...rs, response]);
  }

  updateDemoResults(fn: (s: Record<string, SurveyResult[]>) => Record<string, SurveyResult[]>): void {
    this._demoResults.update(fn);
  }

  getDemoResults(): Record<string, SurveyResult[]> { return this._demoResults(); }

  getSharedResults(surveyId: string): SurveyResult[] | undefined {
    return this._sharedResults()[surveyId];
  }

  setSharedResults(surveyId: string, results: SurveyResult[]): void {
    this._sharedResults.update((s) => ({ ...s, [surveyId]: results }));
  }

  getShareAccessCode(shareToken: string): string | undefined {
    return this._shareAccessCodes()[shareToken];
  }

  setShareAccessCode(shareToken: string, code: string): void {
    this._shareAccessCodes.update((s) => ({ ...s, [shareToken]: code }));
  }

  // ── Shared utilities ──────────────────────────────────────────────────────

  isDemoSurveyId(surveyId: string): boolean { return surveyId.startsWith('demo-'); }

  cloneResults(results: SurveyResult[]): SurveyResult[] {
    return results.map((r) => ({ ...r, answers: r.answers.map((a) => ({ ...a })) }));
  }

  cloneSurvey(survey: Survey | null): Survey | null {
    if (!survey) return null;
    return {
      ...survey,
      questions: survey.questions.map((q) => ({ ...q, answers: q.answers.map((a) => ({ ...a })) })),
    };
  }

  ensureParticipantToken(key: string): string {
    const storageKey = `pollapp.participant.${key}`;
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null;
    if (stored) return stored;
    const token = this.generateToken(24);
    if (typeof localStorage !== 'undefined') localStorage.setItem(storageKey, token);
    return token;
  }

  generateToken(length: number): string {
    const source =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().replace(/-/g, '')
        : `${Date.now()}${Math.random().toString(36).slice(2)}`;
    return source.slice(0, length);
  }

  private buildInitialDemoResults(): Record<string, SurveyResult[]> {
    return Object.fromEntries(
      Object.entries(DEMO_SURVEY_RESULTS).map(([id, results]) => [
        id,
        results.map((r) => ({ ...r, answers: r.answers.map((a) => ({ ...a })) })),
      ])
    );
  }
}
