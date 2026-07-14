import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from '@/hooks/use-toast';

export interface PaidContentCheckoutInput {
  postId: string;
  paymentMethod: 'pix' | 'card';
  affiliateUsername?: string | null;
  affiliateIdFromLink?: string | null;
  card?: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
    installments?: number;
  };
}

export interface PaidContentCheckoutResult {
  success: boolean;
  already_purchased?: boolean;
  transaction_id?: string;
  payment_id?: string;
  status?: string;
  payment_method?: 'pix' | 'card';
  qr_code?: string | null;
  qr_code_base64?: string | null;
  invoice_url?: string | null;
  affiliate_applied?: boolean;
  affiliate_source?: 'link' | 'manual' | 'none';
  affiliate_rejected_reason?: string | null;
  amount?: number;
  error?: string;
  error_code?: string;
}

/** Cria checkout ASAAS para conteúdo pago. NÃO libera conteúdo localmente — só após webhook. */
export function useCreatePaidContentCheckout() {
  return useMutation({
    mutationFn: async (input: PaidContentCheckoutInput): Promise<PaidContentCheckoutResult> => {
      const { data, error } = await supabase.functions.invoke('create-paid-content-checkout', {
        body: {
          post_id: input.postId,
          payment_method: input.paymentMethod,
          affiliate_username: input.affiliateUsername ?? null,
          affiliate_id_from_link: input.affiliateIdFromLink ?? null,
          card: input.card ?? null,
        },
      });
      if (error) throw new Error(error.message);
      const result = data as PaidContentCheckoutResult;
      if (!result?.success) throw new Error(result?.error || 'Falha no checkout');
      return result;
    },
    onError: (err: Error) => {
      toast({ title: 'Erro no checkout', description: err.message, variant: 'destructive' });
    },
  });
}

/** Polling do status de uma cobrança PIX */
export function usePaidContentStatusCheck() {
  const queryClient = useQueryClient();
  return async (transactionId: string, postId: string): Promise<{ confirmed: boolean; status: string }> => {
    const { data: tx } = await (supabase as any)
      .from('transactions')
      .select('status')
      .eq('id', transactionId)
      .maybeSingle();
    const status = tx?.status ?? 'pending';
    const confirmed = status === 'completed';
    if (confirmed) {
      queryClient.invalidateQueries({ queryKey: ['media-access', postId] });
      queryClient.invalidateQueries({ queryKey: ['media-access-batch'] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    }
    return { confirmed, status };
  };
}
