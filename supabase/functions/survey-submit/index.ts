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
    const participantToken = (body?.participantToken ?? '').toString().trim();
    const answers = Array.isArray(body?.answers) ? body.answers : [];

    if (!shareToken || !participantToken) {
      return jsonResponse(400, { code: 'INVALID_INPUT', message: 'shareToken and participantToken are required' });
    }

    const { data: surveyRow, error: surveyError } = await admin
      .from('surveys')
      .select('id, status, visibility, access_code, ends_at')
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

    const { data: existingResponse, error: existingResponseError } = await admin
      .from('survey_responses')
      .select('id')
      .eq('survey_id', surveyRow.id)
      .eq('participant_token', participantToken)
      .maybeSingle();

    if (existingResponseError) {
      return jsonResponse(500, { code: 'RESPONSE_LOOKUP_FAILED', message: existingResponseError.message });
    }

    if (existingResponse?.id) {
      return jsonResponse(409, { code: 'ALREADY_SUBMITTED', message: 'Already submitted' });
    }

    const { data: insertedResponse, error: insertedResponseError } = await admin
      .from('survey_responses')
      .insert({
        survey_id: surveyRow.id,
        participant_token: participantToken,
      })
      .select('id')
      .single();

    if (insertedResponseError || !insertedResponse) {
      return jsonResponse(500, { code: 'RESPONSE_INSERT_FAILED', message: insertedResponseError?.message ?? 'Unknown insert failure' });
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
        return jsonResponse(500, { code: 'ANSWER_INSERT_FAILED', message: answersInsertError.message });
      }
    }

    return jsonResponse(200, { ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonResponse(500, { code: 'SERVER_ERROR', message });
  }
});