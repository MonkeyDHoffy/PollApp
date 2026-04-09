import { Survey, SurveyResult } from '../models/survey.model';

type DemoAnswerCount = {
  id: string;
  text: string;
  count: number;
};

function buildSurveyResult(
  questionId: string,
  questionText: string,
  answers: DemoAnswerCount[]
): SurveyResult {
  const total = answers.reduce((sum, answer) => sum + answer.count, 0);

  return {
    questionId,
    questionText,
    answers: answers.map((answer) => ({
      id: answer.id,
      text: answer.text,
      count: answer.count,
      percentage: total === 0 ? 0 : Math.round((answer.count / total) * 100),
    })),
  };
}

export const DEMO_SURVEYS: Survey[] = [
  {
    id: 'demo-team-retreat',
    creatorId: 'demo-user',
    title: 'Plan the next team retreat with us',
    description:
      'This demo survey shows a typical company use case: picking activities, timing, and format for a team event.',
    category: 'Team Activities',
    status: 'published',
    visibility: 'public',
    shareToken: 'demoretreat1',
    createdAt: '2026-04-01T10:00:00.000Z',
    updatedAt: '2026-04-08T10:00:00.000Z',
    endsAt: '2026-05-15T12:00:00.000Z',
    totalResponses: 128,
    questions: [
      {
        id: 'demo-q1',
        text: 'Which retreat format sounds best to you?',
        type: 'multiple_choice',
        order: 0,
        allowMultiple: false,
        answers: [
          { id: 'demo-q1-a1', text: 'Day trip with workshops', order: 0 },
          { id: 'demo-q1-a2', text: 'Overnight retreat in nature', order: 1 },
          { id: 'demo-q1-a3', text: 'City experience with team dinner', order: 2 },
          { id: 'demo-q1-a4', text: 'Volunteer day and social event', order: 3 },
        ],
      },
      {
        id: 'demo-q2',
        text: 'What should definitely be included?',
        type: 'checkboxes',
        order: 1,
        allowMultiple: true,
        answers: [
          { id: 'demo-q2-a1', text: 'Hands-on activity', order: 0 },
          { id: 'demo-q2-a2', text: 'Casual networking time', order: 1 },
          { id: 'demo-q2-a3', text: 'Good food options', order: 2 },
          { id: 'demo-q2-a4', text: 'Low-pressure icebreakers', order: 3 },
        ],
      },
      {
        id: 'demo-q3',
        text: 'Which month works best for the team?',
        type: 'multiple_choice',
        order: 2,
        allowMultiple: false,
        answers: [
          { id: 'demo-q3-a1', text: 'May', order: 0 },
          { id: 'demo-q3-a2', text: 'June', order: 1 },
          { id: 'demo-q3-a3', text: 'September', order: 2 },
          { id: 'demo-q3-a4', text: 'October', order: 3 },
        ],
      },
    ],
  },
  {
    id: 'demo-wellbeing-checkin',
    creatorId: 'demo-user',
    title: 'Team wellbeing pulse check',
    description:
      'A short internal survey demo focused on energy, meeting culture, and practical wellbeing improvements.',
    category: 'Health & Wellness',
    status: 'published',
    visibility: 'public',
    shareToken: 'demowellness',
    createdAt: '2026-04-02T10:00:00.000Z',
    updatedAt: '2026-04-08T10:00:00.000Z',
    endsAt: '2026-05-30T12:00:00.000Z',
    totalResponses: 94,
    questions: [
      {
        id: 'demo-q4',
        text: 'How would you rate your current energy level at work?',
        type: 'multiple_choice',
        order: 0,
        allowMultiple: false,
        answers: [
          { id: 'demo-q4-a1', text: 'Very high', order: 0 },
          { id: 'demo-q4-a2', text: 'Mostly good', order: 1 },
          { id: 'demo-q4-a3', text: 'Mixed', order: 2 },
          { id: 'demo-q4-a4', text: 'Often drained', order: 3 },
        ],
      },
      {
        id: 'demo-q5',
        text: 'Which changes would help your week the most?',
        type: 'checkboxes',
        order: 1,
        allowMultiple: true,
        answers: [
          { id: 'demo-q5-a1', text: 'Fewer recurring meetings', order: 0 },
          { id: 'demo-q5-a2', text: 'More focus time', order: 1 },
          { id: 'demo-q5-a3', text: 'Flexible start times', order: 2 },
          { id: 'demo-q5-a4', text: 'Better break culture', order: 3 },
        ],
      },
    ],
  },
  {
    id: 'demo-tooling-stack',
    creatorId: 'demo-user',
    title: 'Choose our next productivity stack',
    description:
      'This product-style demo explores preferences for tools, onboarding, and collaboration habits in a tech team.',
    category: 'Technology & Innovation',
    status: 'published',
    visibility: 'public',
    shareToken: 'demotooling1',
    createdAt: '2026-04-03T10:00:00.000Z',
    updatedAt: '2026-04-08T10:00:00.000Z',
    endsAt: '2026-06-10T12:00:00.000Z',
    totalResponses: 156,
    questions: [
      {
        id: 'demo-q6',
        text: 'Which collaboration tool feels most productive?',
        type: 'multiple_choice',
        order: 0,
        allowMultiple: false,
        answers: [
          { id: 'demo-q6-a1', text: 'Slack', order: 0 },
          { id: 'demo-q6-a2', text: 'Microsoft Teams', order: 1 },
          { id: 'demo-q6-a3', text: 'Discord', order: 2 },
          { id: 'demo-q6-a4', text: 'A mix of async tools', order: 3 },
        ],
      },
      {
        id: 'demo-q7',
        text: 'What matters most when adopting a new tool?',
        type: 'checkboxes',
        order: 1,
        allowMultiple: true,
        answers: [
          { id: 'demo-q7-a1', text: 'Easy onboarding', order: 0 },
          { id: 'demo-q7-a2', text: 'Integrations', order: 1 },
          { id: 'demo-q7-a3', text: 'Clear ownership', order: 2 },
          { id: 'demo-q7-a4', text: 'Low notification noise', order: 3 },
        ],
      },
      {
        id: 'demo-q8',
        text: 'How often should the team review the tool stack?',
        type: 'multiple_choice',
        order: 2,
        allowMultiple: false,
        answers: [
          { id: 'demo-q8-a1', text: 'Quarterly', order: 0 },
          { id: 'demo-q8-a2', text: 'Twice a year', order: 1 },
          { id: 'demo-q8-a3', text: 'Once a year', order: 2 },
          { id: 'demo-q8-a4', text: 'Only when pain is obvious', order: 3 },
        ],
      },
    ],
  },
];

export const DEMO_SURVEY_RESULTS: Record<string, SurveyResult[]> = {
  'demo-team-retreat': [
    buildSurveyResult('demo-q1', 'Which retreat format sounds best to you?', [
      { id: 'demo-q1-a1', text: 'Day trip with workshops', count: 24 },
      { id: 'demo-q1-a2', text: 'Overnight retreat in nature', count: 41 },
      { id: 'demo-q1-a3', text: 'City experience with team dinner', count: 36 },
      { id: 'demo-q1-a4', text: 'Volunteer day and social event', count: 27 },
    ]),
    buildSurveyResult('demo-q2', 'What should definitely be included?', [
      { id: 'demo-q2-a1', text: 'Hands-on activity', count: 67 },
      { id: 'demo-q2-a2', text: 'Casual networking time', count: 78 },
      { id: 'demo-q2-a3', text: 'Good food options', count: 91 },
      { id: 'demo-q2-a4', text: 'Low-pressure icebreakers', count: 43 },
    ]),
    buildSurveyResult('demo-q3', 'Which month works best for the team?', [
      { id: 'demo-q3-a1', text: 'May', count: 18 },
      { id: 'demo-q3-a2', text: 'June', count: 46 },
      { id: 'demo-q3-a3', text: 'September', count: 39 },
      { id: 'demo-q3-a4', text: 'October', count: 25 },
    ]),
  ],
  'demo-wellbeing-checkin': [
    buildSurveyResult('demo-q4', 'How would you rate your current energy level at work?', [
      { id: 'demo-q4-a1', text: 'Very high', count: 11 },
      { id: 'demo-q4-a2', text: 'Mostly good', count: 33 },
      { id: 'demo-q4-a3', text: 'Mixed', count: 38 },
      { id: 'demo-q4-a4', text: 'Often drained', count: 12 },
    ]),
    buildSurveyResult('demo-q5', 'Which changes would help your week the most?', [
      { id: 'demo-q5-a1', text: 'Fewer recurring meetings', count: 49 },
      { id: 'demo-q5-a2', text: 'More focus time', count: 73 },
      { id: 'demo-q5-a3', text: 'Flexible start times', count: 41 },
      { id: 'demo-q5-a4', text: 'Better break culture', count: 29 },
    ]),
  ],
  'demo-tooling-stack': [
    buildSurveyResult('demo-q6', 'Which collaboration tool feels most productive?', [
      { id: 'demo-q6-a1', text: 'Slack', count: 52 },
      { id: 'demo-q6-a2', text: 'Microsoft Teams', count: 31 },
      { id: 'demo-q6-a3', text: 'Discord', count: 19 },
      { id: 'demo-q6-a4', text: 'A mix of async tools', count: 54 },
    ]),
    buildSurveyResult('demo-q7', 'What matters most when adopting a new tool?', [
      { id: 'demo-q7-a1', text: 'Easy onboarding', count: 84 },
      { id: 'demo-q7-a2', text: 'Integrations', count: 96 },
      { id: 'demo-q7-a3', text: 'Clear ownership', count: 44 },
      { id: 'demo-q7-a4', text: 'Low notification noise', count: 73 },
    ]),
    buildSurveyResult('demo-q8', 'How often should the team review the tool stack?', [
      { id: 'demo-q8-a1', text: 'Quarterly', count: 48 },
      { id: 'demo-q8-a2', text: 'Twice a year', count: 63 },
      { id: 'demo-q8-a3', text: 'Once a year', count: 31 },
      { id: 'demo-q8-a4', text: 'Only when pain is obvious', count: 14 },
    ]),
  ],
};