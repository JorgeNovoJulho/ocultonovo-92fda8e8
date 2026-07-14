/**
 * RadarWavesModal — Lista de pessoas que te acenaram no Radar.
 *
 * - Dados reais via useRadarPings (enrichedPings.received).
 * - Realtime: o próprio hook assina `pings` e refaz a query.
 * - Botão "Acenar de volta" (sendPing).
 * - Clique no nome/foto abre o perfil do usuário.
 * - Ao abrir o modal, zera o contador chamando markAllSeen().
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Hand, X, Check, UserCircle2, MessageCircle, Loader2 } from 'lucide-react';
import { useRadarPings } from '@/hooks/useRadarPings';
import { useAuth } from '@/hooks/useAuth';
import { getOrCreateConversationId } from '@/lib/conversationsApi';
import { resolveAuthUserIdFromAnyId } from '@/lib/chatIdentity';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
}

type SelectedTarget = {
  senderId: string;
  username: string | null;
  avatar: string | null;
  displayHandle: string;
};

export function RadarWavesModal({ open, onClose }: Props) {
  const { enrichedPings, sendPing, markAllSeen, pingedByMeSet, isPingSending } = useRadarPings();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selected, setSelected] = useState<SelectedTarget | null>(null);
  const [openingChat, setOpeningChat] = useState(false);

  const handleOpenProfile = () => {
    if (!selected) return;
    if (selected.username) {
      navigate(`/profile/${selected.username}`);
      setSelected(null);
      onClose();
    } else {
      toast.error('Perfil indisponível.');
    }
  };

  const handleOpenChat = async () => {
    if (!selected) return;
    if (!user?.id) { toast.error('Faça login para enviar mensagem.'); return; }
    setOpeningChat(true);
    try {
      const targetAuthId = (await resolveAuthUserIdFromAnyId(selected.senderId)) || selected.senderId;
      const { id, error } = await getOrCreateConversationId(user.id, targetAuthId);
      if (error || !id) {
        toast.error('Não foi possível abrir a conversa.');
        return;
      }
      setSelected(null);
      onClose();
      navigate(`/messages?c=${id}`);
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao abrir a conversa.');
    } finally {
      setOpeningChat(false);
    }
  };

  const received = enrichedPings.received;

  // Ordena: não-vistos primeiro, depois mais recentes.
  const sorted = useMemo(() => {
    return [...received].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'sent' ? -1 : 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [received]);

  // Zera contador ao abrir o modal (após render para dar tempo de pintar).
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => { markAllSeen().catch(() => {}); }, 400);
    return () => window.clearTimeout(t);
  }, [open, markAllSeen]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className="max-w-md w-[calc(100vw-1rem)] p-0 overflow-hidden border-cyan-400/40 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950/40 text-white"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-cyan-500/20 ring-1 ring-cyan-400/50">
              <Hand className="h-4 w-4 text-cyan-200" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-bold truncate">Quem te acenou no Radar</h2>
              <p className="text-[11px] text-white/60 truncate">
                {sorted.length === 0 ? 'Ninguém acenou nas últimas 24h' : `${sorted.length} aceno${sorted.length === 1 ? '' : 's'} recente${sorted.length === 1 ? '' : 's'}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-3 space-y-2">
          {sorted.length === 0 && (
            <div className="text-center py-10 px-4">
              <div className="text-3xl mb-2">👋</div>
              <p className="text-sm text-white/70">Quando alguém te acenar pelo Radar, vai aparecer aqui.</p>
            </div>
          )}

          {sorted.map((p) => {
            const profile = p.profile;
            const username = profile?.username ?? null;
            const displayHandle = username ? `@${username}` : 'Perfil oculto';
            const avatar = profile?.avatar_url ?? null;
            void username;
            const alreadyWavedBack = pingedByMeSet.has(p.sender_id);
            const isNew = p.status === 'sent';
            const when = (() => {
              try {
                const d = new Date(p.created_at);
                return d.toLocaleString('pt-BR', {
                  day: '2-digit', month: '2-digit',
                  hour: '2-digit', minute: '2-digit',
                });
              } catch { return ''; }
            })();

            return (
              <div
                key={p.id}
                className={`flex items-center gap-3 rounded-xl p-2.5 ring-1 transition-colors ${
                  isNew
                    ? 'bg-cyan-500/10 ring-cyan-400/40'
                    : 'bg-white/[0.03] ring-white/5'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelected({ senderId: p.sender_id, username, avatar, displayHandle })}
                  className="shrink-0 relative focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 rounded-full"
                  aria-label={`Abrir ações de ${displayHandle}`}
                >
                  {avatar ? (
                    <img
                      src={avatar}
                      alt={displayHandle}
                      loading="lazy"
                      className="h-11 w-11 rounded-full object-cover ring-2 ring-cyan-300/40"
                    />
                  ) : (
                    <div className="h-11 w-11 rounded-full bg-gradient-to-br from-cyan-500/40 to-fuchsia-500/40 ring-2 ring-cyan-300/40 flex items-center justify-center text-sm font-bold">
                      {(username ?? '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                  {isNew && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-cyan-400 ring-2 ring-slate-950 animate-pulse" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setSelected({ senderId: p.sender_id, username, avatar, displayHandle })}
                  className="min-w-0 flex-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 rounded-md"
                >
                  <div className="text-sm font-semibold truncate underline-offset-2 hover:underline">{displayHandle}</div>
                  <div className="text-[11px] text-white/60 truncate">
                    acenou pelo Radar{when ? ` · ${when}` : ''}
                  </div>
                </button>


                {alreadyWavedBack ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled
                    className="h-8 px-2.5 text-[11px] border-emerald-400/40 text-emerald-200 bg-emerald-500/10"
                  >
                    <Check className="h-3.5 w-3.5 mr-1" /> Aceno enviado
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => sendPing.mutate(p.sender_id)}
                    disabled={isPingSending}
                    className="h-8 px-2.5 text-[11px] font-bold bg-gradient-to-r from-cyan-500 to-sky-500 hover:from-cyan-400 hover:to-sky-400 text-white shadow-[0_0_12px_rgba(34,211,238,0.4)]"
                  >
                    <Hand className="h-3.5 w-3.5 mr-1" /> Acenar
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>

      {/* Action sheet: Ver perfil / Enviar mensagem */}
      <Dialog open={!!selected} onOpenChange={(v) => { if (!v) setSelected(null); }}>
        <DialogContent
          className="max-w-sm w-[calc(100vw-1.5rem)] p-0 overflow-hidden border-cyan-400/40 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950/40 text-white"
        >
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
            {selected?.avatar ? (
              <img src={selected.avatar} alt={selected.displayHandle} className="h-10 w-10 rounded-full object-cover ring-2 ring-cyan-300/40" />
            ) : (
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-cyan-500/40 to-fuchsia-500/40 ring-2 ring-cyan-300/40 flex items-center justify-center text-sm font-bold">
                {(selected?.username ?? '?').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold truncate">{selected?.displayHandle}</div>
              <div className="text-[11px] text-white/60">O que deseja fazer?</div>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="shrink-0 rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-3 flex flex-col gap-2">
            <Button
              onClick={handleOpenProfile}
              disabled={!selected?.username}
              className="w-full justify-start h-12 bg-white/5 hover:bg-white/10 text-white border border-white/10"
            >
              <UserCircle2 className="h-5 w-5 mr-2 text-cyan-300" />
              Abrir perfil
            </Button>
            <Button
              onClick={handleOpenChat}
              disabled={openingChat}
              className="w-full justify-start h-12 bg-gradient-to-r from-cyan-500 to-sky-500 hover:from-cyan-400 hover:to-sky-400 text-white font-bold shadow-[0_0_12px_rgba(34,211,238,0.4)]"
            >
              {openingChat ? (
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              ) : (
                <MessageCircle className="h-5 w-5 mr-2" />
              )}
              Enviar mensagem
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

export default RadarWavesModal;
