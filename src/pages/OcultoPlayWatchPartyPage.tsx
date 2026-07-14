/**
 * OcultoPlayWatchPartyPage — Etapa 39 (guest)
 *
 * Página para participantes de uma Watch Party.
 * Segue o estado do host (item atual, posição, play/pause) via realtime.
 * Mostra "sala encerrada" quando o host finaliza.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2, Users2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWatchParty, useWatchPartyActions } from '@/hooks/useWatchParty';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from 'sonner';

interface PlayItemLite {
  id: string;
  kind: string;
  media_url: string | null;
  audio_url: string | null;
  thumb_url: string | null;
  title: string | null;
  caption: string | null;
}

const SYNC_THRESHOLD_SECONDS = 1.2;

export default function OcultoPlayWatchPartyPage() {
  const { id } = useParams<{ id: string }>();
  const { party, loading } = useWatchParty(id);
  const { join } = useWatchPartyActions();
  const [item, setItem] = useState<PlayItemLite | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const joinedRef = useRef(false);

  // Entrar na sala uma vez
  useEffect(() => {
    if (!id || joinedRef.current) return;
    joinedRef.current = true;
    join(id).catch(() => {});
  }, [id, join]);

  // Carrega o item atual sempre que mudar
  const currentItemId = party?.current_item_id ?? null;
  useEffect(() => {
    let cancelled = false;
    if (!currentItemId) {
      setItem(null);
      return;
    }
    supabase
      .from('oculto_play_items')
      .select('id, kind, media_url, audio_url, thumb_url, title, caption')
      .eq('id', currentItemId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setItem((data as PlayItemLite | null) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [currentItemId]);

  // Sincroniza posição/play do <video> com o estado da sala
  useEffect(() => {
    if (!party || !item) return;
    const el = item.kind === 'short_video' ? videoRef.current : audioRef.current;
    if (!el) return;
    const drift = Math.abs(el.currentTime - party.current_pos_seconds);
    if (drift > SYNC_THRESHOLD_SECONDS) {
      try {
        el.currentTime = party.current_pos_seconds;
      } catch {
        // navegador pode recusar se metadados não carregaram ainda
      }
    }
    if (party.is_playing && el.paused) {
      el.play().catch(() => {});
    } else if (!party.is_playing && !el.paused) {
      el.pause();
    }
  }, [party?.current_pos_seconds, party?.is_playing, item?.id]);

  const status = party?.status;
  useEffect(() => {
    if (status === 'ended') toast.message('A sala foi encerrada pelo host.');
  }, [status]);

  const headerLabel = useMemo(() => {
    if (loading) return 'Conectando à sala…';
    if (!party) return 'Sala não encontrada';
    if (party.status === 'ended') return 'Sala encerrada';
    return party.title || 'Watch Party';
  }, [loading, party]);

  return (
    <div className="min-h-dvh bg-black text-white flex flex-col">
      <header className="flex items-center justify-between p-3 border-b border-white/10">
        <div className="flex items-center gap-2 min-w-0">
          <Users2 className="h-5 w-5 text-fuchsia-300 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{headerLabel}</div>
            {party && (
              <div className="text-[11px] opacity-70">
                {party.participant_count} {party.participant_count === 1 ? 'pessoa' : 'pessoas'} na sala
              </div>
            )}
          </div>
        </div>
        <Link to="/oculto-play">
          <Button variant="ghost" size="sm" className="text-white hover:bg-white/10">
            <LogOut className="h-4 w-4 mr-1" /> Sair
          </Button>
        </Link>
      </header>

      <main className="flex-1 grid place-items-center p-4">
        {loading && <Loader2 className="h-6 w-6 animate-spin opacity-60" />}

        {!loading && !party && (
          <div className="text-center text-sm opacity-70">
            Sala inválida ou expirada.
          </div>
        )}

        {!loading && party && party.status === 'ended' && (
          <div className="text-center max-w-sm">
            <div className="text-lg font-semibold mb-2">Sala encerrada</div>
            <p className="text-sm opacity-70 mb-4">
              O host finalizou esta Watch Party. Você pode voltar ao Oculto Play.
            </p>
            <Link to="/oculto-play">
              <Button variant="secondary">Voltar ao Oculto Play</Button>
            </Link>
          </div>
        )}

        {!loading && party && party.status === 'live' && !item && (
          <div className="text-sm opacity-70">Aguardando o host escolher um conteúdo…</div>
        )}

        {!loading && party && party.status === 'live' && item && (
          <div className="w-full max-w-4xl">
            {item.kind === 'short_video' && item.media_url ? (
              <video
                key={item.id}
                ref={videoRef}
                src={item.media_url}
                poster={item.thumb_url ?? undefined}
                className="w-full max-h-[70vh] object-contain bg-black"
                playsInline
                controls={false}
                crossOrigin="anonymous"
              />
            ) : item.kind === 'audio' && item.audio_url ? (
              <div className="flex flex-col items-center gap-4 py-12">
                <div className="grid h-40 w-40 place-items-center rounded-3xl bg-gradient-to-br from-fuchsia-500/40 to-primary/30">
                  <Users2 className="h-16 w-16" />
                </div>
                <audio
                  key={item.id}
                  ref={audioRef}
                  src={item.audio_url}
                  className="w-72"
                  controls={false}
                />
              </div>
            ) : item.thumb_url || item.media_url ? (
              <img
                src={item.thumb_url || item.media_url!}
                alt={item.title ?? ''}
                className="w-full max-h-[70vh] object-contain"
              />
            ) : (
              <div className="text-sm opacity-70 text-center">Conteúdo indisponível.</div>
            )}

            <div className="mt-3 text-center">
              {item.title && <div className="text-sm font-semibold truncate">{item.title}</div>}
              {item.caption && <div className="text-xs opacity-70 line-clamp-2">{item.caption}</div>}
              <div className="mt-1 text-[11px] opacity-60">
                {party.is_playing ? 'Reproduzindo' : 'Pausado'} ·{' '}
                {Math.floor(party.current_pos_seconds)}s
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
