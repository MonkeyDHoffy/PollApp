/**
 * Survey Models & Types
 * Definiert die Datenstruktur für die Supabase-Integration
 */

export type SurveyStatus = 'draft' | 'published' | 'closed';
export type SurveyVisibility = 'public' | 'private';

export interface SurveyAnswer {
  id: string;
  text: string;
  order: number;
}

export interface SurveyQuestion {
  id: string;
  text: string;
  description?: string;
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
  visibility: SurveyVisibility;
  isAnonymous: boolean;
  shareToken?: string;
  accessCode?: string;
  questions: SurveyQuestion[];
  createdAt: string;
  updatedAt: string;
  endsAt: string; // ISO Date
  totalResponses: number;
}

export interface SurveyResponse {
  id?: string;
  surveyId: string;
  respondentId?: string;
  respondentName?: string | null;
  participantToken?: string;
  answers: {
    questionId: string;
    selectedAnswerIds: string[];
  }[];
  respondedAt?: string;
}

export interface SurveyParticipant {
  name: string | null;
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
  endsAt?: string;
  status?: SurveyStatus;
  visibility?: SurveyVisibility;
  isAnonymous?: boolean;
  accessCode?: string;
  questions: {
    text: string;
    description?: string;
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
  visibility?: SurveyVisibility;
  isAnonymous?: boolean;
  accessCode?: string;
}

export interface CreateSurveyResult {
  id: string;
  shareToken?: string;
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
