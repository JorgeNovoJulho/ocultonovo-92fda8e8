import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from './use-toast';
import { useAuth } from './useAuth';

// Types
interface GeneratedInvoice {
  id: string;
  transaction_id: string;
  invoice_number: string;
  generated_by: string;
  html_content: string;
  status: string;
  pdf_url?: string;
  sent_at?: string;
  sent_to_email?: string;
  download_count: number;
  last_downloaded_at?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

interface InvoiceSettings {
  id: string;
  creator_id: string;
  company_name?: string;
  company_address?: string;
  company_document?: string;
  logo_url?: string;
  footer_text?: string;
  include_logo: boolean;
  include_qr_code: boolean;
  auto_send_email: boolean;
  custom_css?: string;
  created_at: string;
  updated_at: string;
}

interface InvoiceTemplate {
  id: string;
  name: string;
  description?: string;
  html_template: string;
  is_default: boolean;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

interface InvoiceStats {
  total_invoices: number;
  invoices_today: number;
  invoices_this_month: number;
  total_downloads: number;
  emails_sent: number;
}

// Hook para listar faturas do usuário
export function useMyInvoices() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['my-invoices', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('generated_invoices')
        .select('*')
        .eq('generated_by', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as GeneratedInvoice[];
    },
    enabled: !!user,
  });
}

// Hook para listar todas as faturas (admin)
export function useAllInvoices() {
  return useQuery({
    queryKey: ['all-invoices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('generated_invoices')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      
      if (error) throw error;
      return (data || []) as GeneratedInvoice[];
    },
  });
}

// Hook para gerar fatura via edge function
export function useGenerateInvoice() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (transactionId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) throw new Error('Não autenticado');
      
      const response = await supabase.functions.invoke('generate-invoice-pdf', {
        body: { transaction_id: transactionId },
      });
      
      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['all-invoices'] });
      toast({ title: 'Fatura gerada com sucesso!' });
    },
    onError: (error) => {
      toast({ 
        title: 'Erro ao gerar fatura', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });
}

// Hook para baixar fatura (incrementa contador)
export function useDownloadInvoice() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      // Incrementar contador de downloads
      await supabase.rpc('increment_invoice_download', { invoice_id: invoiceId });
      
      // Buscar fatura
      const { data, error } = await supabase
        .from('generated_invoices')
        .select('html_content, invoice_number')
        .eq('id', invoiceId)
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['my-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['all-invoices'] });
      
      // Criar blob e download
      const blob = new Blob([data.html_content], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.invoice_number}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({ title: 'Fatura baixada!' });
    },
  });
}

// Hook para visualizar fatura em nova aba
export function useViewInvoice() {
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      const { data, error } = await supabase
        .from('generated_invoices')
        .select('html_content')
        .eq('id', invoiceId)
        .single();
      
      if (error) throw error;
      return data.html_content;
    },
    onSuccess: (htmlContent) => {
      const newWindow = window.open('', '_blank');
      if (newWindow) {
        newWindow.document.write(htmlContent);
        newWindow.document.close();
      }
    },
  });
}

// Hook para estatísticas de faturas
export function useInvoiceStats() {
  return useQuery({
    queryKey: ['invoice-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_invoice_stats');
      
      if (error) throw error;
      return (data?.[0] || {
        total_invoices: 0,
        invoices_today: 0,
        invoices_this_month: 0,
        total_downloads: 0,
        emails_sent: 0,
      }) as InvoiceStats;
    },
  });
}

// Hook para configurações de fatura do criador
export function useInvoiceSettings() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['invoice-settings', user?.id],
    queryFn: async () => {
      if (!user) return null;
      
      // Buscar profile do usuário
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();
      
      if (!profile) return null;
      
      const { data, error } = await supabase
        .from('invoice_settings')
        .select('*')
        .eq('creator_id', profile.id)
        .maybeSingle();
      
      if (error) throw error;
      return data as InvoiceSettings | null;
    },
    enabled: !!user,
  });
}

// Hook para salvar configurações de fatura
export function useSaveInvoiceSettings() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (settings: Partial<InvoiceSettings>) => {
      if (!user) throw new Error('Não autenticado');
      
      // Buscar profile do usuário
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();
      
      if (!profile) throw new Error('Perfil não encontrado');
      
      const { data, error } = await supabase
        .from('invoice_settings')
        .upsert({
          creator_id: profile.id,
          ...settings,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-settings'] });
      toast({ title: 'Configurações salvas!' });
    },
  });
}

// Hook para templates de faturas
export function useInvoiceTemplates() {
  return useQuery({
    queryKey: ['invoice-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoice_templates')
        .select('*')
        .eq('is_active', true)
        .order('is_default', { ascending: false });
      
      if (error) throw error;
      return (data || []) as InvoiceTemplate[];
    },
  });
}

// Hook para criar template
export function useCreateInvoiceTemplate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (template: {
      name: string;
      description?: string;
      html_template: string;
      is_default?: boolean;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('invoice_templates')
        .insert([{
          ...template,
          created_by: user?.id,
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice-templates'] });
      toast({ title: 'Template criado!' });
    },
  });
}

// Hook para deletar fatura
export function useDeleteInvoice() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      const { error } = await supabase
        .from('generated_invoices')
        .delete()
        .eq('id', invoiceId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['all-invoices'] });
      toast({ title: 'Fatura removida!' });
    },
  });
}
