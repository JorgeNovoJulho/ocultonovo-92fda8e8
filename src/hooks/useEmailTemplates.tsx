import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { appUrl } from '@/lib/appConfig';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';

export interface EmailTemplate {
  id: string;
  template_key: string;
  name: string;
  description: string | null;
  subject: string;
  html_content: string;
  variables: string[];
  is_active: boolean;
  category: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export function useEmailTemplates() {
  return useQuery({
    queryKey: ['email-templates'],
    queryFn: async (): Promise<EmailTemplate[]> => {
      const { data, error } = await (supabase as any)
        .from('email_templates')
        .select('*')
        .order('category', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      return data || [];
    },
  });
}

export function useEmailTemplate(templateKey: string) {
  return useQuery({
    queryKey: ['email-template', templateKey],
    queryFn: async (): Promise<EmailTemplate | null> => {
      const { data, error } = await (supabase as any)
        .from('email_templates')
        .select('*')
        .eq('template_key', templateKey)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      return data;
    },
    enabled: !!templateKey,
  });
}

interface UpdateTemplateParams {
  id: string;
  subject?: string;
  html_content?: string;
  is_active?: boolean;
  name?: string;
  description?: string;
}

export function useUpdateEmailTemplate() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UpdateTemplateParams) => {
      if (!user) throw new Error('Não autenticado');

      const updateData: any = {
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      };

      if (params.subject !== undefined) updateData.subject = params.subject;
      if (params.html_content !== undefined) updateData.html_content = params.html_content;
      if (params.is_active !== undefined) updateData.is_active = params.is_active;
      if (params.name !== undefined) updateData.name = params.name;
      if (params.description !== undefined) updateData.description = params.description;

      const { error } = await (supabase as any)
        .from('email_templates')
        .update(updateData)
        .eq('id', params.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
      toast({
        title: 'Template salvo',
        description: 'O template de email foi atualizado com sucesso.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao salvar',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useResetEmailTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (templateId: string) => {
      // For now, we don't have a "default" stored separately
      // This could be enhanced to store defaults in a separate table
      toast({
        title: 'Funcionalidade em desenvolvimento',
        description: 'O reset para o padrão será implementado em breve.',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-templates'] });
    },
  });
}

export function usePreviewEmailTemplate() {
  return useMutation({
    mutationFn: async ({ html_content, variables }: { html_content: string; variables: Record<string, string> }) => {
      let preview = html_content;
      
      // Replace all variables with sample values
      Object.entries(variables).forEach(([key, value]) => {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        preview = preview.replace(regex, value);
      });
      
      return preview;
    },
  });
}

// Send test email hook
export function useSendTestEmail() {
  return useMutation({
    mutationFn: async ({ template_key, test_email }: { template_key: string; test_email: string }) => {
      const { data, error } = await supabase.functions.invoke('send-test-email', {
        body: { template_key, test_email },
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast({
        title: '📧 Email de teste enviado!',
        description: data?.sandbox 
          ? data.message 
          : `Enviado para ${data?.message?.replace('Email de teste enviado para ', '')}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao enviar email de teste',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

// Sample values for preview
export const SAMPLE_TEMPLATE_VALUES: Record<string, string> = {
  user_name: 'João Silva',
  amount: 'R$ 29,90',
  payment_url: appUrl('/checkout/retry'),
  platform_url: appUrl('/feed'),
  platform_name: 'Oculto Swing',
  support_email: 'suporte@oculto.app',
};
