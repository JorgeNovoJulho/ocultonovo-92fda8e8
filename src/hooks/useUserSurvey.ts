/**
 * useUserSurvey — carrega a pesquisa atual do usuário logado e seus steps.
 * Subscreve realtime em oculto_user_surveys e oculto_user_survey_steps.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import {
  getMyCurrentSurvey,
  listSurveySteps,
  startSurvey as apiStartSurvey,
  updateSurvey as apiUpdateSurvey,
  upsertSurveyStep as apiUpsertStep,
  completeSurvey as apiCompleteSurvey,
  skipSurvey as apiSkipSurvey,
  markSurveyFlowDone,
  type UserSurvey,
  type UserSurveyStep,
  type SurveyAnswerType,
} from '@/lib/userSurveyApi';

export interface UseUserSurveyResult {
  loading: boolean;
  survey: UserSurvey | null;
  steps: UserSurveyStep[];
  refresh: () => Promise<void>;
  start: () => Promise<UserSurvey | null>;
  update: (patch: Partial<UserSurvey>) => Promise<UserSurvey | null>;
  saveStep: (input: {
    step_number: number;
    question_key: string;
    answer_type: SurveyAnswerType;
    answer_value?: string | null;
    answer_note?: string | null;
  }) => Promise<UserSurveyStep | null>;
  complete: () => Promise<UserSurvey | null>;
  skip: () => Promise<UserSurvey | null>;
}

export function useUserSurvey(): UseUserSurveyResult {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [loading, setLoading] = useState(true);
  const [survey, setSurvey] = useState<UserSurvey | null>(null);
  const [steps, setSteps] = useState<UserSurveyStep[]>([]);

  const refresh = useCallback(async () => {
    if (!uid) {
      setSurvey(null);
      setSteps([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const s = await getMyCurrentSurvey(uid);
      setSurvey(s);
      if (s?.status === 'completed' || s?.status === 'skipped' || s?.reward_given) {
        markSurveyFlowDone(uid);
      }
      if (s && s.status !== 'completed' && s.status !== 'skipped' && !s.reward_given) {
        const st = await listSurveySteps(s.id);
        setSteps(st);
      } else {
        setSteps([]);
      }
    } catch (err) {
      console.warn('[useUserSurvey] refresh falhou:', err);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Realtime: pesquisa do usuário + steps da pesquisa atual
  useEffect(() => {
    if (!uid) return;
    const ch = supabase
      .channel(`user-survey:${uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'oculto_user_surveys', filter: `user_id=eq.${uid}` },
        () => { void refresh(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [uid, refresh]);

  useEffect(() => {
    if (!survey?.id) return;
    const ch = supabase
      .channel(`user-survey-steps:${survey.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'oculto_user_survey_steps', filter: `survey_id=eq.${survey.id}` },
        () => { void refresh(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [survey?.id, refresh]);

  const start = useCallback(async () => {
    if (!uid) return null;
    try {
      const s = await apiStartSurvey(uid);
      setSurvey(s);
      return s;
    } catch (err) {
      console.warn('[useUserSurvey] start falhou:', err);
      return null;
    }
  }, [uid]);

  const update = useCallback(async (patch: Partial<UserSurvey>) => {
    if (!survey?.id) return null;
    try {
      const s = await apiUpdateSurvey(survey.id, patch as any);
      setSurvey(s);
      return s;
    } catch (err) {
      console.warn('[useUserSurvey] update falhou:', err);
      return null;
    }
  }, [survey?.id]);

  const saveStep: UseUserSurveyResult['saveStep'] = useCallback(async (input) => {
    if (!survey?.id) return null;
    try {
      const step = await apiUpsertStep({ survey_id: survey.id, ...input });
      setSteps((prev) => {
        const others = prev.filter((p) => p.step_number !== step.step_number);
        return [...others, step].sort((a, b) => a.step_number - b.step_number);
      });
      return step;
    } catch (err) {
      console.warn('[useUserSurvey] saveStep falhou:', err);
      return null;
    }
  }, [survey?.id]);

  const complete = useCallback(async () => {
    if (!survey?.id) return null;
    try {
      const s = await apiCompleteSurvey(survey.id);
      setSurvey(s);
      markSurveyFlowDone(uid);
      return s;
    } catch (err) {
      console.warn('[useUserSurvey] complete falhou:', err);
      return null;
    }
  }, [survey?.id, uid]);

  const skip = useCallback(async () => {
    if (!survey?.id) return null;
    try {
      const s = await apiSkipSurvey(survey.id);
      setSurvey(s);
      markSurveyFlowDone(uid);
      return s;
    } catch (err) {
      console.warn('[useUserSurvey] skip falhou:', err);
      return null;
    }
  }, [survey?.id, uid]);

  return { loading, survey, steps, refresh, start, update, saveStep, complete, skip };
}
