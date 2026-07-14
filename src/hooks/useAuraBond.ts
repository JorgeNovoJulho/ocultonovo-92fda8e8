import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from 'sonner';

export interface BondInfo {
  id: string;
  partner_user_id: string;
  partner_name: string | null;
  partner_avatar: string | null;
  expires_at: string;
}

export function useAuraBond() {
  const [bond, setBond] = useState<BondInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any).rpc('aura_bond_my_active');
    setBond(Array.isArray(data) && data[0] ? data[0] : null);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!bond?.expires_at) { setRemainingMs(0); return; }
    const target = new Date(bond.expires_at).getTime();
    const tick = () => {
      const diff = Math.max(0, target - Date.now());
      setRemainingMs(diff);
      if (diff <= 0) refresh();
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [bond?.expires_at, refresh]);

  const create = useCallback(async (other: string) => {
    setBusy(true);
    const { data, error } = await (supabase as any).rpc('aura_bond_create', { p_other: other });
    setBusy(false);
    const res = Array.isArray(data) ? data[0] : data;
    if (error || !res?.ok) {
      // Surface o motivo real para diagnóstico em vez do genérico "Erro".
      const msg =
        res?.message ||
        error?.message ||
        (error?.code === 'PGRST202'
          ? 'Função aura_bond_create indisponível no servidor.'
          : 'Não foi possível compartilhar Aura agora.');
      // Log em console para depuração silenciosa.
      // eslint-disable-next-line no-console
      console.warn('[aura_bond_create] falhou:', { error, res });
      toast.error(msg);
      return false;
    }
    toast.success('Aura compartilhada por 1h! +20% XP ✨');
    refresh();
    return true;
  }, [refresh]);

  return { bond, loading, busy, remainingMs, create, refresh };
}
