import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseExternal";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface ReplyToStoryParams {
  storyId: string;
  authorProfileId: string;
  content: string;
}

/**
 * Hook para responder a um story via DM
 */
export function useReplyToStory() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ storyId, authorProfileId, content }: ReplyToStoryParams) => {
      if (!user?.id) throw new Error("Usuário não autenticado");

      // 1. Buscar o profile_id do usuário atual
      const { data: currentProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (profileError || !currentProfile) {
        throw new Error("Perfil não encontrado");
      }

      // Não pode responder ao próprio story
      if (currentProfile.id === authorProfileId) {
        throw new Error("Você não pode responder ao seu próprio story");
      }

      // 2. Buscar o user_id e preferências do autor do story
      // Tentativa 1: por profiles.id (caminho padrão)
      let { data: authorProfile, error: authorError } = await supabase
        .from('profiles')
        .select('user_id, notification_preferences, is_seed, name, username')
        .eq('id', authorProfileId)
        .maybeSingle();

      // Fallback: alguns posts antigos usam auth.users.id em author_id
      if ((authorError || !authorProfile) && authorProfileId) {
        const fb = await supabase
          .from('profiles')
          .select('user_id, notification_preferences, is_seed, name, username')
          .eq('user_id', authorProfileId)
          .maybeSingle();
        if (fb.data) {
          authorProfile = fb.data as any;
          authorError = null as any;
        }
      }

      if (!authorProfile) {
        throw new Error("Autor não encontrado");
      }

      // Perfis seed/bot não recebem DMs
      if ((authorProfile as any).is_seed || !authorProfile.user_id) {
        throw new Error("Este perfil não aceita respostas");
      }

      // 3. Buscar ou criar conversa entre os dois usuários
      // Primeiro, verificar se já existe uma conversa
      const { data: existingParticipation } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', user.id);

      let conversationId: string | null = null;

      if (existingParticipation && existingParticipation.length > 0) {
        // Verificar se alguma dessas conversas tem o autor como participante
        for (const participation of existingParticipation) {
          const { data: authorParticipation } = await supabase
            .from('conversation_participants')
            .select('id')
            .eq('conversation_id', participation.conversation_id)
            .eq('user_id', authorProfile.user_id)
            .single();

          if (authorParticipation) {
            conversationId = participation.conversation_id;
            break;
          }
        }
      }

      // 4. Criar nova conversa se não existir
      if (!conversationId) {
        const { data: newConversation, error: convError } = await supabase
          .from('conversations')
          .insert({})
          .select('id')
          .single();

        if (convError || !newConversation) {
          throw new Error("Erro ao criar conversa");
        }

        conversationId = newConversation.id;

        // Adicionar participantes
        const { error: partError } = await supabase
          .from('conversation_participants')
          .insert([
            { conversation_id: conversationId, user_id: user.id },
            { conversation_id: conversationId, user_id: authorProfile.user_id }
          ]);

        if (partError) {
          throw new Error("Erro ao adicionar participantes");
        }
      }

      // 5. Enviar mensagem com referência ao story
      const { data: message, error: msgError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content,
          story_reply_id: storyId
        })
        .select()
        .single();

      if (msgError) {
        throw new Error("Erro ao enviar mensagem");
      }

      // 6. Verificar preferências de notificação do autor antes de criar
      const prefs = (authorProfile as any).notification_preferences;
      const shouldNotify = !prefs || (prefs.push_enabled !== false && prefs.story_replies !== false);
      
      if (shouldNotify) {
        await supabase.from('notifications').insert({
          user_id: authorProfile.user_id,
          type: 'message',
          title: '💬 Resposta ao seu Story',
          body: content.length > 50 ? content.substring(0, 50) + '...' : content,
          data: {
            story_reply: true,
            conversation_id: conversationId,
            actor_id: currentProfile.id,
            story_id: storyId
          }
        });
      }

      return message;
    },
    onSuccess: () => {
      toast.success("Resposta enviada!");
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao enviar resposta");
    }
  });
}
