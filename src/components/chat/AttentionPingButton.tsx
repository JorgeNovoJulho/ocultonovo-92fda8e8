import { useCallback, useEffect, useRef, useState } from "react";
import { Megaphone, Loader2, TimerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseExternal";
import { subscribeTable } from "@/lib/realtimeBus";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { playAttentionAlert } from "@/lib/attentionPing";

interface AttentionPingButtonProps {
  /** user_id (auth) do destinatário — opcional, será resolvido a partir do profileId se faltar */
  toUserId?: string | null;
  /** profiles.id do destinatário — usado como fallback para resolver o user_id */
  toProfileId?: string | null;
  /** id da conversa atual; se ausente, será criada via get_or_create_conversation */
  conversationId?: string | null;
  className?: string;
  size?: "sm" | "icon";
}

const COOLDOWN_MS = 15_000;       // 15s entre chamadas
const ATTEMPT_WINDOW_MS = 5 * 60_000;  // janela de 5 min
const MAX_ATTEMPTS = 5;           // 5 tentativas
const LOCKOUT_MS = 5 * 60_000;    // bloqueio de 5 min

interface AttemptState {
  attempts: number[];       // timestamps das tentativas dentro da janela
  lockedUntil: number;      // ts até quando está bloqueado (0 = livre)
}

const stateKey = (fromUid: string, toUid: string) =>
  `oculto.attention.state:${fromUid}:${toUid}`;

const loadState = (key: string): AttemptState => {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return { attempts: [], lockedUntil: 0 };
    const parsed = JSON.parse(raw);
    return {
      attempts: Array.isArray(parsed?.attempts) ? parsed.attempts : [],
      lockedUntil: Number(parsed?.lockedUntil) || 0,
    };
  } catch {
    return { attempts: [], lockedUntil: 0 };
  }
};
const saveState = (key: string, st: AttemptState) => {
  try { sessionStorage.setItem(key, JSON.stringify(st)); } catch { /* noop */ }
};

/**
 * Botão "Chamar Atenção".
 *  - Cooldown local: 15s
 *  - Lockout: 5 tentativas em 5 min sem resposta → 5 min de bloqueio
 *  - Cria conversa (se necessário) + insere mensagem destacada (media_type='attention_ping')
 *  - Dispara realtime ping (RPC send_attention_ping) → recipiente ouve som + vibra
 *  - Reseta tentativas ao receber qualquer mensagem do destinatário
 */
export function AttentionPingButton({
  toUserId,
  toProfileId,
  conversationId,
  className,
  size = "icon",
}: AttentionPingButtonProps) {
  const { user } = useAuth();
  const [sending, setSending] = useState(false);
  const [resolvedToUid, setResolvedToUid] = useState<string | null>(toUserId ?? null);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const lastSentAtRef = useRef(0);

  // Resolve uid destinatário (uma vez)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (toUserId) { setResolvedToUid(toUserId); return; }
      if (!toProfileId) return;
      try {
        const { data } = await (supabase as any)
          .from("profiles")
          .select("user_id")
          .eq("id", toProfileId)
          .maybeSingle();
        if (!cancelled) setResolvedToUid(data?.user_id ?? null);
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, [toUserId, toProfileId]);

  const sKey = user?.id && resolvedToUid ? stateKey(user.id, resolvedToUid) : null;

  // Tick para countdowns
  useEffect(() => {
    if (!sKey) return;
    const tick = () => {
      const st = loadState(sKey);
      const now = Date.now();
      // Limpa tentativas fora da janela
      const fresh = st.attempts.filter((t) => now - t < ATTEMPT_WINDOW_MS);
      if (fresh.length !== st.attempts.length) {
        st.attempts = fresh;
        saveState(sKey, st);
      }
      setLockoutRemaining(st.lockedUntil > now ? st.lockedUntil - now : 0);
      const cd = lastSentAtRef.current + COOLDOWN_MS - now;
      setCooldownRemaining(cd > 0 ? cd : 0);
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [sKey]);

  // Reset de tentativas ao receber resposta do destinatário
  useEffect(() => {
    if (!sKey || !resolvedToUid || !conversationId) return;
    const unsub = subscribeTable('messages', (payload: any) => {
      if (payload?.eventType !== 'INSERT') return;
      const msg = payload?.new as any;
      if (!msg || msg.conversation_id !== conversationId) return;
      const senderId = msg?.sender_id;
      if (!senderId) return;
      if (senderId === resolvedToUid || senderId === toProfileId) {
        const st = loadState(sKey);
        if (st.attempts.length || st.lockedUntil) {
          saveState(sKey, { attempts: [], lockedUntil: 0 });
          setLockoutRemaining(0);
        }
      }
    }, { events: ['INSERT'] });
    return () => { unsub(); };
  }, [sKey, resolvedToUid, toProfileId, conversationId]);


  const ensureConversationId = useCallback(async (selfUid: string, peerUid: string): Promise<string | null> => {
    if (conversationId) return conversationId;
    try {
      const { data, error } = await (supabase as any).rpc("get_or_create_conversation", {
        p1: selfUid,
        p2: peerUid,
      });
      if (!error && data) return data as string;
      // Fallback assinatura legada
      const r2 = await (supabase as any).rpc("get_or_create_conversation", {
        user1_id: selfUid,
        user2_id: peerUid,
      });
      return (r2?.data as string) || null;
    } catch {
      return null;
    }
  }, [conversationId]);

  const handleClick = async () => {
    if (!user?.id || !resolvedToUid || !sKey) {
      toast({ title: "Destinatário indisponível", variant: "destructive" });
      return;
    }
    const now = Date.now();
    const st = loadState(sKey);

    if (st.lockedUntil > now) {
      const mins = Math.ceil((st.lockedUntil - now) / 60000);
      toast({
        title: "Chamada de atenção bloqueada",
        description: `Sem resposta após 5 tentativas. Tente novamente em ~${mins} min.`,
        variant: "destructive",
      });
      return;
    }
    if (now - lastSentAtRef.current < COOLDOWN_MS) {
      const secs = Math.ceil((COOLDOWN_MS - (now - lastSentAtRef.current)) / 1000);
      toast({ title: "Aguarde", description: `Próxima chamada em ${secs}s.` });
      return;
    }

    setSending(true);
    try {
      // 1) Garante conversa
      const convId = await ensureConversationId(user.id, resolvedToUid);
      if (!convId) {
        toast({ title: "Não foi possível abrir a conversa", variant: "destructive" });
        return;
      }

      // 2) Resolve @username do remetente para a mensagem
      let myHandle = "Alguém";
      try {
        const { data: me } = await (supabase as any)
          .from("profiles")
          .select("id, username, name")
          .eq("user_id", user.id)
          .maybeSingle();
        if (me?.username) myHandle = `@${me.username}`;
        else if (me?.name) myHandle = me.name;
      } catch { /* noop */ }

      // 3) Insere mensagem destacada no chat
      try {
        // sender_id segue a convenção do projeto (profile.id quando existir)
        let senderId: string = user.id;
        try {
          const { data: meRow } = await (supabase as any)
            .from("profiles").select("id").eq("user_id", user.id).maybeSingle();
          if (meRow?.id) senderId = meRow.id;
        } catch { /* noop */ }

        await (supabase as any).from("messages").insert({
          conversation_id: convId,
          sender_id: senderId,
          content: `${myHandle} está chamando sua atenção`,
          media_type: "attention_ping",
        });
      } catch (e) {
        console.warn("[AttentionPing] message insert falhou:", e);
      }

      // 4) Dispara o ping em tempo real
      const { error } = await (supabase as any).rpc("send_attention_ping", {
        p_to_user_id: resolvedToUid,
        p_conversation_id: convId,
        p_message: null,
      });
      if (error) throw error;

      // 5) Feedback local + atualização de estado
      lastSentAtRef.current = now;
      void playAttentionAlert();

      const fresh = st.attempts.filter((t) => now - t < ATTEMPT_WINDOW_MS);
      fresh.push(now);
      let lockedUntil = st.lockedUntil;
      if (fresh.length >= MAX_ATTEMPTS) {
        lockedUntil = now + LOCKOUT_MS;
      }
      saveState(sKey, { attempts: fresh, lockedUntil });
      setCooldownRemaining(COOLDOWN_MS);
      setLockoutRemaining(lockedUntil > now ? lockedUntil - now : 0);

      toast({
        title: "👋 Atenção enviada",
        description: fresh.length >= MAX_ATTEMPTS
          ? "5ª tentativa sem resposta — chamadas bloqueadas por 5 min."
          : `Tentativa ${fresh.length}/${MAX_ATTEMPTS} nesta janela.`,
        duration: 3500,
      });
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (msg.includes("rate_limited")) {
        toast({ title: "Aguarde 15 segundos", description: "Chamada recente." });
      } else if (msg.includes("lockout_5min")) {
        const lockedUntil = now + LOCKOUT_MS;
        saveState(sKey!, { attempts: loadState(sKey!).attempts, lockedUntil });
        setLockoutRemaining(LOCKOUT_MS);
        toast({
          title: "Bloqueado por 5 min",
          description: "5 tentativas sem resposta. Tente novamente mais tarde.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Não foi possível chamar a atenção",
          description: msg.slice(0, 140),
          variant: "destructive",
        });
      }
    } finally {
      setSending(false);
    }
  };

  const isLocked = lockoutRemaining > 0;
  const isCooling = cooldownRemaining > 0 && !isLocked;
  const disabled = sending || isLocked || isCooling;

  let title = "Chamar a atenção";
  if (isLocked) title = `Bloqueado por ${Math.ceil(lockoutRemaining / 60000)} min`;
  else if (isCooling) title = `Aguarde ${Math.ceil(cooldownRemaining / 1000)}s`;

  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      onClick={handleClick}
      disabled={disabled}
      aria-label={title}
      title={title}
      className={cn(
        "relative shrink-0",
        isLocked
          ? "text-destructive/70 ring-1 ring-destructive/40"
          : "text-[#D4AF37] hover:text-[#FFD700] hover:bg-[#D4AF37]/10 ring-1 ring-[#D4AF37]/40 hover:ring-[#FFD700]/60",
        !isLocked && !isCooling && "animate-pulse-subtle",
        className
      )}
    >
      {sending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isLocked ? (
        <TimerOff className="h-4 w-4" />
      ) : (
        <Megaphone className="h-4 w-4" />
      )}
      {isCooling && (
        <span className="absolute -bottom-1 -right-1 rounded-full bg-background/90 px-1 text-[9px] font-semibold leading-tight text-foreground">
          {Math.ceil(cooldownRemaining / 1000)}
        </span>
      )}
    </Button>
  );
}

export default AttentionPingButton;
