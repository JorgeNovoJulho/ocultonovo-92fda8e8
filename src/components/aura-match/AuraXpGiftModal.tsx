import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Gift, Loader2, Search, Zap, ArrowRight, ArrowLeft, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { AURA_QUEST_EVENT } from '@/lib/auraQuests';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { getPublicHandle, getHandleInitial } from '@/lib/userHandle';

interface ProfileLite {
  id: string;
  user_id: string | null;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
}

interface AuraXpGiftModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Lista pré-carregada de destinatários (ex: presentes na sala). Quando passada,
   *  substitui a busca livre por um seletor da lista. */
  presetReceivers?: ProfileLite[];
  /** Destinatário fixo (modo confirmação direta — sem seleção). */
  lockedReceiver?: ProfileLite | null;
  /** Disparado após envio bem-sucedido (para postar mensagem no chat etc). */
  onSent?: (info: { receiver: ProfileLite; amount: number }) => void;
  /** Título customizado opcional. */
  title?: string;
  /** Contexto opcional para descrição (ex: "nesta sala"). */
  contextLabel?: string;
  /** Quando enviado a partir de um post, vincula o presente ao post_id
   *  para alimentar o contador "🎁 Presente · N · XP". */
  postId?: string | null;
}


const MIN_XP = 5;
const MAX_XP = 500;

/** Auto-cálculo: 10% do saldo, dentro do intervalo [5, min(500, saldo)] */
function suggestAmount(balance: number): number {
  if (!balance || balance < MIN_XP) return MIN_XP;
  const cap = Math.min(MAX_XP, balance);
  const tenth = Math.round(balance * 0.1);
  return Math.max(MIN_XP, Math.min(cap, tenth || MIN_XP));
}

export function AuraXpGiftModal({ open, onOpenChange, presetReceivers, lockedReceiver, onSent, title, contextLabel, postId }: AuraXpGiftModalProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<'pick' | 'confirm'>('pick');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ProfileLite | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [amount, setAmount] = useState<number>(MIN_XP);
  const [sending, setSending] = useState(false);
  /** Trava síncrona: impede que cliques rapidíssimos disparem 2 RPCs antes do React aplicar `sending=true`. */
  const sendingRef = useRef(false);
  const [loadingBalance, setLoadingBalance] = useState(false);

  // Carrega saldo de XP do remetente quando abre o modal
  useEffect(() => {
    if (!open || !user?.id) return;
    let alive = true;
    (async () => {
      setLoadingBalance(true);
      try {
        const { data } = await (supabase as any)
          .from('profiles')
          .select('aura_xp')
          .or(`id.eq.${user.id},user_id.eq.${user.id}`)
          .limit(1)
          .maybeSingle();
        const xp = Number(data?.aura_xp ?? 0);
        if (!alive) return;
        setBalance(xp);
        setAmount(suggestAmount(xp));
      } finally {
        if (alive) setLoadingBalance(false);
      }
    })();
    return () => { alive = false; };
  }, [open, user?.id]);

  // Quando há destinatário travado, já o seleciona ao abrir.
  useEffect(() => {
    if (open && lockedReceiver) setSelected(lockedReceiver);
  }, [open, lockedReceiver]);

  const reset = () => {
    setStep('pick');
    setQuery(''); setResults([]);
    setSelected(lockedReceiver ?? null);
    setAmount(suggestAmount(balance));
  };

  const handleSearch = async (q: string) => {
    setQuery(q);
    setSelected(null);
    if (q.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const term = q.trim().replace(/^@/, '');
      const { data } = await (supabase as any)
        .from('profiles')
        .select('id, user_id, username, name, avatar_url')
        .or(`username.ilike.%${term}%,name.ilike.%${term}%`)
        .limit(8);
      setResults((data as ProfileLite[]) || []);
    } finally {
      setSearching(false);
    }
  };

  const maxAllowed = Math.min(MAX_XP, balance);
  const hasEnoughBalance = balance >= MIN_XP;
  const amountValid = amount >= MIN_XP && amount <= maxAllowed && amount <= balance;
  const canContinue = !!selected && hasEnoughBalance && amountValid;
  const canConfirm = canContinue && !sending;
  const presets = useMemo(() => {
    const base = [10, 25, 50, 100, 250];
    return base.filter((v) => v <= maxAllowed);
  }, [maxAllowed]);

  const clamp = (v: number) => Math.max(MIN_XP, Math.min(maxAllowed || MIN_XP, v || 0));

  const handleSend = async () => {
    if (!selected) return;
    // Guarda síncrona contra duplo-clique antes de `sending` virar true.
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    // Otimista: já reduz saldo local
    const before = balance;
    setBalance((b) => Math.max(0, b - amount));
    try {
      // Garante sessão válida antes da RPC (mobile pode estar com token stale).
      try {
        const { data: sess } = await (supabase as any).auth.getSession();
        if (!sess?.session?.access_token) {
          await (supabase as any).auth.refreshSession();
        }
      } catch { /* segue tentativa */ }

      const { data, error } = await (supabase as any).rpc('aura_send_xp_gift', {
        p_receiver_profile_id: selected.id,
        p_amount: amount,
        ...(postId ? { p_post_id: postId } : {}),
      });
      if (error) throw error;

      const r = Array.isArray(data) ? data[0] : data;
      toast.success(`+${amount} XP enviado para @${selected.username ?? selected.name ?? 'usuário'}`, {
        description: `Seu novo saldo: ${r?.sender_xp ?? before - amount} XP`,
      });
      try {
        const { progressAuraQuest } = await import('@/lib/auraQuests');
        await progressAuraQuest('send_gift', 1, { reason: `presente XP enviado a @${selected.username ?? ''}` });
      } catch {}
      try { window.dispatchEvent(new CustomEvent(AURA_QUEST_EVENT, { detail: { key: 'send_gift', amount: 1, reason: 'aura_xp_gift_sent', at: Date.now() } })); } catch {}
      const giftDetail = {
        receiverProfileId: selected.id,
        receiverUserId: (selected as any).user_id ?? null,
        amount,
        at: Date.now(),
      };
      try {
        window.dispatchEvent(new CustomEvent('oculto:aura-gift-sent', { detail: giftDetail }));
      } catch {}
      // Cross-tab sync: BroadcastChannel + localStorage fallback
      try {
        const bc = new BroadcastChannel('oculto-aura-gifts');
        bc.postMessage(giftDetail);
        bc.close();
      } catch {}
      try {
        localStorage.setItem('oculto:aura-gift-sent', JSON.stringify(giftDetail));
      } catch {}
      try { onSent?.({ receiver: selected, amount }); } catch {}
      reset();
      onOpenChange(false);
    } catch (e: any) {
      // rollback otimista
      setBalance(before);
      const msg = String(e?.message || '');
      if (msg.includes('insufficient')) toast.error('XP insuficiente para enviar este presente.');
      else if (msg.includes('yourself')) toast.error('Você não pode enviar XP para si mesmo.');
      else if (msg.toLowerCase().includes('auth required') || msg.toLowerCase().includes('jwt')) {
        toast.error('Sessão expirada', { description: 'Recarregue a página e faça login novamente para enviar o presente.' });
      }
      else if (msg.includes('schema cache') || msg.includes('aura_send_xp_gift')) {
        toast.error('Função do banco não publicada', { description: 'Rode o SQL externo em supabase/external_sql/2026_05_17_aura_xp_gift_and_quests_realtime.sql e tente novamente.' });
      } else toast.error('Não foi possível enviar o presente', { description: msg });
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  };

  const balanceAfter = Math.max(0, balance - amount);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        // Bloqueia fechar enquanto envia — evita reabrir e re-enviar.
        if (!v && sending) return;
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-amber-400" />
            {step === 'pick' ? (title ?? 'Enviar presente de XP') : 'Revise antes de enviar'}
          </DialogTitle>
          <DialogDescription>
            {step === 'pick'
              ? <>Você transfere XP da <strong>sua Aura</strong> para outro usuário{contextLabel ? <> {contextLabel}</> : null}. O valor é debitado do <strong>seu saldo</strong>. Mín. {MIN_XP} XP, máx. {MAX_XP} XP (ou até seu saldo).</>
              : <>Confira destinatário, quantidade e impacto no seu saldo. Toque em <strong>Enviar</strong> para confirmar.</>}
          </DialogDescription>
        </DialogHeader>

        {/* Cartão de saldo */}
        <div className="rounded-md border border-amber-400/30 bg-amber-400/5 px-3 py-2 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Seu saldo Aura</span>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-300">
            <Zap className="h-3.5 w-3.5" />
            {loadingBalance ? '...' : `${balance} XP`}
          </span>
        </div>

        {step === 'pick' && (
          <div className="space-y-3">
            {/* Lista pré-carregada (ex: usuários presentes na sala) */}
            {presetReceivers && presetReceivers.length > 0 && !lockedReceiver ? (
              <div>
                <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                  Escolha quem receberá ({presetReceivers.length})
                </p>
                <ul className="max-h-56 overflow-auto rounded-md border border-border/60 divide-y divide-border/40">
                  {presetReceivers.map((p) => {
                    const isSel = selected?.id === p.id;
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(p)}
                          className={cn(
                            'w-full flex items-center gap-2 p-2 text-left transition-colors',
                            isSel ? 'bg-amber-500/15' : 'hover:bg-accent/50'
                          )}
                        >
                          <Avatar className="h-7 w-7">
                            <AvatarImage src={p.avatar_url ?? undefined} />
                            <AvatarFallback>{getHandleInitial(p)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm truncate">{getPublicHandle(p)}</p>
                          </div>
                          {isSel && <span className="text-[10px] font-semibold text-amber-300">Selecionado</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : !lockedReceiver ? (
              <>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    autoFocus
                    placeholder="Buscar por @usuário ou nome..."
                    value={query}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>

                {searching && (
                  <div className="flex items-center justify-center py-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin mr-1" /> Buscando...
                  </div>
                )}

                {!selected && results.length > 0 && (
                  <ul className="max-h-44 overflow-auto rounded-md border border-border/60 divide-y divide-border/40">
                    {results.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(p)}
                          className="w-full flex items-center gap-2 p-2 hover:bg-accent/50 text-left"
                        >
                          <Avatar className="h-7 w-7">
                            <AvatarImage src={p.avatar_url ?? undefined} />
                            <AvatarFallback>{getHandleInitial(p)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm truncate">{getPublicHandle(p)}</p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : null}

            {selected && (
              <div className="rounded-md border border-amber-400/40 bg-amber-400/5 p-2 flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={selected.avatar_url ?? undefined} />
                  <AvatarFallback>{getHandleInitial(selected)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{getPublicHandle(selected)}</p>
                </div>
                {!lockedReceiver && (
                  <button type="button" onClick={() => setSelected(null)} className="text-[11px] text-muted-foreground hover:text-foreground">Trocar</button>
                )}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs text-muted-foreground">Quantidade de XP</p>
                <p className="text-[10px] text-muted-foreground">
                  Sugerido: <span className="text-amber-300 font-semibold">{suggestAmount(balance)} XP</span> · Máx: {maxAllowed} XP
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {presets.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAmount(v)}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs border transition-colors',
                      amount === v ? 'border-amber-400 bg-amber-400/10 text-amber-300' : 'border-border/60 text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Zap className="h-3 w-3 inline mr-0.5" />{v}
                  </button>
                ))}
                {maxAllowed > MIN_XP && (
                  <button
                    type="button"
                    onClick={() => setAmount(maxAllowed)}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs border transition-colors',
                      amount === maxAllowed ? 'border-amber-400 bg-amber-400/10 text-amber-300' : 'border-border/60 text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Máx
                  </button>
                )}
              </div>
              <Input
                type="number"
                min={MIN_XP}
                max={maxAllowed || MIN_XP}
                value={amount}
                onChange={(e) => setAmount(clamp(Number(e.target.value)))}
              />
              {balance < MIN_XP && (
                <p className="mt-1 text-[11px] text-rose-400">Saldo insuficiente — ganhe XP completando outras missões antes de enviar um presente.</p>
              )}
            </div>
          </div>
        )}

        {step === 'confirm' && selected && (
          <div className="space-y-3">
            <div className="rounded-md border border-border/60 bg-background/40 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={selected.avatar_url ?? undefined} />
                  <AvatarFallback>{getHandleInitial(selected)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Destinatário</p>
                  <p className="text-sm font-medium truncate">{getPublicHandle(selected)}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                <div className="rounded-md bg-background/60 p-2">
                  <p className="text-[10px] text-muted-foreground uppercase">Antes</p>
                  <p className="text-sm font-semibold text-foreground tabular-nums">{balance} XP</p>
                </div>
                <div className="rounded-md bg-amber-400/10 p-2 border border-amber-400/30">
                  <p className="text-[10px] text-amber-300 uppercase">Enviando</p>
                  <p className="text-sm font-semibold text-amber-300 tabular-nums">-{amount} XP</p>
                </div>
                <div className="rounded-md bg-background/60 p-2">
                  <p className="text-[10px] text-muted-foreground uppercase">Depois</p>
                  <p className="text-sm font-semibold text-foreground tabular-nums">{balanceAfter} XP</p>
                </div>
              </div>
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-1">
                <ShieldCheck className="h-3 w-3 text-emerald-400" />
                Transferência única e irreversível. Conclui a missão "Envie um presente".
              </p>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          {step === 'pick' ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>Cancelar</Button>
              <Button
                onClick={() => setStep('confirm')}
                disabled={!canContinue}
                className="bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:opacity-95"
              >
                Continuar
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setStep('pick')} disabled={sending}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <Button
                onClick={handleSend}
                disabled={!canConfirm}
                className="bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:opacity-95"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Gift className="h-4 w-4 mr-1" />}
                Enviar {amount} XP
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
