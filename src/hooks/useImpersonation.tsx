import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseExternal';
import { useImpersonationStore } from '@/store/useImpersonationStore';
import { useAuth } from '@/hooks/useAuth';
import { useAudit } from '@/hooks/useAudit';
import { toast } from '@/hooks/use-toast';

interface TargetUserInfo {
  id: string;
  user_id: string;
  name: string;
  username?: string;
  plan_type: string;
  avatar_url?: string;
}

export function useImpersonation() {
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { logAction } = useAudit();
  const { 
    isImpersonating, 
    targetUser, 
    originalAdminId,
    sessionId,
    startImpersonation, 
    endImpersonation,
    getImpersonationInfo 
  } = useImpersonationStore();

  const impersonateUser = async (targetUserInfo: TargetUserInfo) => {
    if (!user) {
      toast({
        title: 'Erro',
        description: 'Você precisa estar logado como admin.',
        variant: 'destructive',
      });
      return false;
    }

    setIsLoading(true);

    try {
      // 1. Criar sessão de impersonificação no banco
      const { data: session, error: sessionError } = await supabase
        .from('admin_impersonation_sessions')
        .insert({
          admin_user_id: user.id,
          target_user_id: targetUserInfo.user_id,
          target_user_name: targetUserInfo.name,
          target_user_plan: targetUserInfo.plan_type || 'free',
        })
        .select()
        .single();

      if (sessionError) {
        if (sessionError.code === 'PGRST205') {
          throw new Error('Tabela de sessões de acesso admin ausente no banco. Execute o SQL informado no chat e tente novamente.');
        }
        throw sessionError;
      }

      // 2. Registrar no audit log
      await logAction('user_impersonated', {
        targetResource: 'profiles',
        targetId: targetUserInfo.id,
        details: {
          target_name: targetUserInfo.name,
          target_username: targetUserInfo.username,
          target_plan: targetUserInfo.plan_type,
          session_id: session.id,
        },
      });

      // 3. Salvar estado de impersonificação
      startImpersonation(
        {
          id: targetUserInfo.id,
          name: targetUserInfo.name,
          username: targetUserInfo.username,
          plan_type: targetUserInfo.plan_type || 'free',
          avatar_url: targetUserInfo.avatar_url,
        },
        user.id,
        session.id
      );

      toast({
        title: 'Modo Teste Ativado',
        description: `Você está visualizando como ${targetUserInfo.name}`,
      });

      // 4. Redirecionar para o feed (como se fosse o usuário)
      navigate('/feed');
      
      return true;
    } catch (error: any) {
      console.error('Erro ao impersonificar:', error);
      toast({
        title: 'Erro ao acessar conta',
        description: error.message || 'Não foi possível acessar a conta do usuário.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const exitImpersonation = async () => {
    setIsLoading(true);

    try {
      // 1. Marcar sessão como inativa
      if (sessionId) {
        await supabase
          .from('admin_impersonation_sessions')
          .update({ is_active: false })
          .eq('id', sessionId);
      }

      // 2. Registrar fim da impersonificação
      if (targetUser) {
        await logAction('impersonation_ended', {
          targetResource: 'profiles',
          targetId: targetUser.id,
          details: {
            target_name: targetUser.name,
            session_id: sessionId,
            duration_minutes: getImpersonationInfo()?.duration || 0,
          },
        });
      }

      // 3. Limpar estado
      endImpersonation();

      toast({
        title: 'Modo Teste Encerrado',
        description: 'Você voltou para o painel administrativo.',
      });

      // 4. Redirecionar para admin
      navigate('/admin/dashboard');
      
      return true;
    } catch (error: any) {
      console.error('Erro ao encerrar impersonificação:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível encerrar o modo teste.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isImpersonating,
    targetUser,
    isLoading,
    impersonateUser,
    exitImpersonation,
    getImpersonationInfo,
  };
}
