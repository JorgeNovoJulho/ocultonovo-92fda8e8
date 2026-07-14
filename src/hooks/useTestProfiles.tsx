// Hook para gerenciar perfis de teste "stealth"
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from '@/hooks/use-toast';

export interface TestProfileCredentials {
  email: string;
  password: string;
  name: string;
  plan_type: string;
  profile_id?: string;
}

export interface GenerateTestProfilesResult {
  success: boolean;
  message: string;
  profiles: TestProfileCredentials[];
  errors?: { email: string; error: string }[];
}

export function useGenerateTestProfiles() {
  const [credentials, setCredentials] = useState<TestProfileCredentials[] | null>(null);

  const mutation = useMutation({
    mutationFn: async (): Promise<GenerateTestProfilesResult> => {
      const { data, error } = await supabase.functions.invoke('generate-test-profiles', {
        method: 'POST',
      });

      if (error) {
        throw new Error(error.message || 'Erro ao gerar perfis de teste');
      }

      if (!data.success && data.error) {
        throw new Error(data.error);
      }

      return data as GenerateTestProfilesResult;
    },
    onSuccess: (data) => {
      setCredentials(data.profiles);
      toast({
        title: '✅ Perfis de Teste Criados!',
        description: `${data.profiles.length} perfis stealth foram gerados com sucesso.`,
      });
    },
    onError: (error: Error) => {
      console.error('[useGenerateTestProfiles] Erro:', error);
      toast({
        title: 'Erro ao gerar perfis',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const clearCredentials = () => setCredentials(null);

  return {
    generateTestProfiles: mutation.mutate,
    isGenerating: mutation.isPending,
    credentials,
    clearCredentials,
    error: mutation.error,
  };
}
