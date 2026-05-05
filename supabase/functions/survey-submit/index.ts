import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const ALLOWED_ORIGINS = [
  'https://www.pollapp.hoffja.de',
  'https://pollapp.hoffja.de',
  'http://localhost:4200',
  'http://localhost:4201',
];

function getCorsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

function jsonResponse(status: number, body: Record<string, unknown>, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(origin),
      'Content-Type': 'application/json',
    },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(origin) });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { code: 'SERVER_CONFIG_ERROR', message: 'Missing Supabase env vars' }, origin);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json();
    const shareToken = (body?.shareToken ?? '').toString().trim();
    const accessCode = body?.accessCode ? body.accessCode.toString().trim() : null;
    const participantToken = (body?.participantToken ?? '').toString().trim();
    const answers = Array.isArray(body?.answers) ? body.answers : [];
    const respondentName = typeof body?.respondentName === 'string' ? body.respondentName.trim() || null : null;

    if (!shareToken) {
      return jsonResponse(400, { code: 'INVALID_INPUT', message: 'shareToken is required' }, origin);
    }

    // Resolve authenticated user from JWT if present
    let respondentId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      respondentId = user?.id ?? null;
    }

    // Guests must supply a participantToken for deduplication
    if (!respondentId && !participantToken) {
      return jsonResponse(400, { code: 'INVALID_INPUT', message: 'participantToken is required for guests' }, origin);
    }

    const { data: surveyRow, error: surveyError } = await admin
      .from('surveys')
      .select('id, status, visibility, access_code, ends_at')
      .eq('share_token', shareToken)
      .single();

    if (surveyError || !surveyRow) {
      return jsonResponse(404, { code: 'SURVEY_NOT_FOUND', message: 'Survey not found' }, origin);
    }

    if (surveyRow.status !== 'published') {
      return jsonResponse(403, { code: 'SURVEY_NOT_PUBLISHED', message: 'Survey is not published' }, origin);
    }

    if (surveyRow.ends_at && new Date(surveyRow.ends_at).getTime() < Date.now()) {
      return jsonResponse(403, { code: 'SURVEY_CLOSED', message: 'Survey is closed' }, origin);
    }

    if (surveyRow.visibility === 'private') {
      if (!surveyRow.access_code) {
        return jsonResponse(403, { code: 'ACCESS_CODE_REQUIRED', message: 'Access code required' }, origin);
      }

      if (!accessCode || accessCode !== surveyRow.access_code) {
        return jsonResponse(403, { code: 'INVALID_ACCESS_CODE', message: 'Invalid access code' }, origin);
      }
    }

    // Deduplication: logged-in users by respondent_id, guests by participant_token
    const duplicateQuery = respondentId
      ? admin.from('survey_responses').select('id').eq('survey_id', surveyRow.id).eq('respondent_id', respondentId).maybeSingle()
      : admin.from('survey_responses').select('id').eq('survey_id', surveyRow.id).eq('participant_token', participantToken).maybeSingle();

    const { data: existingResponse, error: existingResponseError } = await duplicateQuery;

    if (existingResponseError) {
      return jsonResponse(500, { code: 'RESPONSE_LOOKUP_FAILED', message: existingResponseError.message }, origin);
    }

    if (existingResponse?.id) {
      return jsonResponse(409, { code: 'ALREADY_SUBMITTED', message: 'Already submitted' }, origin);
    }

    const insertPayload: Record<string, unknown> = {
      survey_id: surveyRow.id,
      respondent_name: respondentName,
    };

    if (respondentId) {
      insertPayload['respondent_id'] = respondentId;
    } else {
      insertPayload['participant_token'] = participantToken;
    }

    const { data: insertedResponse, error: insertedResponseError } = await admin
      .from('survey_responses')
      .insert(insertPayload)
      .select('id')
      .single();

    if (insertedResponseError || !insertedResponse) {
      return jsonResponse(500, { code: 'RESPONSE_INSERT_FAILED', message: insertedResponseError?.message ?? 'Unknown insert failure' }, origin);
    }

    const answerRows = answers.flatMap((entry: any) => {
      const questionId = entry?.questionId;
      const selectedAnswerIds = Array.isArray(entry?.selectedAnswerIds) ? entry.selectedAnswerIds : [];
      return selectedAnswerIds.map((answerId: string) => ({
        response_id: insertedResponse.id,
        question_id: questionId,
        answer_id: answerId,
      }));
    });

    if (answerRows.length > 0) {
      const { error: answersInsertError } = await admin.from('survey_response_answers').insert(answerRows);
      if (answersInsertError) {
        return jsonResponse(500, { code: 'ANSWER_INSERT_FAILED', message: answersInsertError.message }, origin);
      }
    }

    return jsonResponse(200, { ok: true }, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse(500, { code: 'SERVER_ERROR', message }, origin);
  }
});
