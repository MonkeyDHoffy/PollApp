import { Injectable, computed, signal } from '@angular/core';
import { Survey, SurveyResponse, SurveyResult } from '../models/survey.model';
import { DEMO_SURVEY_RESULTS } from '../demo/demo-surveys';

/**
 * Central state container for all survey-related signals.
 * Sub-services write through mutation methods; components only read the read-only signals.
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

  /** Published surveys that have not yet ended, sorted soonest-ending first. */
  readonly activeSurveys = computed(() =>
    this._allSurveys()
      .filter((s) => s.status === 'published' && new Date(s.endsAt) > new Date())
      .sort((a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime())
  );

  /** Published surveys whose end date has passed, sorted most-recently-updated first. */
  readonly pastSurveys = computed(() =>
    this._allSurveys()
      .filter((s) => s.status === 'published' && new Date(s.endsAt) <= new Date())
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  );

  /** The three soonest-ending active surveys for the carousel. */
  readonly endingSoonSurveys = computed(() => this.activeSurveys().slice(0, 3));

  // ── State mutations (used by sub-services) ────────────────────────────────

  /** Sets the global loading state. */
  setLoading(v: boolean): void { this._loading.set(v); }
  /** Sets the global error message (`null` = no error). */
  setError(msg: string | null): void { this._error.set(msg); }
  /** Clears the global error message. */
  clearError(): void { this._error.set(null); }
  /** Sets the schema notice (e.g. legacy-column warning). */
  setSchemaNotice(msg: string): void { this._schemaNotice.set(msg); }
  /** Sets the currently displayed survey. */
  setCurrentSurvey(survey: Survey | null): void { this._currentSurvey.set(survey); }
  /** Replaces the full survey list. */
  setAllSurveys(surveys: Survey[]): void { this._allSurveys.set(surveys); }
  /** Updates the survey list via an updater function. */
  updateAllSurveys(fn: (surveys: Survey[]) => Survey[]): void { this._allSurveys.update(fn); }
  /** Clears the stored user responses. */
  clearUserResponses(): void { this._userResponses.set([]); }

  /** Appends a new user response to the list. */
  addUserResponse(response: SurveyResponse): void {
    this._userResponses.update((rs) => [...rs, response]);
  }

  /** Updates the demo results via an updater function. */
  updateDemoResults(fn: (s: Record<string, SurveyResult[]>) => Record<string, SurveyResult[]>): void {
    this._demoResults.update(fn);
  }

  /** Returns the current demo result cache. */
  getDemoResults(): Record<string, SurveyResult[]> { return this._demoResults(); }

  /** Returns cached results for a shared survey (`undefined` = no cache). */
  getSharedResults(surveyId: string): SurveyResult[] | undefined {
    return this._sharedResults()[surveyId];
  }

  /** Stores results for a shared survey in the cache. */
  setSharedResults(surveyId: string, results: SurveyResult[]): void {
    this._sharedResults.update((s) => ({ ...s, [surveyId]: results }));
  }

  /** Returns the cached access code for a share token. */
  getShareAccessCode(shareToken: string): string | undefined {
    return this._shareAccessCodes()[shareToken];
  }

  /** Stores the access code for a share token in session memory. */
  setShareAccessCode(shareToken: string, code: string): void {
    this._shareAccessCodes.update((s) => ({ ...s, [shareToken]: code }));
  }

  // ── Shared utilities ──────────────────────────────────────────────────────

  /** Returns true when the ID belongs to a demo survey (prefix `demo-`). */
  isDemoSurveyId(surveyId: string): boolean { return surveyId.startsWith('demo-'); }

  /** Creates a deep clone of a result list (required for Signal immutability). */
  cloneResults(results: SurveyResult[]): SurveyResult[] {
    return results.map((r) => ({ ...r, answers: r.answers.map((a) => ({ ...a })) }));
  }

  /** Creates a deep clone of a survey including questions and answers. */
  cloneSurvey(survey: Survey | null): Survey | null {
    if (!survey) return null;
    return {
      ...survey,
      questions: survey.questions.map((q) => ({ ...q, answers: q.answers.map((a) => ({ ...a })) })),
    };
  }

  /**
   * Returns the stored participant token for the given key.
   * Creates and stores a new token if none exists yet.
   */
  ensureParticipantToken(key: string): string {
    const storageKey = `pollapp.participant.${key}`;
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null;
    if (stored) return stored;
    const token = this.generateToken(24);
    if (typeof localStorage !== 'undefined') localStorage.setItem(storageKey, token);
    return token;
  }

  /** Generates a random alphanumeric token of the given length. */
  generateToken(length: number): string {
    const source =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().replace(/-/g, '')
        : `${Date.now()}${Math.random().toString(36).slice(2)}`;
    return source.slice(0, length);
  }

  /** Builds the initial demo result cache from the static demo fixtures. */
  private buildInitialDemoResults(): Record<string, SurveyResult[]> {
    return Object.fromEntries(
      Object.entries(DEMO_SURVEY_RESULTS).map(([id, results]) => [
        id,
        results.map((r) => ({ ...r, answers: r.answers.map((a) => ({ ...a })) })),
      ])
    );
  }
}
