import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import { AURA_QUEST_EVENT, type AuraQuestProgressedDetail } from '@/lib/auraQuests';

export interface AuraQuestLastReason {
  reason: string;
  at: number;
}

export interface AuraQuest {
  quest_key: string;
  progress: number;
  target: number;
  xp_reward: number;
  claimed: boolean;
}

export interface QuestLabel { title: string; desc: string; steps: string[]; how?: string }

const QUEST_LABELS: Record<string, QuestLabel> = {
  visit_aura: {
    title: 'Visite o Aura Match', desc: 'Apenas abrir o Aura já conta.',
    steps: [
      'Toque em "Ir agora" abaixo (vai abrir /aura-match).',
      'Aguarde 1–2 segundos com a página aberta.',
      'A missão fecha sozinha e libera o botão "Resgatar".',
    ],
  },
  tap_3_auras: {
    title: 'Toque em 3 auras', desc: 'Abra o painel de 3 perfis diferentes.',
    steps: [
      'Vá ao campo central de bolhas no Aura Match.',
      'Toque em 3 bolhas diferentes (cada toque abre o painel do perfil).',
      'O contador 0/3 sobe a cada toque novo.',
    ],
  },
  send_super_dm: {
    title: 'Envie um Super DM', desc: 'Conecte-se de verdade.',
    steps: [
      'Toque em uma bolha para abrir o painel da aura.',
      'No painel, toque em "Super DM".',
      'Escreva e envie a mensagem — a missão é marcada automaticamente.',
    ],
  },
  resonance_3: {
    title: 'Sinta 3 ressonâncias', desc: 'Encontre auras com afinidade alta (≥70%).',
    steps: [
      'Fique no Aura Match (mantém o radar ativo).',
      'Bolhas com anel verde-esmeralda são ressonâncias (≥70%).',
      'Toque nelas conforme aparecerem — 3 contam a missão.',
    ],
  },
  visit_room: {
    title: 'Entre em uma Sala', desc: 'Visite uma Sala de Energia.',
    steps: [
      'Role até a faixa "Salas de Energia" no Aura Match.',
      'Escolha uma sala disponível e toque em "Entrar".',
      'A missão completa assim que você entrar.',
    ],
  },
  send_echo: {
    title: 'Envie um Eco', desc: 'Mande um eco para outra aura em ressonância.',
    steps: [
      'Espere uma bolha com anel verde (ressonância) aparecer.',
      'Toque na bolha — o Eco é enviado automaticamente.',
      'A missão sobe para 1/1.',
    ],
  },
  view_5_profiles: {
    title: 'Veja 5 perfis', desc: 'Explore 5 perfis no Aura.',
    steps: [
      'Toque em 5 bolhas diferentes no campo de auras.',
      'Cada painel aberto soma 1 no contador.',
    ],
  },
  tap_rare_aura: {
    title: 'Toque em uma Aura Rara', desc: 'Encontre uma aura brilhante e rara.',
    steps: [
      'Procure a bolha com badge "RARA" do dia (brilho dourado).',
      'Toque nela — a missão é marcada na hora.',
    ],
  },
  send_3_dms: {
    title: 'Envie 3 mensagens', desc: 'Inicie 3 conversas hoje.',
    steps: [
      'Abra a página /messages.',
      'Envie pelo menos 3 mensagens (em 1 ou mais conversas).',
      'O contador 0/3 sobe a cada envio.',
    ],
  },
  join_storm: {
    title: 'Participe de uma Tempestade', desc: 'Entre durante uma Tempestade Social.',
    steps: [
      'Aguarde o banner de "Tempestade Social" aparecer.',
      'Toque em "Ir agora" enquanto a tempestade está ativa.',
      'Ficar no Aura Match durante a janela já conta.',
    ],
  },
  randomize_aura: {
    title: 'Randomize sua Aura', desc: 'Use o Randomize uma vez hoje.',
    steps: [
      'Toque em "Ir agora" para abrir o Aura Match.',
      'O botão Randomize (ícone de embaralhar) vai pulsar destacado em amarelo no topo.',
      'Toque nele uma vez — a missão completa (limite 10/dia).',
    ],
  },
  send_gift: {
    title: 'Envie um presente de XP', desc: 'Transfira XP da sua Aura para outro usuário.',
    steps: [
      'Toque em "Ir agora" para abrir o envio de presente.',
      'Busque o destinatário por @usuário ou nome e selecione.',
      'Ajuste o XP (mín. 5, máx. 500 ou até seu saldo) e toque em "Continuar".',
      'Revise o resumo (saldo antes/depois) e confirme "Enviar".',
    ],
  },
  follow_profile: {
    title: 'Siga um perfil', desc: 'Crie uma conexão nova hoje.',
    steps: [
      'Abra qualquer perfil público do app.',
      'Toque no botão de seguir.',
      'A missão atualiza automaticamente assim que o follow for salvo.',
    ],
  },
  like_post: {
    title: 'Curta 3 posts', desc: 'Distribua energia no feed.',
    steps: [
      'Abra o feed ou um perfil com publicações.',
      'Curta 3 posts diferentes.',
      'O contador sobe em tempo real a cada curtida válida.',
    ],
  },
  save_post: {
    title: 'Salve 2 posts', desc: 'Guarde conteúdos para rever depois.',
    steps: [
      'Abra qualquer post do feed ou de perfil.',
      'Toque em salvar em 2 posts diferentes.',
      'A missão fecha automaticamente quando atingir 2/2.',
    ],
  },
  vote_poll: {
    title: 'Vote em 1 enquete', desc: 'Participe de uma votação da comunidade.',
    steps: [
      'Abra uma publicação do tipo enquete.',
      'Escolha uma opção e confirme o voto.',
      'A missão completa na hora após o voto ser aceito.',
    ],
  },
  comment_post: {
    title: 'Comente em 1 post', desc: 'Entre na conversa.',
    steps: [
      'Abra um post com comentários.',
      'Escreva e envie um comentário.',
      'A missão atualiza assim que o comentário for criado.',
    ],
  },
  visit_notifications: {
    title: 'Abra as notificações', desc: 'Verifique interações recentes.',
    steps: [
      'Abra a central de notificações.',
      'Aguarde a tela carregar completamente.',
      'A missão fecha automaticamente.',
    ],
  },
  visit_vitrine_vip: {
    title: 'Explore a Vitrine VIP', desc: 'Veja criadores e ofertas VIP.',
    steps: [
      'Abra a Vitrine VIP pelo menu.',
      'Espere a vitrine carregar.',
      'A missão é concluída automaticamente.',
    ],
  },
  visit_canal_vip: {
    title: 'Visite o Canal VIP', desc: 'Explore a área premium de conteúdo.',
    steps: [
      'Abra a página do Canal VIP.',
      'Espere a área principal carregar.',
      'A missão fecha automaticamente.',
    ],
  },
};


export function useAuraDailyQuests() {
  const { user } = useAuth();
  const [quests, setQuests] = useState<AuraQuest[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastReasons, setLastReasons] = useState<Record<string, AuraQuestLastReason>>({});
  const prevRef = useRef<Record<string, number>>({});
  // Espelho síncrono do array de quests — usado pelos listeners de eventos
  // que rodam fora do ciclo de render e precisam comparar o estado anterior
  // ao receber AURA_QUEST_EVENT sem depender de stale closures.
  const questsRef = useRef<AuraQuest[]>([]);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc('aura_get_daily_quests');
      if (!error && Array.isArray(data)) {
        setQuests(data as AuraQuest[]);
        questsRef.current = data as AuraQuest[];
      }
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Otimista: incrementa local + dispara toast suave imediato; depois sincroniza com o banco.
  const progress = useCallback(async (key: string, amount = 1, reason?: string) => {
    if (!user?.id) return;
    if (reason) {
      setLastReasons((prev) => ({ ...prev, [key]: { reason, at: Date.now() } }));
    }
    setQuests((prev) => {
      const next = prev.map((q) => {
        if (q.quest_key !== key || q.claimed) return q;
        const nv = Math.min(q.target, q.progress + Math.max(amount, 1));
        if (nv > q.progress && nv >= q.target && !q.claimed) {
          toast.success(`Missão concluída: ${QUEST_LABELS[key]?.title ?? key}`, {
            description: `Resgate +${q.xp_reward} XP no painel.`,
            duration: 2500,
          });
        }
        return { ...q, progress: nv };
      });
      return next;
    });
    await (supabase as any).rpc('aura_progress_quest', { p_quest_key: key, p_amount: amount });
    // Notifica outras instâncias / abas para que recarreguem o quadro de missões.
    if (typeof window !== 'undefined') {
      try { window.dispatchEvent(new CustomEvent(AURA_QUEST_EVENT, { detail: { key, amount } })); } catch {}
    }
    refresh();
  }, [user?.id, refresh]);

  const [claimingKey, setClaimingKey] = useState<string | null>(null);
  const [justClaimedKey, setJustClaimedKey] = useState<string | null>(null);

  const claim = useCallback(async (key: string) => {
    if (!user?.id) return;
    setClaimingKey(key);
    // Snapshot para rollback em caso de erro
    const snapshot = quests;
    // Otimista: marca como resgatado já na UI
    setQuests((prev) => prev.map((q) => q.quest_key === key ? { ...q, claimed: true, progress: q.target } : q));
    const { data, error } = await (supabase as any).rpc('aura_claim_quest', { p_quest_key: key });
    setClaimingKey(null);
    if (error) {
      // Rollback explícito do estado otimista
      setQuests(snapshot);
      toast.error('Não foi possível resgatar', { description: error.message });
      refresh();
      return;
    }
    const r = data?.[0];
    if (r) {
      toast.success(`+${r.awarded_xp} XP resgatado!`, {
        description: r.level_up ? `🎉 Você subiu para o nível ${r.level}!` : 'XP somado ao seu total. Volte amanhã para mais.',
        duration: 3500,
      });
    }
    setJustClaimedKey(key);
    setTimeout(() => setJustClaimedKey((k) => (k === key ? null : k)), 1400);
    refresh();
  }, [user?.id, refresh, quests]);

  useEffect(() => { refresh(); }, [refresh]);

  // Atualização em tempo real: qualquer trigger global (chat, gift, randomize,
  // rare tap, super DM, room visit etc.) dispara `aura-quest:progressed` e o
  // quadro recarrega sem precisar reload. Também re-sincroniza quando a aba
  // volta a ficar visível.
  useEffect(() => {
    if (!user?.id) return;
    const onProgressed = async (e: Event) => {
      const detail = (e as CustomEvent<AuraQuestProgressedDetail>).detail;
      if (detail?.reason && detail.key) {
        setLastReasons((prev) => ({
          ...prev,
          [String(detail.key)]: { reason: detail.reason!, at: detail.at ?? Date.now() },
        }));
      }
      // Snapshot ANTES do refresh para detectar avanço/conclusão.
      const before = questsRef.current.find((q) => q.quest_key === detail?.key);
      await refresh();
      if (before && detail?.key) {
        const after = questsRef.current.find((q) => q.quest_key === detail.key);
        if (after && !before.claimed && after.progress > before.progress) {
          const label = QUEST_LABELS[String(detail.key)]?.title ?? 'Missão diária';
          if (after.progress >= after.target) {
            toast.success(`Missão concluída: ${label}`, {
              description: `Resgate +${after.xp_reward} XP no painel de missões.`,
              duration: 4000,
            });
          } else {
            toast(`+1 progresso · ${label}`, {
              description: `${after.progress}/${after.target}`,
              duration: 2500,
            });
          }
        }
      }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    const onFocus = () => refresh();
    window.addEventListener(AURA_QUEST_EVENT, onProgressed);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    // Reconciliação automática: a cada 25s re-busca o estado do servidor,
    // garantindo que o quadro reflita o banco mesmo se algum evento foi perdido.
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 25_000);
    return () => {
      window.removeEventListener(AURA_QUEST_EVENT, onProgressed);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.clearInterval(interval);
    };
  }, [user?.id, refresh]);

  // Resumos derivados
  const summary = useMemo(() => {
    const total = quests.length;
    const completed = quests.filter((q) => q.progress >= q.target).length;
    const claimed = quests.filter((q) => q.claimed).length;
    const xpTodayClaimed = quests
      .filter((q) => q.claimed)
      .reduce((s, q) => s + q.xp_reward, 0);
    const xpTodayPending = quests
      .filter((q) => q.progress >= q.target && !q.claimed)
      .reduce((s, q) => s + q.xp_reward, 0);
    const overallPct = total === 0 ? 0 : Math.round(
      (quests.reduce((s, q) => s + Math.min(1, q.progress / q.target), 0) / total) * 100
    );
    const dailyGoalXp = quests.reduce((s, q) => s + q.xp_reward, 0);
    const xpRemaining = Math.max(0, dailyGoalXp - xpTodayClaimed);
    const goalPct = dailyGoalXp === 0 ? 0 : Math.round((xpTodayClaimed / dailyGoalXp) * 100);
    return { total, completed, claimed, xpTodayClaimed, xpTodayPending, overallPct, dailyGoalXp, xpRemaining, goalPct };
  }, [quests]);

  return { quests, loading, refresh, progress, claim, labels: QUEST_LABELS, summary, claimingKey, justClaimedKey, lastReasons };
}

// =====================================================================
// Histórico (últimos N dias)
// =====================================================================
export interface AuraQuestDay {
  day: string;
  total: number;
  completed: number;
  claimed: number;
  xp_earned: number;
}

export function useAuraQuestsHistory(days = 7) {
  const { user } = useAuth();
  const [items, setItems] = useState<AuraQuestDay[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc('aura_quests_history', { p_days: days });
      if (!error && Array.isArray(data)) setItems(data as AuraQuestDay[]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, days]);

  useEffect(() => { refresh(); }, [refresh]);
  return { items, loading, refresh };
}
