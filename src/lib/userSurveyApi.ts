/**
 * userSurveyApi — camada de acesso ao sistema de pesquisa conversacional.
 * Tabelas: oculto_user_surveys, oculto_user_survey_steps, oculto_user_survey_campaigns
 * Usa exclusivamente o Supabase EXTERNO.
 */
import { supabase } from '@/lib/supabaseExternal';

export type SurveyStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';
export type SurveyAnswerType = 'choice' | 'text' | 'rating' | 'boolean' | 'multi' | 'other';
export type SurveyTargetType = 'all' | 'old_users' | 'new_users' | 'premium' | 'vip';
export type SurveyCampaignStatus = 'draft' | 'active' | 'completed';

export interface UserSurvey {
  id: string;
  user_id: string;
  status: SurveyStatus;
  source_channel: string | null;
  source_channel_other: string | null;
  first_impression: string | null;
  first_impression_note: string | null;
  main_interest: string | null;
  main_interest_note: string | null;
  main_friction: string | null;
  main_friction_note: string | null;
  return_reason: string | null;
  return_reason_note: string | null;
  reward_given: boolean;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserSurveyStep {
  id: string;
  survey_id: string;
  step_number: number;
  question_key: string;
  answer_type: SurveyAnswerType;
  answer_value: string | null;
  answer_note: string | null;
  created_at: string;
}

export interface UserSurveyCampaign {
  id: string;
  created_by: string | null;
  target_type: SurveyTargetType;
  status: SurveyCampaignStatus;
  total_sent: number;
  total_completed: number;
  created_at: string;
}

const sb = supabase as any;

const SURVEY_FLOW_DONE_KEY_PREFIX = 'oculto.survey-flow.done:';

export function hasSurveyFlowDone(userId: string | null | undefined): boolean {
  if (!userId) return false;
  try { return sessionStorage.getItem(SURVEY_FLOW_DONE_KEY_PREFIX + userId) === '1'; }
  catch { return false; }
}

export function markSurveyFlowDone(userId: string | null | undefined): void {
  if (!userId) return;
  try { sessionStorage.setItem(SURVEY_FLOW_DONE_KEY_PREFIX + userId, '1'); } catch { /* noop */ }
}

// ---------------------------------------------------------------------------
// SURVEYS (1 por usuário em curso/concluído)
// ---------------------------------------------------------------------------

export async function getMyCurrentSurvey(userId: string): Promise<UserSurvey | null> {
  const { data: doneData, error: doneError } = await sb
    .from('oculto_user_surveys')
    .select('*')
    .eq('user_id', userId)
    .or('status.in.(completed,skipped),reward_given.eq.true')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (doneError) throw doneError;
  if (doneData) return doneData as UserSurvey;

  const { data, error } = await sb
    .from('oculto_user_surveys')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as UserSurvey | null) ?? null;
}

export async function startSurvey(userId: string): Promise<UserSurvey> {
  // Reaproveita pesquisa pendente/em andamento se existir
  const existing = await getMyCurrentSurvey(userId);
  if (existing && (existing.status === 'completed' || existing.status === 'skipped' || existing.reward_given)) {
    markSurveyFlowDone(userId);
    return existing;
  }
  if (existing && (existing.status === 'pending' || existing.status === 'in_progress')) {
    if (existing.status === 'pending' || !existing.started_at) {
      const { data, error } = await sb
        .from('oculto_user_surveys')
        .update({ status: 'in_progress', started_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error) throw error;
      return data as UserSurvey;
    }
    return existing;
  }

  const { data, error } = await sb
    .from('oculto_user_surveys')
    .insert({
      user_id: userId,
      status: 'in_progress',
      started_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as UserSurvey;
}

export async function updateSurvey(
  surveyId: string,
  patch: Partial<Omit<UserSurvey, 'id' | 'user_id' | 'created_at' | 'updated_at'>>,
): Promise<UserSurvey> {
  const { data, error } = await sb
    .from('oculto_user_surveys')
    .update(patch)
    .eq('id', surveyId)
    .select('*')
    .single();
  if (error) throw error;
  return data as UserSurvey;
}

export async function completeSurvey(surveyId: string): Promise<UserSurvey> {
  return updateSurvey(surveyId, {
    status: 'completed',
    completed_at: new Date().toISOString(),
  });
}

export interface SurveyFinalizeResult {
  ok: boolean;
  granted?: boolean;
  already?: boolean;
  xp_amount?: number;
  new_balance?: number;
  message_sent?: boolean;
  message_id?: string | null;
  conversation_id?: string | null;
  reason?: string;
}

/**
 * Concede +200 XP, registra em xp_transactions, marca reward_given=true e
 * envia a mensagem final do @oculto_master no chat. Idempotente.
 */
export async function finalizeSurveyReward(surveyId: string): Promise<SurveyFinalizeResult> {
  const { data, error } = await sb.rpc('oculto_survey_finalize_reward', {
    p_survey_id: surveyId,
  });
  if (error) {
    console.warn('[userSurveyApi] finalizeSurveyReward error:', error);
    return { ok: false, reason: error.message };
  }
  return (data ?? { ok: false, reason: 'empty_response' }) as SurveyFinalizeResult;
}

export interface SurveyQnaPair {
  question: string;
  answer: string;
  note?: string | null;
}

/**
 * Grava no histórico do chat (entre o usuário e @oculto_master) as perguntas e
 * respostas da pesquisa, em sequência. Idempotente — só insere uma vez.
 */
export async function postSurveyQnaToChat(
  surveyId: string,
  pairs: SurveyQnaPair[],
): Promise<{ ok: boolean; inserted?: number; conversation_id?: string | null; reason?: string }> {
  if (!pairs || pairs.length === 0) return { ok: false, reason: 'no_pairs' };
  const cleanPairs = pairs
    .map((p) => ({
      question: String(p.question ?? '').trim(),
      answer: String(p.answer ?? '').trim(),
      note: p.note ? String(p.note).trim() : null,
    }))
    .filter((p) => p.question && p.answer);
  if (cleanPairs.length === 0) return { ok: false, reason: 'no_pairs' };

  const { data, error } = await sb.rpc('oculto_survey_post_qna_to_chat', {
    p_survey_id: surveyId,
    p_pairs: cleanPairs,
  });
  if (error) {
    console.warn('[userSurveyApi] postSurveyQnaToChat error:', error);
    return { ok: false, reason: error.message };
  }
  return (data ?? { ok: false, reason: 'empty_response' }) as any;
}

export async function skipSurvey(surveyId: string): Promise<UserSurvey> {
  return updateSurvey(surveyId, { status: 'skipped' });
}

// ---------------------------------------------------------------------------
// STEPS (respostas passo a passo)
// ---------------------------------------------------------------------------

export async function listSurveySteps(surveyId: string): Promise<UserSurveyStep[]> {
  const { data, error } = await sb
    .from('oculto_user_survey_steps')
    .select('*')
    .eq('survey_id', surveyId)
    .order('step_number', { ascending: true });
  if (error) throw error;
  return (data ?? []) as UserSurveyStep[];
}

export async function upsertSurveyStep(input: {
  survey_id: string;
  step_number: number;
  question_key: string;
  answer_type: SurveyAnswerType;
  answer_value?: string | null;
  answer_note?: string | null;
}): Promise<UserSurveyStep> {
  const payload = {
    survey_id: input.survey_id,
    step_number: input.step_number,
    question_key: input.question_key,
    answer_type: input.answer_type,
    answer_value: input.answer_value ?? null,
    answer_note: input.answer_note ?? null,
  };
  const { data, error } = await sb
    .from('oculto_user_survey_steps')
    .upsert(payload, { onConflict: 'survey_id,step_number' })
    .select('*')
    .single();
  if (error) throw error;
  return data as UserSurveyStep;
}

// ---------------------------------------------------------------------------
// CAMPAIGNS (admin master)
// ---------------------------------------------------------------------------

export async function listCampaigns(): Promise<UserSurveyCampaign[]> {
  const { data, error } = await sb
    .from('oculto_user_survey_campaigns')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as UserSurveyCampaign[];
}

export async function createCampaign(input: {
  created_by: string;
  target_type: SurveyTargetType;
  status?: SurveyCampaignStatus;
}): Promise<UserSurveyCampaign> {
  const { data, error } = await sb
    .from('oculto_user_survey_campaigns')
    .insert({
      created_by: input.created_by,
      target_type: input.target_type,
      status: input.status ?? 'draft',
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as UserSurveyCampaign;
}

export async function updateCampaign(
  campaignId: string,
  patch: Partial<Pick<UserSurveyCampaign, 'target_type' | 'status' | 'total_sent' | 'total_completed'>>,
): Promise<UserSurveyCampaign> {
  const { data, error } = await sb
    .from('oculto_user_survey_campaigns')
    .update(patch)
    .eq('id', campaignId)
    .select('*')
    .single();
  if (error) throw error;
  return data as UserSurveyCampaign;
}
