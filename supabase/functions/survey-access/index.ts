import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function mapSurvey(row: any) {
  const questions = Array.isArray(row.survey_questions) ? row.survey_questions : [];
  return {
    id: row.id,
    creatorId: row.creator_id,
    title: row.title,
    description: row.description,
    category: row.category,
    status: row.status,
    visibility: row.visibility,
    shareToken: row.share_token,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    endsAt: row.ends_at ?? row.created_at,
    totalResponses: 0,
    questions: questions
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((question: any) => ({
        id: question.id,
        text: question.question_text,
        type: question.question_type,
        allowMultiple: !!question.allow_multiple,
        order: question.sort_order,
        answers: (Array.isArray(question.survey_answers) ? question.survey_answers : [])
          .sort((a: any, b: any) => a.sort_order - b.sort_order)
          .map((answer: any) => ({
            id: answer.id,
            text: answer.answer_text,
            order: answer.sort_order,
          })),
      })),
  };
}

function mapResults(questions: any[], answerCountMap: Map<string, number>) {
  return questions.map((question: any) => {
    const answers = (Array.isArray(question.survey_answers) ? question.survey_answers : [])
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((answer: any) => ({
        id: answer.id,
        text: answer.answer_text,
        count: answerCountMap.get(answer.id) ?? 0,
      }));

    const total = answers.reduce((sum: number, answer: any) => sum + answer.count, 0);

    return {
      questionId: question.id,
      questionText: question.question_text,
      answers: answers.map((answer: any) => ({
        ...answer,
        percentage: total === 0 ? 0 : Math.round((answer.count / total) * 100),
      })),
    };
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { code: 'SERVER_CONFIG_ERROR', message: 'Missing Supabase env vars' });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json();
    const shareToken = (body?.shareToken ?? '').toString().trim();
    const accessCode = body?.accessCode ? body.accessCode.toString().trim() : null;

    if (!shareToken) {
      return jsonResponse(400, { code: 'INVALID_INPUT', message: 'shareToken is required' });
    }

    const { data: surveyRow, error: surveyError } = await admin
      .from('surveys')
      .select(
        `
        id,
        creator_id,
        title,
        description,
        category,
        status,
        visibility,
        share_token,
        access_code,
        ends_at,
        created_at,
        updated_at,
        survey_questions (
          id,
          question_text,
          question_type,
          allow_multiple,
          sort_order,
          survey_answers (
            id,
            answer_text,
            sort_order
          )
        )
      `
      )
      .eq('share_token', shareToken)
      .single();

    if (surveyError || !surveyRow) {
      return jsonResponse(404, { code: 'SURVEY_NOT_FOUND', message: 'Survey not found' });
    }

    if (surveyRow.status !== 'published') {
      return jsonResponse(403, { code: 'SURVEY_NOT_PUBLISHED', message: 'Survey is not published' });
    }

    if (surveyRow.ends_at && new Date(surveyRow.ends_at).getTime() < Date.now()) {
      return jsonResponse(403, { code: 'SURVEY_CLOSED', message: 'Survey is closed' });
    }

    if (surveyRow.visibility === 'private') {
      if (!surveyRow.access_code) {
        return jsonResponse(403, { code: 'ACCESS_CODE_REQUIRED', message: 'Access code required' });
      }

      if (!accessCode || accessCode !== surveyRow.access_code) {
        return jsonResponse(403, { code: 'INVALID_ACCESS_CODE', message: 'Invalid access code' });
      }
    }

    const { data: responseAnswerRows, error: responseAnswerError } = await admin
      .from('survey_response_answers')
      .select(
        `
        answer_id,
        survey_responses!inner (
          survey_id
        )
      `
      )
      .eq('survey_responses.survey_id', surveyRow.id);

    if (responseAnswerError) {
      return jsonResponse(500, { code: 'RESULTS_LOAD_FAILED', message: responseAnswerError.message });
    }

    const answerCountMap = new Map<string, number>();
    for (const row of responseAnswerRows ?? []) {
      const answerId = row.answer_id as string;
      answerCountMap.set(answerId, (answerCountMap.get(answerId) ?? 0) + 1);
    }

    const questions = Array.isArray(surveyRow.survey_questions) ? surveyRow.survey_questions : [];
    return jsonResponse(200, {
      survey: mapSurvey(surveyRow),
      results: mapResults(questions, answerCountMap),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse(500, { code: 'SERVER_ERROR', message });
  }
});