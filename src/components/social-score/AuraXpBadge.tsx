import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { useSocialScore } from '@/hooks/useSocialScore';
import { cn } from '@/lib/utils';

function formatXp(xp: number) {
  if (xp >= 1_000_000) return `${(xp / 1_000_000).toFixed(1)}M`;
  if (xp >= 1_000) return `${(xp / 1_000).toFixed(xp >= 10_000 ? 0 : 1)}k`;
  return String(xp);
}

/**
 * AuraXpBadge — mostra o XP real (profiles.aura_xp) do usuário visitado,
 * atualizado em tempo real via postgres_changes + ledger.
 *
 * `userId` pode ser profiles.id OU auth.users.id — tentamos ambos.
 */
export function AuraXpBadge({ userId, className }: { userId?: string | null; className?: string }) {
  const { data: score } = useSocialScore(userId);
  const qc = useQueryClient();

  const { data: profileXp } = useQuery({
    queryKey: ['aura-xp-profile', userId],
    enabled: !!userId,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!userId) return null;
      // Tenta por id, depois por user_id
      const { data: byId } = await (supabase as any)
        .from('profiles')
        .select('id, user_id, aura_xp')
        .eq('id', userId)
        .maybeSingle();
      if (byId) return byId as { id: string; user_id: string; aura_xp: number | null };
      const { data: byUser } = await (supabase as any)
        .from('profiles')
        .select('id, user_id, aura_xp')
        .eq('user_id', userId)
        .maybeSingle();
      return (byUser ?? null) as { id: string; user_id: string; aura_xp: number | null } | null;
    },
  });

  // Realtime: ouve UPDATE em profiles e INSERT no ledger de XP que envolva esse perfil
  useEffect(() => {
    if (!profileXp?.id) return;
    const profileId = profileXp.id;
    const invalidate = () => { qc.invalidateQueries({ queryKey: ['aura-xp-profile', userId] }).catch(() => {}); };
    const unsubProfiles = subscribeTable('profiles', (payload: any) => {
      if (payload?.new?.id !== profileId) return;
      invalidate();
    }, { events: ['UPDATE'] });
    const unsubLedger = subscribeTable('oculto_aura_xp_interaction_ledger', (payload: any) => {
      if (payload?.new?.receiver_id !== profileId) return;
      invalidate();
    }, { events: ['INSERT'] });
    return () => { unsubProfiles(); unsubLedger(); };
  }, [profileXp?.id, userId, qc]);

  // Polling leve como fallback (15s) caso o realtime caia
  const [, force] = useState(0);
  useEffect(() => {
    if (!userId) return;
    const t = window.setInterval(() => {
      qc.invalidateQueries({ queryKey: ['aura-xp-profile', userId] }).catch(() => {});
      force((n) => n + 1);
    }, 15_000);
    return () => window.clearInterval(t);
  }, [userId, qc]);

  if (!userId) return null;

  const xp = Number(profileXp?.aura_xp ?? score?.xp ?? 0);
  const glow = score?.glow_color ? `hsl(${score.glow_color})` : 'hsl(270 30% 55%)';
  const borderColor = score?.glow_color ? `hsl(${score.glow_color} / 0.5)` : 'hsl(270 30% 55% / 0.5)';
  const bg = score?.glow_color ? `hsl(${score.glow_color} / 0.1)` : 'hsl(270 30% 55% / 0.1)';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border',
        className,
      )}
      style={{ color: glow, borderColor, background: bg }}
      title={`XP total: ${xp.toLocaleString('pt-BR')}`}
    >
      <Zap className="h-3 w-3" />
      {formatXp(xp)} XP
    </span>
  );
}
