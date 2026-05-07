import { Injectable } from '@angular/core';
import { SurveyStateService } from './survey-state.service';
import { SurveyVotingService } from './survey-voting.service';

/**
 * Builds CSV exports of survey results for download in the browser.
 */
@Injectable({ providedIn: 'root' })
export class SurveyExportService {
  constructor(
    private readonly state: SurveyStateService,
    private readonly voting: SurveyVotingService,
  ) {}

  /**
   * Builds a CSV string containing all results of a survey.
   * Prepends a UTF-8 BOM so that Excel renders umlauts correctly.
   */
  async buildResultsCsv(surveyId: string): Promise<string> {
    const results = await this.voting.loadSurveyResults(surveyId);
    const title = this.resolveSurveyTitle(surveyId);
    const exported = this.formatExportTimestamp();
    const lines = this.buildCsvLines(title, exported, results);
    return '﻿' + lines.join('\n');
  }

  // ── Private: builders ─────────────────────────────────────────────────────

  private resolveSurveyTitle(surveyId: string): string {
    const survey =
      this.state.allSurveys().find((s) => s.id === surveyId) ?? this.state.currentSurvey();
    return survey?.title ?? surveyId;
  }

  private formatExportTimestamp(): string {
    const now = new Date();
    const date = now.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    return `${date}, ${time} Uhr`;
  }

  private buildCsvLines(
    title: string,
    exported: string,
    results: ReturnType<typeof Array.prototype.map>,
  ): string[] {
    const lines: string[] = [this.escape(`Umfrage: ${title}`), this.escape(`Exportiert: ${exported}`)];
    results.forEach((result: any, i: number) => {
      lines.push('');
      lines.push(this.escape(`${i + 1}. ${result.questionText}`));
      lines.push(['Antwort', 'Stimmen', 'Anteil'].map((h) => this.escape(h)).join(','));
      for (const answer of result.answers) {
        lines.push([this.escape(answer.text), String(answer.count), `${answer.percentage}%`].join(','));
      }
    });
    return lines;
  }

  /** Wraps a CSV cell value in double quotes and escapes inner quotes. */
  private escape(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
  }
}
