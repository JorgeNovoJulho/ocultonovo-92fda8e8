/**
 * /debug/sessao — diagnóstico rodando NO PRÓPRIO APARELHO.
 *
 * Mostra o que o app recebe de verdade neste dispositivo: sessão de login
 * (validade do token), perfil carregado, e o resultado das consultas do feed
 * e do Oculto Play (quantidade + erro exato). Serve para comparar celular x
 * computador. Não mostra tokens nem dados sensíveis.
 */
import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useOcultoPlayAccess } from '@/hooks/useOcultoPlayAccess';
import { getCurrentAppVersion, clearAppCachesAndUnregisterSW } from '@/lib/appVersion';

type Check = { label: string; ok: boolean | null; detail: string };

const errText = (e: any) => (e ? [e.code, e.message || String(e), e.details, e.hint].filter(Boolean).join(' · ') : '');

async function timed<T>(fn: () => PromiseLike<T>): Promise<{ value?: T; error?: any; ms: number }> {
  const t0 = performance.now();
  try {
    const value = await fn();
    return { value, ms: Math.round(performance.now() - t0) };
  } catch (error) {
    return { error, ms: Math.round(performance.now() - t0) };
  }
}

export default function SessionDiagnosticsPage() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { canAccess } = useOcultoPlayAccess();
  const qc = useQueryClient();
  const [checks, setChecks] = useState<Check[]>([]);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    const out: Check[] = [];
    const push = (c: Check) => { out.push(c); setChecks([...out]); };

    // 1) Sessão
    const s = await timed(() => supabase.auth.getSession());
    const session = (s.value as any)?.data?.session;
    const exp = session?.expires_at ? new Date(session.expires_at * 1000) : null;
    const expired = exp ? exp.getTime() < Date.now() : true;
    push({
      label: 'Sessão de login',
      ok: !!session && !expired,
      detail: session
        ? `usuário ${session.user?.id?.slice(0, 8)}… · token ${expired ? 'VENCIDO' : 'válido'} até ${exp?.toLocaleString('pt-BR')} (${s.ms} ms)`
        : `sem sessão ${errText(s.error)}`,
    });

    // 2) Usuário no servidor (valida o token de verdade)
    const u = await timed(() => supabase.auth.getUser());
    const srvUser = (u.value as any)?.data?.user;
    push({
      label: 'Token aceito pelo servidor',
      ok: !!srvUser && !(u.value as any)?.error,
      detail: srvUser ? `ok (${u.ms} ms)` : `recusado: ${errText((u.value as any)?.error || u.error)}`,
    });

    // 3) Perfil no app
    const isFb = !!(profile as any)?.__fallback || !!(profile as any)?.__stale;
    push({
      label: 'Perfil carregado no app',
      ok: !!profile?.id && !isFb,
      detail: profile
        ? `@${profile.username} · id ${String(profile.id || '(vazio)').slice(0, 8)}…${isFb ? ' · PROVISÓRIO (rede falhou)' : ''}`
        : 'nenhum',
    });

    // 4) Perfil direto do banco
    const p = await timed(() => (supabase as any).from('profiles').select('id, username').eq('user_id', user?.id ?? '').limit(3));
    const prow = (p.value as any)?.data ?? [];
    const perr = (p.value as any)?.error || p.error;
    push({
      label: 'Perfil no banco (consulta direta)',
      ok: !perr && prow.length > 0,
      detail: perr ? `erro: ${errText(perr)} (${p.ms} ms)` : `${prow.length} linha(s) · ${prow.map((r: any) => '@' + r.username).join(', ')} (${p.ms} ms)`,
    });

    // 5) Feed principal (posts)
    const f = await timed(() => (supabase as any).from('posts').select('id', { count: 'exact', head: true }));
    const ferr = (f.value as any)?.error || f.error;
    push({
      label: 'Feed (posts visíveis)',
      ok: !ferr && ((f.value as any)?.count ?? 0) > 0,
      detail: ferr ? `erro: ${errText(ferr)} (${f.ms} ms)` : `${(f.value as any)?.count ?? 0} posts (${f.ms} ms)`,
    });

    // 6) Oculto Play — acesso e RPC do feed
    push({ label: 'Acesso ao Oculto Play', ok: !!canAccess, detail: canAccess ? 'liberado' : 'BLOQUEADO para esta conta neste aparelho' });
    const r = await timed(() => (supabase as any).rpc('oculto_play_feed', { p_section: 'normal', p_kind: null, p_limit: 500, p_before: null }));
    const rerr = (r.value as any)?.error || r.error;
    const rows = ((r.value as any)?.data ?? []) as any[];
    const mine = profile?.id ? rows.filter((x) => x.author_id === profile.id).length : 0;
    push({
      label: 'Oculto Play (feed)',
      ok: !rerr && rows.length > 0,
      detail: rerr ? `erro: ${errText(rerr)} (${r.ms} ms)` : `${rows.length} itens · ${mine} seus (${r.ms} ms)`,
    });

    // 7) Oculto Play — itens diretos do usuário
    if (profile?.id) {
      const m = await timed(() => (supabase as any).from('oculto_play_items').select('id', { count: 'exact', head: true }).eq('author_id', profile.id));
      const merr = (m.value as any)?.error || m.error;
      push({
        label: 'Oculto Play (seus itens, direto)',
        ok: !merr && ((m.value as any)?.count ?? 0) > 0,
        detail: merr ? `erro: ${errText(merr)} (${m.ms} ms)` : `${(m.value as any)?.count ?? 0} itens (${m.ms} ms)`,
      });
    }

    // 8) Ambiente
    let sw = 'não';
    try { sw = navigator.serviceWorker?.controller ? 'sim' : 'não'; } catch { /* noop */ }
    push({
      label: 'Aparelho / versão',
      ok: null,
      detail: `versão ${getCurrentAppVersion()} · tela ${window.innerWidth}px · online ${navigator.onLine ? 'sim' : 'não'} · SW ${sw} · ${navigator.userAgent.slice(0, 90)}`,
    });
    setRunning(false);
  }, [user?.id, profile, canAccess]);

  useEffect(() => { void run(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const resetLocal = async () => {
    if (!window.confirm('Limpar os dados guardados neste aparelho e recarregar? Você continua logado.')) return;
    try {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith('sb-')) return; // mantém o login
        if (/^oculto|ocultoplay|profile|feed|cache/i.test(k)) localStorage.removeItem(k);
      });
      sessionStorage.clear();
    } catch { /* noop */ }
    qc.clear();
    try { await clearAppCachesAndUnregisterSW(); } catch { /* noop */ }
    window.location.reload();
  };

  return (
    <div className="mx-auto min-h-screen max-w-xl bg-background p-4 text-foreground">
      <h1 className="text-xl font-extrabold">Diagnóstico deste aparelho</h1>
      <p className="mt-1 text-xs text-muted-foreground">Tire um print desta tela e envie. Não aparece senha nem token.</p>
      <ul className="mt-4 space-y-2">
        {checks.map((c) => (
          <li key={c.label} className="rounded-lg border border-border/60 p-3">
            <p className="text-sm font-bold">
              <span className="mr-1.5">{c.ok === null ? 'ℹ️' : c.ok ? '✅' : '❌'}</span>{c.label}
            </p>
            <p className="mt-0.5 break-words text-xs text-muted-foreground">{c.detail}</p>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={run} disabled={running} className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60">
          {running ? 'Testando…' : 'Testar de novo'}
        </button>
        <button type="button" onClick={resetLocal} className="rounded-md border border-border px-4 py-2 text-sm font-bold">
          Limpar dados do aparelho e recarregar
        </button>
      </div>
    </div>
  );
}
