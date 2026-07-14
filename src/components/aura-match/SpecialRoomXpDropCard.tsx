/**
 * SpecialRoomXpDropCard — card de presente XP em salas especiais.
 * - Escuta `oculto_special_room_xp_rounds` da sessão atual via realtime.
 * - Mostra round aberto com botão "Pegar"; trata cooldown / lotado / claimed.
 */
import { memo, useCallback, useEffect, useState } from 'react';
import { Gift, Loader2, Check, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { subscribeTable } from '@/lib/realtimeBus';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Round {
  id: string;
  xp_amount: number;
  round_no: number;
  max_winners: number;
  created_at: string;
  closed_at: string | null;
}

interface Props {
  sessionId: string;
  meUserId: string | null;
}

function SpecialRoomXpDropCardComp({ sessionId, meUserId }: Props) {
  const [round, setRound] = useState<Round | null>(null);
  const [claims, setClaims] = useState<number>(0);
  const [claimedByMe, setClaimedByMe] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(false);

  const fetchOpenRound = useCallback(async () => {
    const { data } = await (supabase as any)
      .from('oculto_special_room_xp_rounds')
      .select('id, xp_amount, round_no, max_winners, created_at, closed_at')
      .eq('session_id', sessionId)
      .is('closed_at', null)
      .order('round_no', { ascending: false })
      .limit(1)
      .maybeSingle();
    setRound((data as Round) ?? null);
  }, [sessionId]);

  const fetchClaimsFor = useCallback(async (roundId: string) => {
    const { data } = await (supabase as any)
      .from('oculto_special_room_xp_claims')
      .select('user_id')
      .eq('round_id', roundId);
    const list = (data as any[]) ?? [];
    setClaims(list.length);
    setClaimedByMe(!!meUserId && list.some(c => c.user_id === meUserId));
  }, [meUserId]);

  useEffect(() => {
    void fetchOpenRound();
    const unsub = subscribeTable('oculto_special_room_xp_rounds', (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (row?.session_id !== sessionId) return;
      void fetchOpenRound();
    });
    return () => { unsub(); };
  }, [sessionId, fetchOpenRound]);


  useEffect(() => {
    if (!round) { setClaims(0); setClaimedByMe(false); return; }
    void fetchClaimsFor(round.id);
    const unsub = subscribeTable('oculto_special_room_xp_claims', (payload: any) => {
      const row = payload?.new ?? payload?.old;
      if (row?.round_id !== round.id) return;
      void fetchClaimsFor(round.id);
    });
    return () => { unsub(); };

  }, [round, fetchClaimsFor]);

  const onClaim = async () => {
    if (!round || submitting) return;
    setSubmitting(true);
    try {
      const { data, error } = await (supabase as any).rpc('special_room_xp_claim', { p_round_id: round.id });
      if (error) { toast.error('Não foi possível pegar o presente.'); return; }
      const r = data as any;
      if (r?.ok) {
        toast.success(`+${r.xp} XP! Você foi o(a) ${r.position}º a pegar.`, { duration: 4000 });
        setClaimedByMe(true);
        setCooldown(false);
      } else if (r?.reason === 'cooldown') {
        setCooldown(true);
        toast.info('Aguarde os próximos rounds — você já pegou um presente recente.');
      } else if (r?.reason === 'full') {
        toast.info('Round lotado — fique pronto para o próximo!');
      } else if (r?.reason === 'already_claimed') {
        setClaimedByMe(true);
      } else if (r?.reason === 'session_closed' || r?.reason === 'round_closed') {
        await fetchOpenRound();
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!round) {
    return (
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2 text-[11px] text-amber-200/80">
        🎁 Sem presentes agora. Fique atento — novos sorteios aparecem aqui durante o ciclo especial.
      </div>
    );
  }

  const remaining = Math.max(0, (round.max_winners ?? 5) - claims);
  const isFull = remaining === 0;
  const disabled = submitting || claimedByMe || isFull || cooldown;

  return (
    <div className="rounded-lg border border-amber-400/40 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/10 px-3 py-2.5 flex items-center gap-3">
      <Gift className="h-5 w-5 text-amber-300 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-[0.18em] text-amber-200/80">Presente XP</div>
        <div className="text-sm font-semibold text-white truncate">
          {round.xp_amount} XP · {remaining} {remaining === 1 ? 'vaga' : 'vagas'} de {round.max_winners}
        </div>
      </div>
      <button
        type="button"
        onClick={onClaim}
        disabled={disabled}
        className={cn(
          'shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold transition-all',
          claimedByMe
            ? 'bg-emerald-500 text-emerald-950 ring-2 ring-emerald-300/60'
            : cooldown
              ? 'bg-white/10 text-white/50 cursor-not-allowed'
              : isFull
                ? 'bg-white/10 text-white/40 cursor-not-allowed'
                : 'bg-amber-400 text-amber-950 hover:bg-amber-300',
        )}
      >
        {submitting ? <Loader2 className="h-3 w-3 animate-spin" />
          : claimedByMe ? <><Check className="h-3 w-3" /> Pego</>
          : cooldown ? <><Lock className="h-3 w-3" /> Aguarde</>
          : isFull ? 'Lotado' : 'Pegar'}
      </button>
    </div>
  );
}

export const SpecialRoomXpDropCard = memo(SpecialRoomXpDropCardComp);
