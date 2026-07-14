import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from './useAuth';
import { toast } from '@/hooks/use-toast';
import { useActionThrottle } from './useActionThrottle';

export interface PixCheckoutState {
  status: 'idle' | 'generating' | 'waiting' | 'confirmed' | 'expired' | 'error';
  qrCode: string | null;
  qrCodeBase64: string | null;
  transactionId: string | null;
  expiresAt: Date | null;
  error: string | null;
  provider: string | null;
}

export interface UsePixCheckoutParams {
  amount: number;
  description?: string;
  planType?: 'monthly' | 'annual';
  couponId?: string;
  onSuccess?: (transactionId: string) => void;
  onExpired?: () => void;
}

async function getProfileId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', userId)
    .single();
  
  if (error) return null;
  return data?.id || null;
}

export function usePixCheckout(params: UsePixCheckoutParams) {
  const { user } = useAuth();
  const throttle = useActionThrottle({ cooldownMs: 1500, maxBurst: 4, burstWindowMs: 30_000, openMs: 30_000 });
  const [state, setState] = useState<PixCheckoutState>({
    status: 'idle',
    qrCode: null,
    qrCodeBase64: null,
    transactionId: null,
    expiresAt: null,
    error: null,
    provider: null,
  });

  // Realtime subscription for transaction status
  useEffect(() => {
    if (!state.transactionId || state.status !== 'waiting') return;

    const unsub = subscribeTable(
      'transactions',
      (payload: any) => {
        const newRow = payload.new;
        if (!newRow || newRow.id !== state.transactionId) return;
        const newStatus = newRow.status;

        if (newStatus === 'completed') {
          setState(prev => ({ ...prev, status: 'confirmed' }));
          params.onSuccess?.(state.transactionId!);
          toast({
            title: '🎉 Pagamento Confirmado!',
            description: 'Sua assinatura foi ativada com sucesso.',
          });
        } else if (newStatus === 'failed') {
          setState(prev => ({ ...prev, status: 'error', error: 'Pagamento falhou' }));
        }
      },
      { events: ['UPDATE'] },
    );

    return () => {
      unsub();
    };
  }, [state.transactionId, state.status, params.onSuccess]);

  // Expiration timer
  useEffect(() => {
    if (!state.expiresAt || state.status !== 'waiting') return;

    const checkExpiration = () => {
      if (new Date() >= state.expiresAt!) {
        setState(prev => ({ ...prev, status: 'expired' }));
        params.onExpired?.();
        toast({
          title: 'PIX Expirado',
          description: 'O código PIX expirou. Gere um novo para continuar.',
          variant: 'destructive',
        });
      }
    };

    const interval = setInterval(checkExpiration, 1000);
    return () => clearInterval(interval);
  }, [state.expiresAt, state.status, params.onExpired]);

  const generatePix = useCallback(async () => {
    if (!user?.id) {
      setState(prev => ({ ...prev, status: 'error', error: 'Usuário não autenticado' }));
      return;
    }

    // Circuit breaker UX: evita duplo-clique e rajada de checkouts
    const gate = await throttle.run(async () => true);
    if (gate.ok === false) {
      const msg = gate.reason === 'open'
        ? 'Muitas tentativas. Aguarde alguns segundos.'
        : 'Aguarde antes de tentar novamente.';
      setState(prev => ({ ...prev, status: 'error', error: msg }));
      return;
    }

    setState(prev => ({ ...prev, status: 'generating', error: null }));

    try {
      // 0. Validação anti-fraude (auto-referral via IP/device)
      try {
        const { data: fraud } = await supabase.rpc('validate_checkout_fraud', { p_user_id: user.id });
        const f = fraud as { blocked?: boolean; message?: string } | null;
        if (f?.blocked) {
          setState({
            status: 'error', qrCode: null, qrCodeBase64: null,
            transactionId: null, expiresAt: null, provider: null,
            error: f.message || 'Cobrança bloqueada por suspeita de fraude. Contate o suporte.',
          });
          return;
        }
      } catch { /* falha silenciosa: não bloqueia se RPC indisponível */ }

      // 1. Get profile ID
      const profileId = await getProfileId(user.id);
      if (!profileId) {
        throw new Error('Perfil não encontrado');
      }

      // 2. Create pending transaction — type MUST be 'subscription' for webhook to activate plan
      const isSubscription = params.planType === 'monthly' || params.planType === 'annual' || 
                             (params.description || '').toLowerCase().includes('assinatura');
      const { data: transaction, error: txError } = await (supabase as any)
        .from('transactions')
        .insert({
          user_id: profileId,
          amount: params.amount,
          type: isSubscription ? 'subscription' : 'deposit',
          status: 'pending',
          description: params.description || `Assinatura ${params.planType === 'annual' ? 'Anual VIP' : 'Mensal Premium'} OCULTO`,
        })
        .select()
        .single();

      if (txError) throw txError;

      // 3. Generate PIX via Edge Function
      const { data: pixResult, error: pixError } = await supabase.functions.invoke('pix-gateway', {
        body: {
          action: 'generate',
          amount: params.amount,
          description: params.description || `Assinatura OCULTO ${params.planType || 'VIP'}`,
          transaction_id: transaction.id,
          payer_email: user.email,
          payer_user_id: user.id,
        },
      });

      if (pixError) throw pixError;

      if (!pixResult.success) {
        throw new Error(pixResult.error || 'Falha ao gerar PIX');
      }

      // 4. CRITICAL: Update transaction with Asaas payment ID (external_id)
      // This is what the webhook uses to find and activate the plan
      if (pixResult.transaction_id) {
        await (supabase as any)
          .from('transactions')
          .update({ 
            external_id: pixResult.transaction_id,
            provider: pixResult.provider || 'asaas',
          })
          .eq('id', transaction.id);
      }

      // 5. Update state with QR code
      const expiresAt = pixResult.expires_at 
        ? new Date(pixResult.expires_at) 
        : new Date(Date.now() + 30 * 60 * 1000); // 30 min default

      // Telemetria anti-fraude (não bloqueia)
      import('@/lib/activityLogger').then(({ logActivity }) => {
        logActivity('payment_init', {
          amount: params.amount,
          plan: params.planType,
          method: 'pix',
          transaction_id: transaction.id,
        });
      }).catch(() => undefined);

      setState({
        status: 'waiting',
        qrCode: pixResult.qr_code || null,
        qrCodeBase64: pixResult.qr_code_base64 || null,
        transactionId: transaction.id,
        expiresAt,
        error: null,
        provider: pixResult.provider || null,
      });

    } catch (error: any) {
      console.error('Error generating PIX:', error);
      setState(prev => ({
        ...prev,
        status: 'error',
        error: error.message || 'Erro ao gerar PIX',
      }));
      toast({
        title: 'Erro ao gerar PIX',
        description: error.message || 'Tente novamente em alguns instantes.',
        variant: 'destructive',
      });
    }
  }, [user, params.amount, params.description, params.planType]);

  const regeneratePix = useCallback(async () => {
    setState({
      status: 'idle',
      qrCode: null,
      qrCodeBase64: null,
      transactionId: null,
      expiresAt: null,
      error: null,
      provider: null,
    });
    await generatePix();
  }, [generatePix]);

  const cancelPayment = useCallback(() => {
    setState({
      status: 'idle',
      qrCode: null,
      qrCodeBase64: null,
      transactionId: null,
      expiresAt: null,
      error: null,
      provider: null,
    });
  }, []);

  const copyPixCode = useCallback(async () => {
    if (!state.qrCode) return;
    
    try {
      await navigator.clipboard.writeText(state.qrCode);
      toast({
        title: 'Código copiado!',
        description: 'Cole no app do seu banco para pagar.',
      });
    } catch {
      toast({
        title: 'Erro ao copiar',
        description: 'Selecione e copie o código manualmente.',
        variant: 'destructive',
      });
    }
  }, [state.qrCode]);

  return {
    state,
    generatePix,
    regeneratePix,
    cancelPayment,
    copyPixCode,
  };
}
