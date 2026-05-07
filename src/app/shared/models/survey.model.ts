/**
 * Survey domain models and DTOs used throughout the application.
 * These types mirror the Supabase database schema.
 */

/** Lifecycle state of a survey. */
export type SurveyStatus = 'draft' | 'published' | 'closed';

/** Access level of a survey. */
export type SurveyVisibility = 'public' | 'private';

/** A single selectable answer option within a question. */
export interface SurveyAnswer {
  id: string;
  text: string;
  order: number;
}

/** A question belonging to a survey, with its answer options. */
export interface SurveyQuestion {
  id: string;
  text: string;
  description?: string;
  type: 'multiple_choice' | 'checkboxes';
  answers: SurveyAnswer[];
  order: number;
  allowMultiple?: boolean;
}

/** A complete survey record as returned by the database. */
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
  /** ISO 8601 date string for when the survey closes. */
  endsAt: string;
  totalResponses: number;
}

/** The set of answers submitted by one participant. */
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

/** Lightweight participant record shown in the participants popup. */
export interface SurveyParticipant {
  name: string | null;
  respondedAt: string;
}

/** Aggregated result data for a single question. */
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

/** Payload for creating a new survey. */
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

/** Payload for updating an existing survey's metadata. */
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

/** Return value from a successful survey creation. */
export interface CreateSurveyResult {
  id: string;
  shareToken?: string;
}

/** UI-specific survey shape used in the home page list. */
export interface SurveyListItem {
  id: string;
  category: string;
  title: string;
  badgeLabel: string;
  status: SurveyStatus;
  tone: 'base' | 'muted';
}
