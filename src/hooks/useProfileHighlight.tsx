import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useAuth } from './useAuth';
import { useProfile } from './useProfile';
import { useSettingValue } from './useSystemSettings';
import { toast } from 'sonner';

export interface ProfileHighlight {
  id: string;
  profile_id: string;
  amount_paid: number;
  starts_at: string;
  expires_at: string;
  active: boolean;
  payment_id: string | null;
}

export interface ProfileHighlightBillingInfo {
  payerName: string;
  payerEmail: string;
  cpfCnpj: string;
  phoneNumber: string;
}

export interface ProfileHighlightCardPayload {
  amount: number;
  description: string;
  payerEmail: string;
  payerName: string;
  payerCpfCnpj: string;
  payerPhone?: string;
  card: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };
}

const FN_NOT_FOUND_PATTERNS = [
  'Could not find the function public.activate_profile_highlight',
  'Could not find the function public.deactivate_profile_highlight',
  'PGRST202',
];

function isMissingFunctionError(error: unknown) {
  const message = String((error as any)?.message || error || '');
  return FN_NOT_FOUND_PATTERNS.some((pattern) => message.includes(pattern));
}

async function fallbackActivateHighlight(params: {
  amount: number;
  paymentId?: string | null;
  profileId: string;
  userId: string;
}) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const { error: deactivateError } = await (supabase as any)
    .from('oculto_profile_highlights')
    .update({ active: false })
    .eq('profile_id', params.profileId)
    .eq('active', true);

  if (deactivateError) throw deactivateError;

  const { data, error } = await (supabase as any)
    .from('oculto_profile_highlights')
    .insert({
      profile_id: params.profileId,
      user_id: params.userId,
      amount_paid: params.amount,
      starts_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      active: true,
      payment_id: params.paymentId || null,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data?.id as string;
}

async function fallbackDeactivateHighlight(profileId: string) {
  const { error } = await (supabase as any)
    .from('oculto_profile_highlights')
    .update({ active: false })
    .eq('profile_id', profileId)
    .eq('active', true);

  if (error) throw error;
}

/** Status do destaque dourado do usuário logado. */
export function useMyProfileHighlight() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const queryClient = useQueryClient();

  // Realtime: qualquer mudança em oculto_profile_highlights do meu perfil
  // atualiza imediatamente o card sem precisar recarregar a página.
  useEffect(() => {
    if (!profile?.id) return;
    const unsub = subscribeTable(
      'oculto_profile_highlights',
      (payload: any) => {
        const row = payload.new ?? payload.old;
        if (!row || row.profile_id !== profile.id) return;
        queryClient.invalidateQueries({ queryKey: ['my-profile-highlight', profile.id] });
        queryClient.invalidateQueries({ queryKey: ['vip-creators-carousel-v7'] });
        queryClient.invalidateQueries({ queryKey: ['suggested-users'] });
      },
    );
    return () => {
      try { unsub(); } catch {}
    };
  }, [profile?.id, queryClient]);

  const query = useQuery({
    queryKey: ['my-profile-highlight', profile?.id],
    enabled: !!user?.id && !!profile?.id,
    staleTime: 30_000,
    queryFn: async (): Promise<ProfileHighlight | null> => {
      const { data, error } = await (supabase as any)
        .from('oculto_profile_highlights')
        .select('*')
        .eq('profile_id', profile!.id)
        .eq('active', true)
        .gt('expires_at', new Date().toISOString())
        .order('starts_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.warn('[Highlight] fetch failed:', error.message);
        return null;
      }
      return (data as ProfileHighlight) || null;
    },
  });

  // Auto-expira no cliente quando o tempo zerar (sem reload) + toast (1x por destaque)
  const lastHighlightIdRef = useRef<string | null>(null);
  useEffect(() => {
    const currentId = query.data?.id ?? null;
    const previousId = lastHighlightIdRef.current;

    if (currentId && currentId !== previousId) {
      // Mostra toast de ativação UMA ÚNICA VEZ por destaque (chave persistente
      // entre montagens do hook em componentes diferentes e remounts de rota).
      const seenKey = `highlight-toast-active:${currentId}`;
      let alreadySeen = false;
      try {
        alreadySeen = typeof window !== 'undefined' && window.sessionStorage?.getItem(seenKey) === '1';
      } catch { /* noop */ }

      if (!alreadySeen) {
        toast.success('✨ Destaque dourado ativo!', {
          id: `highlight-active-${currentId}`,
          description: 'Sua moldura já está visível para todos.',
        });
        try { window.sessionStorage?.setItem(seenKey, '1'); } catch { /* noop */ }
      }
    } else if (!currentId && previousId) {
      const expiredKey = `highlight-toast-expired:${previousId}`;
      let alreadySeen = false;
      try {
        alreadySeen = typeof window !== 'undefined' && window.sessionStorage?.getItem(expiredKey) === '1';
      } catch { /* noop */ }
      if (!alreadySeen) {
        toast('⏰ Destaque expirado', {
          id: `highlight-expired-${previousId}`,
          description: 'As 24h de destaque terminaram.',
        });
        try { window.sessionStorage?.setItem(expiredKey, '1'); } catch { /* noop */ }
      }
    }
    lastHighlightIdRef.current = currentId;

    if (!query.data?.expires_at) return;
    const ms = new Date(query.data.expires_at).getTime() - Date.now();
    if (ms <= 0) {
      queryClient.setQueryData(['my-profile-highlight', profile?.id], null);
      queryClient.invalidateQueries({ queryKey: ['suggested-users'] });
      return;
    }
    const id = setTimeout(() => {
      queryClient.setQueryData(['my-profile-highlight', profile?.id], null);
      queryClient.invalidateQueries({ queryKey: ['my-profile-highlight'] });
      queryClient.invalidateQueries({ queryKey: ['suggested-users'] });
    }, ms + 500);
    return () => clearTimeout(id);
  }, [query.data?.id, query.data?.expires_at, profile?.id, queryClient]);

  return query;
}

/** Preço atual do destaque (configurado pelo admin). */
export function useProfileHighlightPrice(): number {
  const value = useSettingValue<number | string>('profile_highlight_price', 9.9);
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : 9.9;
}

export function useProfileHighlightBillingInfo() {
  const { user } = useAuth();
  const { profile } = useProfile();

  return useQuery({
    queryKey: ['profile-highlight-billing', user?.id],
    enabled: !!user?.id,
    staleTime: 30_000,
    queryFn: async (): Promise<ProfileHighlightBillingInfo> => {
      const { data } = await (supabase as any)
        .from('profiles')
        .select('name, email, cpf_cnpj, phone_number')
        .eq('user_id', user!.id)
        .maybeSingle();

      const payerName =
        data?.name ||
        profile?.name ||
        user?.user_metadata?.display_name ||
        user?.user_metadata?.name ||
        'Usuário';

      return {
        payerName,
        payerEmail: data?.email || profile?.email || user?.email || '',
        cpfCnpj: data?.cpf_cnpj || '',
        phoneNumber: data?.phone_number || '',
      };
    },
  });
}

export function useSaveProfileHighlightBillingInfo() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ cpfCnpj, phoneNumber }: { cpfCnpj: string; phoneNumber: string }) => {
      if (!user?.id) throw new Error('Usuário não autenticado');

      const payload = {
        user_id: user.id,
        cpf_cnpj: cpfCnpj,
        phone_number: phoneNumber || null,
        updated_at: new Date().toISOString(),
      };

      const { data: updated, error: updateError } = await (supabase as any)
        .from('profiles')
        .update(payload)
        .eq('user_id', user.id)
        .select('user_id')
        .maybeSingle();

      if (updateError) throw updateError;

      if (!updated) {
        const { error: upsertError } = await (supabase as any)
          .from('profiles')
          .upsert(payload, { onConflict: 'user_id' });

        if (upsertError) throw upsertError;
      }

      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile-highlight-billing'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

/** Ativa o destaque dourado por 24h (após pagamento). */
export function useActivateHighlight() {
  const queryClient = useQueryClient();
  const price = useProfileHighlightPrice();
  const { user } = useAuth();
  const { profile } = useProfile();

  return useMutation({
    mutationFn: async (paymentId?: string) => {
      try {
        const { data, error } = await (supabase as any).rpc('activate_profile_highlight', {
          p_amount: price,
          p_payment_id: paymentId || null,
        });

        if (error) throw error;
        return data as string;
      } catch (error) {
        if (!isMissingFunctionError(error) || !user?.id || !profile?.id) {
          throw error;
        }

        return fallbackActivateHighlight({
          amount: price,
          paymentId: paymentId || null,
          profileId: profile.id,
          userId: user.id,
        });
      }
    },
    onSuccess: () => {
      toast.success('✨ Destaque dourado ativado!', {
        description: 'Seu perfil ficará em destaque pelas próximas 24 horas.',
      });
      queryClient.invalidateQueries({ queryKey: ['my-profile-highlight'] });
      queryClient.invalidateQueries({ queryKey: ['suggested-users'] });
    },
    onError: (err: any) => {
      toast.error('Não foi possível ativar o destaque', {
        description: err?.message || 'Tente novamente.',
      });
    },
  });
}

/** Desativa o destaque manualmente. */
export function useDeactivateHighlight() {
  const queryClient = useQueryClient();
  const { profile } = useProfile();

  return useMutation({
    mutationFn: async () => {
      try {
        const { error } = await (supabase as any).rpc('deactivate_profile_highlight');
        if (error) throw error;
      } catch (error) {
        if (!isMissingFunctionError(error) || !profile?.id) {
          throw error;
        }

        await fallbackDeactivateHighlight(profile.id);
      }
    },
    onSuccess: () => {
      toast.success('Destaque desativado', {
        description: 'Seu perfil voltou ao estado normal.',
      });
      queryClient.invalidateQueries({ queryKey: ['my-profile-highlight'] });
      queryClient.invalidateQueries({ queryKey: ['suggested-users'] });
    },
  });
}

export function useCreateProfileHighlightCardPayment() {
  return useMutation({
    mutationFn: async (payload: ProfileHighlightCardPayload) => {
      const { data, error } = await supabase.functions.invoke('asaas-card-checkout', {
        body: {
          amount: payload.amount,
          description: payload.description,
          payerEmail: payload.payerEmail,
          payerName: payload.payerName,
          payerCpfCnpj: payload.payerCpfCnpj,
          payerPhone: payload.payerPhone,
          card: payload.card,
          transactionType: 'profile_highlight',
          metadata: {
            feature_type: 'profile_highlight',
            duration_hours: 24,
          },
        },
      });

      if (error) throw error;

      if (!data?.success) {
        throw new Error(data?.error || 'Não foi possível processar o pagamento no cartão.');
      }

      return data as {
        success: boolean;
        provider: string;
        payment_id: string;
        status: string;
        invoice_url?: string;
        installments?: number;
      };
    },
  });
}
