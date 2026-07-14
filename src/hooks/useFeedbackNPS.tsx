import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';

export interface NPSSurvey {
  id: string;
  name: string;
  description: string | null;
  question: string;
  followup_question: string | null;
  trigger_type: string;
  trigger_event: string | null;
  trigger_days_after_signup: number | null;
  target_audience: string;
  is_active: boolean;
  show_frequency_days: number;
  start_date: string | null;
  end_date: string | null;
  responses_count: number;
  avg_score: number | null;
  nps_score: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface NPSResponse {
  id: string;
  survey_id: string;
  user_id: string | null;
  score: number;
  comment: string | null;
  category: 'promoter' | 'passive' | 'detractor';
  user_agent: string | null;
  page_url: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface FeedbackForm {
  id: string;
  name: string;
  description: string | null;
  form_type: string;
  fields: any[];
  thank_you_message: string;
  is_active: boolean;
  responses_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeedbackResponse {
  id: string;
  form_id: string;
  user_id: string | null;
  responses: Record<string, any>;
  rating: number | null;
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  status: string;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface FeatureRequest {
  id: string;
  user_id: string | null;
  title: string;
  description: string;
  category: string;
  status: string;
  priority: string;
  votes_count: number;
  admin_response: string | null;
  responded_by: string | null;
  responded_at: string | null;
  estimated_release: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

// ========== NPS Surveys ==========

export function useNPSSurveys() {
  return useQuery({
    queryKey: ['nps-surveys'],
    queryFn: async (): Promise<NPSSurvey[]> => {
      const { data, error } = await supabase
        .from('nps_surveys')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as NPSSurvey[];
    },
  });
}

export function useNPSSurvey(surveyId: string | null) {
  return useQuery({
    queryKey: ['nps-survey', surveyId],
    queryFn: async (): Promise<NPSSurvey | null> => {
      if (!surveyId) return null;
      const { data, error } = await supabase
        .from('nps_surveys')
        .select('*')
        .eq('id', surveyId)
        .single();

      if (error) throw error;
      return data as unknown as NPSSurvey;
    },
    enabled: !!surveyId,
  });
}

export function useCreateNPSSurvey() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (survey: Record<string, any>) => {
      const { data, error } = await supabase
        .from('nps_surveys')
        .insert({
          name: survey.name,
          description: survey.description || null,
          question: survey.question,
          followup_question: survey.followup_question || null,
          trigger_type: survey.trigger_type || 'manual',
          show_frequency_days: survey.show_frequency_days || 90,
          is_active: survey.is_active ?? true,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nps-surveys'] });
      toast({ title: 'Pesquisa NPS criada' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao criar pesquisa', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateNPSSurvey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Record<string, any> & { id: string }) => {
      const { error } = await supabase
        .from('nps_surveys')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nps-surveys'] });
      toast({ title: 'Pesquisa atualizada' });
    },
  });
}

export function useDeleteNPSSurvey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (surveyId: string) => {
      const { error } = await supabase.from('nps_surveys').delete().eq('id', surveyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nps-surveys'] });
      toast({ title: 'Pesquisa excluída' });
    },
  });
}

export function useNPSResponses(surveyId: string | null) {
  return useQuery({
    queryKey: ['nps-responses', surveyId],
    queryFn: async (): Promise<NPSResponse[]> => {
      if (!surveyId) return [];
      const { data, error } = await supabase
        .from('nps_responses')
        .select('*')
        .eq('survey_id', surveyId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as NPSResponse[];
    },
    enabled: !!surveyId,
  });
}

export function useSubmitNPSResponse() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ surveyId, score, comment }: { surveyId: string; score: number; comment?: string }) => {
      const { error } = await supabase.from('nps_responses').insert({
        survey_id: surveyId,
        user_id: user?.id,
        score,
        comment,
        user_agent: navigator.userAgent,
        page_url: window.location.href,
      });

      if (error) throw error;

      // Recalculate NPS
      await supabase.rpc('calculate_nps', { p_survey_id: surveyId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nps-surveys'] });
      toast({ title: '💜 Obrigado pelo feedback!', description: 'Sua opinião é muito importante para nós.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao enviar', description: error.message, variant: 'destructive' });
    },
  });
}

// Check if user should see NPS
export function useShouldShowNPS(surveyId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['should-show-nps', surveyId, user?.id],
    queryFn: async (): Promise<boolean> => {
      if (!surveyId || !user?.id) return false;
      
      const { data, error } = await supabase.rpc('should_show_nps', {
        p_user_id: user.id,
        p_survey_id: surveyId,
      });

      if (error) return false;
      return data === true;
    },
    enabled: !!surveyId && !!user?.id,
  });
}

// ========== Feedback Forms ==========

export function useFeedbackForms() {
  return useQuery({
    queryKey: ['feedback-forms'],
    queryFn: async (): Promise<FeedbackForm[]> => {
      const { data, error } = await supabase
        .from('feedback_forms')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as FeedbackForm[];
    },
  });
}

export function useFeedbackForm(formId: string | null) {
  return useQuery({
    queryKey: ['feedback-form', formId],
    queryFn: async (): Promise<FeedbackForm | null> => {
      if (!formId) return null;
      const { data, error } = await supabase
        .from('feedback_forms')
        .select('*')
        .eq('id', formId)
        .single();

      if (error) throw error;
      return data as unknown as FeedbackForm;
    },
    enabled: !!formId,
  });
}

export function useFeedbackResponses(formId: string | null) {
  return useQuery({
    queryKey: ['feedback-responses', formId],
    queryFn: async (): Promise<FeedbackResponse[]> => {
      let query = supabase
        .from('feedback_responses')
        .select('*')
        .order('created_at', { ascending: false });

      if (formId) {
        query = query.eq('form_id', formId);
      }

      const { data, error } = await query.limit(100);
      if (error) throw error;
      return (data || []) as unknown as FeedbackResponse[];
    },
  });
}

export function useSubmitFeedback() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ formId, responses, rating }: { formId: string; responses: Record<string, any>; rating?: number }) => {
      // Simple sentiment analysis based on rating
      let sentiment: 'positive' | 'neutral' | 'negative' | null = null;
      if (rating) {
        if (rating >= 4) sentiment = 'positive';
        else if (rating >= 3) sentiment = 'neutral';
        else sentiment = 'negative';
      }

      const { error } = await supabase.from('feedback_responses').insert({
        form_id: formId,
        user_id: user?.id,
        responses,
        rating,
        sentiment,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedback-responses'] });
      toast({ title: '✅ Feedback enviado!', description: 'Agradecemos sua contribuição.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao enviar', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateFeedbackStatus() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status, admin_notes }: { id: string; status: string; admin_notes?: string }) => {
      const { error } = await supabase
        .from('feedback_responses')
        .update({
          status,
          admin_notes,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedback-responses'] });
    },
  });
}

// ========== Feature Requests ==========

export function useFeatureRequests(status?: string) {
  return useQuery({
    queryKey: ['feature-requests', status],
    queryFn: async (): Promise<FeatureRequest[]> => {
      let query = supabase
        .from('feature_requests')
        .select('*')
        .order('votes_count', { ascending: false });

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as FeatureRequest[];
    },
  });
}

export function useCreateFeatureRequest() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (request: { title: string; description: string; category?: string }) => {
      const { data, error } = await supabase
        .from('feature_requests')
        .insert({
          ...request,
          user_id: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-requests'] });
      toast({ title: '💡 Sugestão enviada!', description: 'Obrigado por nos ajudar a melhorar.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Erro ao enviar', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateFeatureRequest() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Record<string, any> & { id: string }) => {
      const updateData: Record<string, any> = {
        ...updates,
        updated_at: new Date().toISOString(),
      };

      if (updates.admin_response) {
        updateData.responded_by = user?.id;
        updateData.responded_at = new Date().toISOString();
      }

      const { error } = await supabase.from('feature_requests').update(updateData).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-requests'] });
      toast({ title: 'Sugestão atualizada' });
    },
  });
}

export function useVoteFeatureRequest() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ requestId, hasVoted }: { requestId: string; hasVoted: boolean }) => {
      if (!user?.id) throw new Error('Não autenticado');

      if (hasVoted) {
        // Remove vote
        const { error } = await supabase
          .from('feature_request_votes')
          .delete()
          .eq('request_id', requestId)
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        // Add vote
        const { error } = await supabase
          .from('feature_request_votes')
          .insert({ request_id: requestId, user_id: user.id });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feature-requests'] });
      queryClient.invalidateQueries({ queryKey: ['user-votes'] });
    },
  });
}

export function useUserVotes() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['user-votes', user?.id],
    queryFn: async (): Promise<string[]> => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('feature_request_votes')
        .select('request_id')
        .eq('user_id', user.id);

      if (error) return [];
      return (data || []).map(v => v.request_id);
    },
    enabled: !!user?.id,
  });
}

// ========== Stats ==========

export function useNPSStats() {
  return useQuery({
    queryKey: ['nps-stats'],
    queryFn: async () => {
      const { data: surveys } = await supabase
        .from('nps_surveys')
        .select('nps_score, avg_score, responses_count')
        .eq('is_active', true);

      const totalResponses = surveys?.reduce((sum, s) => sum + (s.responses_count || 0), 0) || 0;
      const avgNPS = surveys?.length 
        ? Math.round(surveys.filter(s => s.nps_score !== null).reduce((sum, s) => sum + (s.nps_score || 0), 0) / surveys.filter(s => s.nps_score !== null).length)
        : null;
      const avgScore = surveys?.length
        ? (surveys.filter(s => s.avg_score !== null).reduce((sum, s) => sum + Number(s.avg_score || 0), 0) / surveys.filter(s => s.avg_score !== null).length).toFixed(1)
        : null;

      return {
        totalResponses,
        avgNPS,
        avgScore,
        activeSurveys: surveys?.length || 0,
      };
    },
  });
}

export function useFeedbackStats() {
  return useQuery({
    queryKey: ['feedback-stats'],
    queryFn: async () => {
      const { data: responses } = await supabase
        .from('feedback_responses')
        .select('status, sentiment, rating');

      const total = responses?.length || 0;
      const newCount = responses?.filter(r => r.status === 'new').length || 0;
      const positive = responses?.filter(r => r.sentiment === 'positive').length || 0;
      const avgRating = responses?.filter(r => r.rating).reduce((sum, r) => sum + (r.rating || 0), 0) || 0;
      const ratingCount = responses?.filter(r => r.rating).length || 1;

      return {
        total,
        new: newCount,
        positiveRate: total > 0 ? Math.round((positive / total) * 100) : 0,
        avgRating: (avgRating / ratingCount).toFixed(1),
      };
    },
  });
}

export function useFeatureRequestStats() {
  return useQuery({
    queryKey: ['feature-request-stats'],
    queryFn: async () => {
      const { data: requests } = await supabase.from('feature_requests').select('status, votes_count');

      return {
        total: requests?.length || 0,
        pending: requests?.filter(r => r.status === 'pending').length || 0,
        planned: requests?.filter(r => r.status === 'planned').length || 0,
        completed: requests?.filter(r => r.status === 'completed').length || 0,
        totalVotes: requests?.reduce((sum, r) => sum + (r.votes_count || 0), 0) || 0,
      };
    },
  });
}
