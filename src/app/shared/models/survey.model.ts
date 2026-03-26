/**
 * Survey Models & Types
 * Definiert die Datenstruktur für die Supabase-Integration
 */

export type SurveyStatus = 'draft' | 'published' | 'closed';

export interface SurveyAnswer {
  id: string;
  text: string;
  order: number;
}

export interface SurveyQuestion {
  id: string;
  text: string;
  type: 'multiple_choice' | 'checkboxes';
  answers: SurveyAnswer[];
  order: number;
  allowMultiple?: boolean;
}

export interface Survey {
  id: string;
  creatorId: string;
  title: string;
  description?: string;
  category: string;
  status: SurveyStatus;
  questions: SurveyQuestion[];
  createdAt: string;
  updatedAt: string;
  endsAt: string; // ISO Date
  totalResponses: number;
}

export interface SurveyResponse {
  id: string;
  surveyId: string;
  respondentId?: string; // optional für anonyme Antworten
  answers: {
    questionId: string;
    selectedAnswerIds: string[]; // Array für multiple/checkboxes
  }[];
  respondedAt: string;
}

export interface SurveyResult {
  questionId: string;
  questionText: string;
  answers: {
    id: string;
    text: string;
    count: number;
    percentage: number;
  }[];
}

export interface CreateSurveyDTO {
  title: string;
  description?: string;
  category: string;
  endsAt: string;
  questions: {
    text: string;
    type: 'multiple_choice' | 'checkboxes';
    answers: { text: string }[];
    allowMultiple?: boolean;
  }[];
}

export interface UpdateSurveyDTO {
  title?: string;
  description?: string;
  category?: string;
  status?: SurveyStatus;
  endsAt?: string;
}

/**
 * UI-spezifische Modelle
 */
export interface SurveyListItem {
  id: string;
  category: string;
  title: string;
  badgeLabel: string;
  status: SurveyStatus;
  tone: 'base' | 'muted';
}
