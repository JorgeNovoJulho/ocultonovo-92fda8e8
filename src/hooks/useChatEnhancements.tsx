import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

// Screenshot detection and alert
export function useScreenshotAlert() {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ chatId, notifiedUserId }: { chatId: string; notifiedUserId: string }) => {
      if (!user?.id) throw new Error('Usuário não autenticado');

      const { data, error } = await supabase
        .from('screenshot_alerts')
        .insert({
          chat_id: chatId,
          detected_by: user.id,
          notified_user: notifiedUserId,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.warning('📸 Screenshot detectado!');
    },
  });
}

// Unsend message (soft delete with log)
export function useUnsendMessage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ messageId, originalContent }: { messageId: string; originalContent: string }) => {
      if (!user?.id) throw new Error('Usuário não autenticado');

      // Log the unsend
      await supabase.from('message_unsend_logs').insert({
        message_id: messageId,
        unsent_by: user.id,
        original_content: originalContent,
      });

      // Mark message as deleted (assuming messages table has is_deleted column)
      const { error } = await supabase
        .from('messages')
        .update({ 
          content: '[Mensagem apagada]',
          is_deleted: true,
        })
        .eq('id', messageId)
        .eq('sender_id', user.id); // Only allow sender to unsend

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      toast.success('Mensagem apagada para todos');
    },
    onError: () => {
      toast.error('Erro ao apagar mensagem');
    },
  });
}

// Message translation
export function useTranslateMessage() {
  return useMutation({
    mutationFn: async ({ 
      messageId, 
      text, 
      targetLang = 'pt' 
    }: { 
      messageId: string; 
      text: string; 
      targetLang?: string;
    }) => {
      // For now, return a placeholder. In production, integrate with translation API
      // This would call an edge function that uses a translation service
      
      const { data, error } = await supabase
        .from('message_translations')
        .insert({
          message_id: messageId,
          original_lang: 'auto',
          target_lang: targetLang,
          translated_text: text, // Placeholder - would be actual translation
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
  });
}

// Ice breaker suggestions
export function useIceBreakers(targetUserId?: string) {
  const { user } = useAuth();

  return useMutation({
    mutationFn: async () => {
      if (!user?.id || !targetUserId) throw new Error('Dados inválidos');

      // Fetch target user's profile for context
      const { data: targetProfile } = await supabase
        .from('profiles')
        .select('name, bio')
        .eq('id', targetUserId)
        .single();

      // Generate suggestions based on profile
      const suggestions = [
        `Oi ${targetProfile?.name || 'você'}! Vi que temos alguns interesses em comum 😊`,
        `Olá! Seu perfil me chamou atenção. Como você está?`,
        `Ei! Adorei seu perfil. Podemos conversar?`,
      ];

      // Store suggestions
      const { data, error } = await supabase
        .from('ice_breaker_suggestions')
        .insert(
          suggestions.map((text, index) => ({
            user_id: user.id,
            target_user_id: targetUserId,
            suggestion_text: text,
            based_on: index === 0 ? 'interests' : 'general',
          }))
        )
        .select();

      if (error) throw error;
      return data;
    },
  });
}

// Mark ice breaker as used
export function useMarkIceBreakerUsed() {
  return useMutation({
    mutationFn: async (suggestionId: string) => {
      const { error } = await supabase
        .from('ice_breaker_suggestions')
        .update({ was_used: true })
        .eq('id', suggestionId);

      if (error) throw error;
    },
  });
}

// Lucky match - find random compatible online user
export interface LuckyCandidate {
  id: string;
  name?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  gender?: string | null;
  profile_type?: string | null;
  username?: string | null;
}

export function useLuckyMatch() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (opts?: { candidates?: LuckyCandidate[] }) => {
      if (!user?.id) throw new Error('Usuário não autenticado');

      let pool: LuckyCandidate[] = [];

      if (opts?.candidates && opts.candidates.length > 0) {
        // Use pre-filtered candidates (já restritos ao raio atual do radar).
        pool = opts.candidates.filter((c) => c.id && c.id !== user.id);
      } else {
        // Fallback: query DB excluindo self + já dados como match.
        const { data: alreadyMatched } = await supabase
          .from('lucky_matches')
          .select('matched_user_id')
          .eq('user_id', user.id);

        const excludeIds = [user.id, ...(alreadyMatched?.map((m) => m.matched_user_id) || [])];

        const { data: profiles, error } = await supabase
          .from('profiles')
          .select('id, name, avatar_url, bio, gender, profile_type, username')
          .not('id', 'in', `(${excludeIds.join(',')})`)
          .limit(20);

        if (error) throw error;
        pool = (profiles || []) as LuckyCandidate[];
      }

      if (!pool.length) {
        throw new Error('Nenhum perfil disponível no raio atual');
      }

      // Random selection (re-randomizado a cada clique)
      const randomProfile = pool[Math.floor(Math.random() * pool.length)];
      const compatibilityScore = Math.floor(Math.random() * 30) + 70; // 70-100

      // Log do match (best-effort — não bloqueia UX se RLS/duplicata falhar)
      try {
        await supabase.from('lucky_matches').insert({
          user_id: user.id,
          matched_user_id: randomProfile.id,
          compatibility_score: compatibilityScore,
        });
      } catch { /* ignora */ }

      return {
        id: randomProfile.id,
        name: randomProfile.name,
        avatar_url: randomProfile.avatar_url,
        bio: randomProfile.bio,
        gender: randomProfile.gender ?? null,
        profile_type: randomProfile.profile_type ?? null,
        username: randomProfile.username ?? null,
        compatibility_score: compatibilityScore,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lucky-matches'] });
      queryClient.invalidateQueries({ queryKey: ['radar-matches'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao buscar match');
    },
  });
}
