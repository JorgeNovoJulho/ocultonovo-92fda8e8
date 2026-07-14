import { useEffect, useState } from 'react';
import { useSocialBetaSessions } from '@/hooks/useSocialBetaSessions';
import { SocialBetaMiniChat } from './SocialBetaMiniChat';
import { SocialBetaModulePicker } from './SocialBetaModulePicker';
import type { SocialBetaSlot } from '@/hooks/useSocialBetaVisit';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from '@/hooks/useAuth';
import { buildSupabaseImageThumb } from '@/lib/imageTransform';
import { Loader2, Plus, Users2, LogOut, X, Check, UserPlus, ShieldAlert, Flag, Ban } from 'lucide-react';

type UserHit = { user_id: string; username: string | null; name: string | null; avatar_url: string | null };

export function SocialBetaSessionsPanel({ slot }: { slot: Exclude<SocialBetaSlot, 'hub'> }) {
  const { user } = useAuth();
  const { sessions, invites, loading, createSession, inviteUser, respondInvite, leaveSession, endSession } =
    useSocialBetaSessions(slot, true);
  const [openCreate, setOpenCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [max, setMax] = useState(8);
  const [busy, setBusy] = useState(false);
  const [openChatFor, setOpenChatFor] = useState<string | null>(null);
  const [inviteFor, setInviteFor] = useState<string | null>(null);
  const [inviteQuery, setInviteQuery] = useState('');
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);
  const [hits, setHits] = useState<UserHit[]>([]);
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');

  // Debounced autocomplete
  useEffect(() => {
    if (!inviteFor) { setHits([]); return; }
    const q = inviteQuery.trim().replace(/^@/, '');
    if (q.length < 2) { setHits([]); return; }
    const t = setTimeout(async () => {
      const { data } = await (supabase as any).rpc('social_beta_search_users', { _q: q });
      setHits((data || []) as UserHit[]);
    }, 250);
    return () => clearTimeout(t);
  }, [inviteQuery, inviteFor]);

  const submit = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await createSession(title.trim(), desc.trim() || undefined, max);
      setTitle(''); setDesc(''); setMax(8); setOpenCreate(false);
    } catch (e: any) {
      alert('Não foi possível criar a sessão: ' + (e?.message || 'erro'));
    } finally { setBusy(false); }
  };

  const doInviteUser = async (sessionId: string, targetUserId: string, label: string) => {
    setInviteMsg(null);
    try {
      await inviteUser(sessionId, targetUserId);
      setInviteMsg(`Convite enviado para ${label}.`);
      setInviteQuery(''); setHits([]);
    } catch (e: any) {
      setInviteMsg('Falha: ' + (e?.message || 'erro'));
    }
  };

  const doReport = async (sessionId: string) => {
    const reason = reportReason.trim();
    if (!reason) return;
    const { error } = await (supabase as any).rpc('social_beta_report', {
      _session_id: sessionId, _target_user: null, _reason: reason,
    });
    if (error) alert('Falha ao denunciar: ' + error.message);
    else { setReportFor(null); setReportReason(''); alert('Denúncia registrada.'); }
  };

  const doBlock = async (hostId: string) => {
    if (!user?.id || hostId === user.id) return;
    if (!confirm('Bloquear o host desta sessão? Você não verá mais sessões/conteúdos dele.')) return;
    const { data: me } = await supabase.from('profiles').select('id').eq('user_id', user.id).maybeSingle();
    const { data: target } = await supabase.from('profiles').select('id').eq('user_id', hostId).maybeSingle();
    if (!me || !target) { alert('Não foi possível concluir.'); return; }
    const { error } = await supabase.from('blocked_contacts').insert({
      user_id: (me as any).id, blocked_user_id: (target as any).id, block_type: 'blocked',
    } as any);
    if (error && (error as any).code !== '23505') alert('Falha: ' + error.message);
    else alert('Usuário bloqueado.');
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Sessões controladas</h2>
        <button
          onClick={() => setOpenCreate((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Nova sessão
        </button>
      </div>

      {openCreate && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título da sessão"
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descrição breve (opcional)" rows={2}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Máx. participantes</label>
            <input type="number" min={2} max={8} value={max}
              onChange={(e) => setMax(Math.max(2, Math.min(8, Number(e.target.value) || 8)))}
              className="w-16 rounded-md border border-border bg-background px-2 py-1 text-sm" />
            <button onClick={submit} disabled={busy || !title.trim()}
              className="ml-auto rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">
              {busy ? 'Criando...' : 'Criar'}
            </button>
          </div>
        </div>
      )}

      {invites.length > 0 && (
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Convites pendentes</p>
          {invites.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-2">
              <span className="text-sm">{i.session_title}</span>
              <div className="flex gap-1">
                <button onClick={() => respondInvite(i.id, true)} className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground">
                  <Check className="h-3 w-3" /> Aceitar
                </button>
                <button onClick={() => respondInvite(i.id, false)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs">
                  <X className="h-3 w-3" /> Recusar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando sessões…</div>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma sessão aberta nesta sub-área ainda.</p>
      ) : (
        <div className="grid gap-3">
          {sessions.map((s) => (
            <article key={s.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{s.title}</h3>
                  {s.description && <p className="text-sm text-muted-foreground mt-0.5">{s.description}</p>}
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <Users2 className="h-3.5 w-3.5" />
                    {s.participant_count}/{s.max_participants}
                    <span>·</span>
                    <span>{s.status === 'open' ? 'aberta' : s.status === 'closed' ? 'fechada' : 'encerrada'}</span>
                    {s.is_host && <span className="rounded bg-muted px-1.5 py-0.5">host</span>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 justify-end">
                  {s.is_participant && (
                    <button onClick={() => setOpenChatFor(openChatFor === s.id ? null : s.id)}
                      className="rounded-md border border-border px-2 py-1 text-xs">
                      {openChatFor === s.id ? 'Fechar chat' : 'Abrir chat'}
                    </button>
                  )}
                  {(s.is_participant || s.is_host) && (
                    <button onClick={() => { setInviteFor(inviteFor === s.id ? null : s.id); setInviteMsg(null); setInviteQuery(''); setHits([]); }}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs">
                      <UserPlus className="h-3 w-3" /> Convidar
                    </button>
                  )}
                  <button onClick={() => { setReportFor(reportFor === s.id ? null : s.id); setReportReason(''); }}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
                    <Flag className="h-3 w-3" /> Denunciar
                  </button>
                  {s.host_id !== user?.id && (
                    <button onClick={() => doBlock(s.host_id)}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
                      <Ban className="h-3 w-3" /> Bloquear host
                    </button>
                  )}
                  {s.is_participant && !s.is_host && (
                    <button onClick={() => leaveSession(s.id)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs">
                      <LogOut className="h-3 w-3" /> Sair
                    </button>
                  )}
                  {s.is_host && (
                    <button onClick={() => endSession(s.id)} className="inline-flex items-center gap-1 rounded-md border border-destructive/50 text-destructive px-2 py-1 text-xs">
                      <ShieldAlert className="h-3 w-3" /> Encerrar
                    </button>
                  )}
                </div>
              </div>

              {inviteFor === s.id && (
                <div className="rounded-lg border border-border bg-background p-2 space-y-2">
                  <input value={inviteQuery} onChange={(e) => setInviteQuery(e.target.value)} placeholder="Buscar por @username ou nome"
                    className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm" />
                  {hits.length > 0 && (
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {hits.map((h) => (
                        <button key={h.user_id}
                          onClick={() => doInviteUser(s.id, h.user_id, h.username ? '@' + h.username : (h.name || 'usuário'))}
                          className="w-full flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-left hover:bg-muted">
                          {h.avatar_url ? (
                            <img decoding="async" src={buildSupabaseImageThumb(h.avatar_url, { width: 48, quality: 70 }) || h.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" loading="lazy" />
                          ) : (
                            <div className="h-6 w-6 rounded-full bg-muted" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">{h.username ? '@' + h.username : (h.name || '—')}</p>
                            {h.username && h.name && <p className="text-xs text-muted-foreground truncate">{h.name}</p>}
                          </div>
                          <span className="text-xs text-primary">convidar</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {inviteQuery.trim().length >= 2 && hits.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhum usuário encontrado.</p>
                  )}
                  {inviteMsg && <p className="text-xs text-muted-foreground">{inviteMsg}</p>}
                </div>
              )}

              {reportFor === s.id && (
                <div className="rounded-lg border border-border bg-background p-2 space-y-2">
                  <textarea value={reportReason} onChange={(e) => setReportReason(e.target.value)}
                    placeholder="Motivo da denúncia" rows={2}
                    className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm" />
                  <div className="flex justify-end gap-1">
                    <button onClick={() => { setReportFor(null); setReportReason(''); }}
                      className="rounded-md border border-border px-2 py-1 text-xs">Cancelar</button>
                    <button onClick={() => doReport(s.id)} disabled={!reportReason.trim()}
                      className="rounded-md bg-destructive px-2 py-1 text-xs text-destructive-foreground disabled:opacity-50">
                      Enviar denúncia
                    </button>
                  </div>
                </div>
              )}

              {openChatFor === s.id && s.is_participant && (
                <>
                  <SocialBetaModulePicker sessionId={s.id} />
                  <SocialBetaMiniChat sessionId={s.id} />
                </>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
