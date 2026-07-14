/**
 * usePaymentConfirmationListener — Realtime listener global para confirmações de pagamento.
 * 
 * 1. Escuta mudanças em `transactions` via Supabase Realtime (status → completed)
 * 2. Atualiza cache do perfil instantaneamente (sem refresh)
 * 3. Detecta pagamentos confirmados enquanto o app estava fechado (fallback toast)
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from './useAuth';
import { useProfile } from './useProfile';
import { toast } from '@/hooks/use-toast';

export interface ConfirmedPayment {
  type: 'subscription' | 'ppv' | 'other';
  planType?: string;
  amount: number;
  description?: string;
  creatorName?: string;
  contentTitle?: string;
  expiresAt?: string;
  transactionId: string;
}

const LAST_CONFIRMED_KEY = 'oculto_last_confirmed_tx';

export function usePaymentConfirmationListener() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const [confirmedPayment, setConfirmedPayment] = useState<ConfirmedPayment | null>(null);
  const processedRef = useRef<Set<string>>(new Set());

  // Handle a confirmed transaction
  const handleConfirmed = useCallback(async (tx: any) => {
    const txId = tx.id;
    if (processedRef.current.has(txId)) return;
    processedRef.current.add(txId);

    // Invalidate all relevant caches instantly
    queryClient.invalidateQueries({ queryKey: ['profile'] });
    queryClient.invalidateQueries({ queryKey: ['my-subscriptions'] });
    queryClient.invalidateQueries({ queryKey: ['payment-status'] });

    const isSubscription = tx.type === 'subscription';
    const isPPV = tx.type === 'ppv' || tx.type === 'content_purchase';

    const payment: ConfirmedPayment = {
      type: isSubscription ? 'subscription' : isPPV ? 'ppv' : 'other',
      amount: tx.amount || 0,
      description: tx.description || '',
      transactionId: txId,
    };

    if (isSubscription) {
      // Extract plan info from description
      const desc = (tx.description || '').toLowerCase();
      payment.planType = desc.includes('anual') ? 'annual' : 'monthly';
      
      // Fetch updated profile (plan_expires_at não existe no banco externo)
      const { data: updatedProfile } = await supabase
        .from('profiles')
        .select('plan_type')
        .eq('id', tx.user_id)
        .maybeSingle();

      if (updatedProfile) {
        payment.expiresAt = undefined;
      }
    }

    if (isPPV && tx.metadata) {
      const meta = typeof tx.metadata === 'string' ? JSON.parse(tx.metadata) : tx.metadata;
      payment.creatorName = meta.creator_name;
      payment.contentTitle = meta.content_title;
    }

    // Store last confirmed to detect on reopen
    localStorage.setItem(LAST_CONFIRMED_KEY, JSON.stringify({
      txId,
      timestamp: Date.now(),
    }));

    setConfirmedPayment(payment);
  }, [queryClient]);

  // Realtime listener for transaction completions
  useEffect(() => {
    if (!profile?.id) return;

    const unsub = subscribeTable(
      'transactions',
      (payload: any) => {
        const newTx = payload.new;
        const oldTx = payload.old;
        if (!newTx || newTx.user_id !== profile.id) return;
        if (newTx.status === 'completed' && oldTx?.status !== 'completed') {
          handleConfirmed(newTx);
        }
      },
      { events: ['UPDATE'] },
    );

    return () => {
      unsub();
    };
  }, [profile?.id, handleConfirmed]);

  // Fallback: check for missed confirmations on app reopen
  useEffect(() => {
    if (!profile?.id) return;

    const checkMissedPayments = async () => {
      const stored = localStorage.getItem(LAST_CONFIRMED_KEY);
      if (!stored) return;

      try {
        const { txId, timestamp } = JSON.parse(stored);
        // Only show if within last 24 hours and not already processed
        if (Date.now() - timestamp > 24 * 60 * 60 * 1000) {
          localStorage.removeItem(LAST_CONFIRMED_KEY);
          return;
        }
        if (processedRef.current.has(txId)) return;

        // Check if there are recent completed transactions we missed
        const { data: recentTx } = await (supabase as any)
          .from('transactions')
          .select('*')
          .eq('user_id', profile.id)
          .eq('status', 'completed')
          .gte('updated_at', new Date(timestamp - 60000).toISOString())
          .order('updated_at', { ascending: false })
          .limit(1);

        if (recentTx?.length > 0) {
          const tx = recentTx[0];
          if (!processedRef.current.has(tx.id)) {
            // Show fallback toast instead of full modal
            processedRef.current.add(tx.id);
            queryClient.invalidateQueries({ queryKey: ['profile'] });
            queryClient.invalidateQueries({ queryKey: ['my-subscriptions'] });

            toast({
              title: '✅ Compra Disponível',
              description: tx.type === 'subscription'
                ? 'Sua assinatura já está ativa! Aproveite todos os recursos.'
                : 'Seu conteúdo já está disponível para visualização.',
            });

            localStorage.removeItem(LAST_CONFIRMED_KEY);
          }
        }
      } catch {
        // Silent fail
      }
    };

    // Check on mount with slight delay
    const timer = setTimeout(checkMissedPayments, 2000);
    
    // Also check on visibility change (app reopen)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkMissedPayments();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [profile?.id, queryClient]);

  const dismissConfirmation = useCallback(() => {
    setConfirmedPayment(null);
    localStorage.removeItem(LAST_CONFIRMED_KEY);
  }, []);

  return { confirmedPayment, dismissConfirmation };
}
