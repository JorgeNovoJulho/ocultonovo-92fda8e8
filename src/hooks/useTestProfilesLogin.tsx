import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';

export interface TestProfile {
  id: string;
  user_id: string;
  name: string;
  plan_type: string;
  avatar_url: string | null;
  email?: string;
}

// Credenciais fixas dos perfis de teste (definidas na edge function)
const TEST_CREDENTIALS: Record<string, { email: string; password: string }> = {
  'free': { email: 'tester-free@oculto.app', password: 'TesterFree2024!' },
  'premium': { email: 'tester-premium@oculto.app', password: 'TesterPremium2024!' },
  'vip': { email: 'tester-vip@oculto.app', password: 'TesterVIP2024!' },
};

export function useTestProfilesLogin() {
  const [profiles, setProfiles] = useState<TestProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const navigate = useNavigate();

  const fetchTestProfiles = async () => {
    setIsLoading(true);
    try {
      // Buscar perfis onde is_test_account = true usando query genérica
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, name, plan_type, avatar_url')
        .filter('is_test_account', 'eq', true)
        .order('plan_type', { ascending: true });

      if (error) throw error;
      
      // Cast para o tipo correto e adicionar email derivado
      const profilesData = (data as unknown as Array<{
        id: string;
        user_id: string;
        name: string;
        plan_type: string;
        avatar_url: string | null;
      }>) || [];
      
      const profilesWithEmail: TestProfile[] = profilesData.map(p => ({
        ...p,
        email: TEST_CREDENTIALS[p.plan_type]?.email || `tester-${p.plan_type}@oculto.app`,
      }));
      
      setProfiles(profilesWithEmail);
    } catch (error) {
      console.error('[useTestProfilesLogin] Erro ao buscar perfis:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loginAsTestProfile = async (planType: string) => {
    const credentials = TEST_CREDENTIALS[planType];
    if (!credentials) {
      toast({
        title: 'Erro',
        description: 'Credenciais não encontradas para este plano de teste.',
        variant: 'destructive',
      });
      return false;
    }

    setIsLoggingIn(true);
    try {
      // Fazer logout do admin atual
      await supabase.auth.signOut();

      // Login como perfil de teste
      const { error } = await supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      });

      if (error) throw error;

      toast({
        title: '🧪 Modo Teste Ativado',
        description: `Você está logado como Tester ${planType.charAt(0).toUpperCase() + planType.slice(1)}`,
      });

      // Redirecionar para o feed
      navigate('/feed');
      return true;
    } catch (error: any) {
      console.error('[useTestProfilesLogin] Erro ao fazer login:', error);
      toast({
        title: 'Erro ao fazer login',
        description: error.message || 'Não foi possível acessar o perfil de teste.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoggingIn(false);
    }
  };

  const getPlanLabel = (planType: string) => {
    switch (planType) {
      case 'free':
        return 'Gratuito';
      case 'premium':
        return 'Premium';
      case 'vip':
        return 'VIP';
      default:
        return planType;
    }
  };

  const getPlanColor = (planType: string) => {
    switch (planType) {
      case 'free':
        return 'bg-muted text-muted-foreground';
      case 'premium':
        return 'bg-primary/20 text-primary';
      case 'vip':
        return 'bg-[hsl(45,93%,47%)]/20 text-[hsl(45,93%,47%)]';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  useEffect(() => {
    fetchTestProfiles();
  }, []);

  return {
    profiles,
    isLoading,
    isLoggingIn,
    loginAsTestProfile,
    fetchTestProfiles,
    getPlanLabel,
    getPlanColor,
    testCredentials: TEST_CREDENTIALS,
  };
}
