/**
 * ConnectionsContent — sugestões para iniciar contato com gente presente
 * no Social Beta nas últimas 2h (em qualquer sub-área). Botão atalho:
 * cria uma sessão na sub-área "connections" e já convida o usuário.
 */
import { useState } from 'react';
import { UserPlus, Loader2, Check } from 'lucide-react';
import { useSocialBetaRecentUsers } from '@/hooks/useSocialBetaRecentUsers';
import { useSocialBetaSessions } from '@/hooks/useSocialBetaSessions';
import { useSocialBetaSlotEvent } from '@/hooks/useSocialBetaSlotEvent';
import { resolveAvatarUrl } from '@/lib/avatarUrl';
import { buildSupabaseImageThumb } from '@/lib/imageTransform';
import { toast } from 'sonner';

export function ConnectionsContent() {
  const { data, loading } = useSocialBetaRecentUsers(null, true, 12, 2);
  const { createSession, inviteUser } = useSocialBetaSessions('connections', true);
  const { track } = useSocialBetaSlotEvent('connections', true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());

  const handleInvite = async (u: { user_id: string; username: string | null; name: string | null }) => {
    if (busyId || doneIds.has(u.user_id)) return;
    setBusyId(u.user_id);
    track('click_invite', { target_user_id: u.user_id });
    try {
      const label = u.username ? '@' + u.username : (u.name || 'usuário');
      const sessionId = await createSession(`Conexão rápida com ${label}`, undefined, 4);
      await inviteUser(sessionId, u.user_id);
      track('invite_sent', { target_user_id: u.user_id, session_id: sessionId });
      setDoneIds((prev) => new Set(prev).add(u.user_id));
      toast.success('Convite enviado 💜', { description: 'A sessão fica visível abaixo.' });
    } catch (e: any) {
      track('invite_failed', { target_user_id: u.user_id });
      toast.error('Não foi possível convidar agora.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <UserPlus className="h-4 w-4 text-foreground" />
        <h2 className="font-semibold">Sugestões para chamar</h2>
        <span className="ml-auto text-xs text-muted-foreground">presentes 2h</span>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando sugestões…</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Ninguém ativo no Social Beta agora. Volte em alguns minutos.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {data.map((u) => {
            const done = doneIds.has(u.user_id);
            const busy = busyId === u.user_id;
            return (
              <div key={u.user_id}
                className="flex items-center gap-2 rounded-lg border border-border bg-background p-2">
                {u.avatar_url ? (
                  <img decoding="async" src={buildSupabaseImageThumb(resolveAvatarUrl(u.avatar_url) || '', { width: 72, quality: 70 }) || ''} alt="" loading="lazy"
                    className="h-9 w-9 rounded-full object-cover" />
                ) : (
                  <div className="h-9 w-9 rounded-full bg-muted" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {u.username ? '@' + u.username : (u.name || 'misterioso(a)')}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {u.visits_count} visita(s) recentes
                  </p>
                </div>
                <button
                  onClick={() => handleInvite(u)}
                  disabled={busy || done}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground disabled:opacity-50"
                >
                  {done ? (
                    <><Check className="h-3 w-3" /> Enviado</>
                  ) : busy ? (
                    <><Loader2 className="h-3 w-3 animate-spin" /> …</>
                  ) : (
                    <><UserPlus className="h-3 w-3" /> Chamar</>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
