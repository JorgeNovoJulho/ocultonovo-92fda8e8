/**
 * /play/c/:slug — página do canal (Canais Play · Fase 1).
 *
 * Mostra o NOME DO CANAL (não o @usuário — ele só aparece em "Sobre").
 * Canal de vídeo: Início · Shorts · Filmes e links · Memes · +18 · Sobre.
 * Canal de áudio: Início · Músicas · Sobre.
 * Abas vazias somem; +18 só aparece para perfis verificados.
 * Leve para celular modesto: só a aba aberta carrega, imagens preguiçosas.
 */
import { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, BadgeCheck, Clapperboard, Headphones, Loader2, MessageCircle, Pencil,
  Play, Share2, ShieldAlert, Upload, Music, Image as ImageIcon, Film, Snowflake,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { OcultoPlayItemMenu } from '@/components/oculto-play/OcultoPlayItemMenu';
import { OcultoPlayEditModal } from '@/components/oculto-play/OcultoPlayEditModal';
import { OcultoPlayDeleteConfirmDialog } from '@/components/oculto-play/OcultoPlayDeleteConfirmDialog';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';
import { useOcultoPlayActions, type OcultoPlayItem } from '@/hooks/useOcultoPlayContent';
import {
  PLAY_CHANNELS_KEY,
  channelErrorMessage,
  useSetPlayItemFrozen,
  usePlayChannelBySlug,
  usePlayChannelItems,
  type PlayChannelDetail,
  type PlayChannelSection,
} from '@/hooks/usePlayChannels';
import { EditChannelDialog } from '@/components/oculto-play/channels/EditChannelDialog';
import { PlayCommentsSheet } from '@/components/oculto-play/PlayCommentsSheet';
import { pauseSharedAudio } from '@/lib/ocultoPlayAudioSession';

const OcultoPlayFocusModal = lazy(() =>
  import('@/components/oculto-play/OcultoPlayFocusModal').then((m) => ({ default: m.OcultoPlayFocusModal })),
);

type Tab = 'home' | PlayChannelSection | 'about';

const fmt = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')} mi`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace('.0', '')} mil`;
  return String(n);
};

const fmtDuration = (sec: number | null | undefined) => {
  const s = Math.max(0, Math.round(Number(sec ?? 0)));
  if (!s) return '';
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export default function PlayChannelPage() {
  const { slug } = useParams<{ slug: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { data: isMaster } = useIsMasterAdmin();
  const { data: channel, isLoading, error, refetch } = usePlayChannelBySlug(slug);
  const [editOpen, setEditOpen] = useState(false);

  const viewerVerified = isMaster === true
    || !!(profile as any)?.is_verified
    || !!(profile as any)?.is_verified_couple;
  const isOwner = !!channel && !!user?.id && channel.owner_id === user.id;

  const tabs = useMemo(() => {
    if (!channel) return [] as Array<{ id: Tab; label: string; count?: number }>;
    const list: Array<{ id: Tab; label: string; count?: number; show: boolean }> = channel.kind === 'audio'
      ? [
        { id: 'home', label: 'Início', show: true },
        { id: 'audio', label: 'Músicas', count: channel.audio_count, show: channel.audio_count > 0 },
        { id: 'about', label: 'Sobre', show: true },
      ]
      : [
        { id: 'home', label: 'Início', show: true },
        { id: 'shorts', label: 'Shorts', count: channel.shorts_count, show: channel.shorts_count > 0 },
        { id: 'links', label: 'Filmes e links', count: channel.links_count, show: channel.links_count > 0 },
        { id: 'memes', label: 'Memes', count: channel.memes_count, show: channel.memes_count > 0 },
        { id: 'links_adult', label: '+18', count: channel.adult_count, show: channel.adult_count > 0 && viewerVerified },
        { id: 'about', label: 'Sobre', show: true },
      ];
    return list.filter((t) => t.show);
  }, [channel, viewerVerified]);

  const requested = (params.get('tab') as Tab | null) ?? 'home';
  const tab: Tab = tabs.some((t) => t.id === requested) ? requested : 'home';
  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params);
    if (t === 'home') next.delete('tab'); else next.set('tab', t);
    setParams(next, { replace: true });
  };

  if (isLoading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !channel) {
    const msg = (error as { message?: string } | null)?.message ?? '';
    const missingServer = /does not exist|Could not find the function/i.test(msg);
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-lg font-bold">{missingServer ? 'Canais ainda não ativados' : 'Canal não encontrado'}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {missingServer
            ? 'O servidor ainda não recebeu a atualização de canais.'
            : 'O endereço pode ter mudado ou o canal foi removido.'}
        </p>
        <Button className="mt-5" variant="outline" onClick={() => navigate('/oculto-play')}>Voltar ao Play</Button>
      </div>
    );
  }

  const accent = channel.accent_color || '#ec4899';
  const avatar = channel.avatar_url || channel.owner_avatar_url;
  const total = channel.kind === 'audio' ? channel.audio_count : channel.items_total - channel.audio_count;

  const share = async () => {
    const url = `${window.location.origin}/play/c/${channel.slug}`;
    try {
      if (navigator.share) { await navigator.share({ title: channel.name, url }); return; }
    } catch { /* cancelado */ }
    try { await navigator.clipboard.writeText(url); toast.success('Link do canal copiado.'); }
    catch { toast.info(url); }
  };

  return (
    <div className="mx-auto w-full max-w-3xl pb-24">
      {/* Topo */}
      <div className="sticky top-0 z-20 flex items-center gap-2 bg-background/95 px-3 py-2">
        <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/oculto-play'))} aria-label="Voltar" className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <p className="min-w-0 flex-1 truncate text-sm font-bold">{channel.name}</p>
      </div>

      {/* Capa */}
      <div
        className="relative mx-3 aspect-[3/1] overflow-hidden rounded-2xl"
        style={{ background: `linear-gradient(135deg, ${accent}55, #0b0b0f 70%)` }}
      >
        {channel.banner_url && (
          <img src={channel.banner_url} alt="" className="h-full w-full object-cover" decoding="async" />
        )}
      </div>

      {/* Cabeçalho */}
      <div className="px-4 pt-3">
        <div className="flex items-start gap-3">
          <div className="-mt-10 h-20 w-20 shrink-0 overflow-hidden rounded-full bg-muted ring-4 ring-background">
            {avatar
              ? <img src={avatar} alt="" className="h-full w-full object-cover" decoding="async" />
              : <span className="grid h-full w-full place-items-center text-2xl font-extrabold">{channel.name.slice(0, 1).toUpperCase()}</span>}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-1.5 text-xl font-extrabold leading-tight">
              <span className="truncate">{channel.name}</span>
              {(channel.is_official || channel.owner_is_verified) && (
                <BadgeCheck className="h-5 w-5 shrink-0" style={{ color: accent }} aria-label={channel.is_official ? 'Oficial' : 'Verificado'} />
              )}
            </h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                {channel.kind === 'audio' ? <Headphones className="h-3.5 w-3.5" /> : <Clapperboard className="h-3.5 w-3.5" />}
                Canal de {channel.kind === 'audio' ? 'áudio' : 'vídeo'}
              </span>
              <span>· {fmt(total)} {channel.kind === 'audio' ? 'faixas' : 'publicações'}</span>
              <span>· {fmt(Number(channel.views_total))} visualizações</span>
              {channel.status === 'suspended' && <span className="font-semibold text-destructive">· suspenso</span>}
            </p>
          </div>
        </div>

        {channel.description && (
          <p className="mt-3 line-clamp-3 whitespace-pre-line text-sm text-foreground/90">{channel.description}</p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {isOwner ? (
            <>
              <Button size="sm" onClick={() => navigate(`/oculto-play?upload=1&channel=${channel.id}`)} style={{ background: accent }} className="text-white">
                <Upload className="mr-1.5 h-4 w-4" /> Enviar
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="mr-1.5 h-4 w-4" /> Personalizar
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => navigate(`/messages?u=${encodeURIComponent(channel.owner_id)}`)}>
              <MessageCircle className="mr-1.5 h-4 w-4" /> Mensagem
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={share}>
            <Share2 className="mr-1.5 h-4 w-4" /> Compartilhar
          </Button>
        </div>
      </div>

      {/* Abas */}
      <div className="sticky top-[52px] z-10 mt-4 border-b border-border/60 bg-background/95">
        <div className="flex gap-1 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors',
                tab === t.id ? 'text-foreground' : 'border-transparent text-muted-foreground',
              )}
              style={tab === t.id ? { borderColor: accent } : undefined}
            >
              {t.label}{typeof t.count === 'number' ? <span className="ml-1 text-[11px] opacity-60">{t.count}</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="px-3 pt-3">
        {tab === 'about'
          ? <AboutTab channel={channel} />
          : <ChannelItemsTab channel={channel} tab={tab} isOwner={isOwner} accent={accent} />}
      </div>

      {isOwner && (
        <EditChannelDialog
          channel={channel}
          open={editOpen}
          onOpenChange={setEditOpen}
          onSaved={(ch) => {
            if (ch.slug !== channel.slug) navigate(`/play/c/${ch.slug}`, { replace: true });
            else void refetch();
          }}
        />
      )}
    </div>
  );
}

function AboutTab({ channel }: { channel: PlayChannelDetail }) {
  return (
    <div className="space-y-4 text-sm">
      {channel.description
        ? <p className="whitespace-pre-line">{channel.description}</p>
        : <p className="text-muted-foreground">Este canal ainda não tem descrição.</p>}
      <div className="rounded-xl border border-border/60 p-3 space-y-1.5">
        {channel.owner_username && (
          <p>Criado por <Link to={`/creator/${encodeURIComponent(channel.owner_username)}`} className="font-semibold underline-offset-2 hover:underline">@{channel.owner_username}</Link></p>
        )}
        <p className="text-muted-foreground">No Oculto Play desde {new Date(channel.created_at).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</p>
        <p className="text-muted-foreground">{fmt(Number(channel.views_total))} visualizações no total</p>
      </div>
    </div>
  );
}

function ChannelItemsTab({ channel, tab, isOwner, accent }: {
  channel: PlayChannelDetail;
  tab: Exclude<Tab, 'about'>;
  isOwner: boolean;
  accent: string;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: items, isLoading } = usePlayChannelItems(channel, tab);
  const actions = useOcultoPlayActions();
  const setFrozen = useSetPlayItemFrozen();
  const [focus, setFocus] = useState<OcultoPlayItem | null>(null);
  const [commentsItem, setCommentsItem] = useState<OcultoPlayItem | null>(null);
  const [editItem, setEditItem] = useState<OcultoPlayItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<OcultoPlayItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const list = items ?? [];
  const visible = useMemo(() => list.filter((it) => !it.is_frozen), [list]);
  const videoQueue = useMemo(
    () => visible.filter((it) => (it.kind === 'short_video' || it.kind === 'vip_teaser') && !!it.media_url),
    [visible],
  );
  const audios = useMemo(() => list.filter((it) => it.kind === 'audio'), [list]);
  const playableAudios = useMemo(() => audios.filter((it) => !it.is_frozen), [audios]);

  const moveAudio = (from: OcultoPlayItem, delta: number) => {
    const idx = playableAudios.findIndex((a) => a.id === from.id);
    const next = playableAudios[idx + delta];
    if (next) setFocus(next);
  };

  const toggleFreeze = async (it: OcultoPlayItem) => {
    try {
      await setFrozen.mutateAsync({ itemId: it.id, frozen: !it.is_frozen });
      toast.success(it.is_frozen ? 'Descongelado: visível para todos de novo.' : 'Congelado: só você vê até descongelar.');
    } catch (e) {
      toast.error(channelErrorMessage(e));
    }
  };

  const confirmDelete = async () => {
    if (!deleteItem) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('oculto_play_items').delete().eq('id', deleteItem.id);
      if (error) throw error;
      qc.setQueriesData<OcultoPlayItem[] | undefined>({ queryKey: ['oculto-play'] }, (old) =>
        Array.isArray(old) ? old.filter((x) => x?.id !== deleteItem.id) : old);
      qc.invalidateQueries({ queryKey: PLAY_CHANNELS_KEY });
      toast.success('Conteúdo excluído.');
      setDeleteItem(null);
    } catch (e) {
      toast.error('Não foi possível excluir.', { description: (e as { message?: string })?.message });
    } finally {
      setDeleting(false);
    }
  };

  const ownerMenu = (it: OcultoPlayItem, className?: string) => (isOwner ? (
    <OcultoPlayItemMenu
      canManage
      onEdit={() => setEditItem(it)}
      onDelete={() => setDeleteItem(it)}
      onToggleFreeze={() => void toggleFreeze(it)}
      frozen={!!it.is_frozen}
      isFreezePending={setFrozen.isPending && setFrozen.variables?.itemId === it.id}
      isDeletePending={deleting && deleteItem?.id === it.id}
      className={className}
    />
  ) : null);

  const openItem = (it: OcultoPlayItem) => {
    if (it.is_frozen) {
      toast.info('Este conteúdo está congelado. Descongele para que todos possam ver.');
    }
    setFocus(it);
  };

  if (isLoading) {
    return <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (list.length === 0) {
    return (
      <div className="py-14 text-center">
        <p className="font-semibold">{isOwner ? 'Seu canal está pronto' : 'Nada publicado aqui ainda'}</p>
        {isOwner && (
          <>
            <p className="mt-1 text-sm text-muted-foreground">Envie seu primeiro {channel.kind === 'audio' ? 'áudio' : 'vídeo'}.</p>
            <Button className="mt-4 text-white" style={{ background: accent }} onClick={() => navigate(`/oculto-play?upload=1&channel=${channel.id}`)}>
              <Upload className="mr-1.5 h-4 w-4" /> Enviar
            </Button>
          </>
        )}
      </div>
    );
  }

  const frozenBadge = (
    <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/90 px-1.5 py-0.5 text-[9.5px] font-bold text-white">
      <Snowflake className="h-3 w-3" /> Congelado · só você vê
    </span>
  );

  return (
    <>
      {channel.kind === 'audio' || tab === 'audio' ? (
        <div>
          <Button size="sm" className="mb-3 text-white" style={{ background: accent }} onClick={() => playableAudios[0] && setFocus(playableAudios[0])}>
            <Play className="mr-1.5 h-4 w-4 fill-current" /> Tocar tudo
          </Button>
          <ol className="divide-y divide-border/50">
            {audios.map((it, i) => (
              <li key={it.id} className={cn('flex items-center gap-1', it.is_frozen && 'opacity-60')}>
                <button type="button" onClick={() => openItem(it)} className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left active:bg-muted/40">
                  <span className="w-5 text-center text-xs text-muted-foreground">{i + 1}</span>
                  <span className="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-muted">
                    {it.thumb_url
                      ? <img src={it.thumb_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                      : <Music className="m-3 h-5 w-5 text-muted-foreground" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{it.title || 'Sem título'}</span>
                    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      {it.is_frozen ? frozenBadge : <>{fmt(it.view_count ?? 0)} reproduções</>}
                    </span>
                  </span>
                  <span className="text-[11px] text-muted-foreground">{fmtDuration(it.duration_sec)}</span>
                </button>
                {ownerMenu(it, 'h-8 w-8 bg-transparent border-0 shadow-none text-foreground hover:bg-muted')}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className={cn('grid gap-1.5', tab === 'links' || tab === 'links_adult' ? 'grid-cols-2' : 'grid-cols-3')}>
          {list.map((it) => {
            const vertical = it.kind === 'short_video' || it.kind === 'vip_teaser';
            const KindIcon = it.kind === 'link' ? Film : it.kind === 'meme' ? ImageIcon : Play;
            return (
              <div
                key={it.id}
                className={cn(
                  'relative overflow-hidden rounded-lg bg-muted',
                  vertical ? 'aspect-[9/16]' : it.kind === 'meme' ? 'aspect-square' : 'aspect-video',
                )}
              >
                <button type="button" onClick={() => openItem(it)} className="absolute inset-0 text-left">
                  {(it.thumb_url || (it.kind === 'meme' && it.media_url)) ? (
                    <img
                      src={(it.thumb_url || it.media_url) as string}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className={cn('h-full w-full object-cover', it.is_adult && tab !== 'links_adult' && 'blur-xl', it.is_frozen && 'opacity-50 grayscale')}
                    />
                  ) : (
                    <span className="grid h-full w-full place-items-center"><KindIcon className="h-6 w-6 text-muted-foreground" /></span>
                  )}
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 text-[10.5px] font-semibold text-white">
                    <span className="line-clamp-2">{it.title || it.caption || ''}</span>
                    <span className="mt-0.5 flex items-center gap-1 opacity-80"><Play className="h-3 w-3 fill-current" /> {fmt(it.view_count ?? 0)}</span>
                  </span>
                </button>
                <span className="pointer-events-none absolute left-1 top-1 flex flex-col items-start gap-1">
                  {it.is_adult && (
                    <span className="inline-flex items-center gap-0.5 rounded bg-red-600/90 px-1 text-[9px] font-bold text-white"><ShieldAlert className="h-2.5 w-2.5" />18</span>
                  )}
                  {it.is_frozen && frozenBadge}
                </span>
                {isOwner && <div className="absolute right-1 top-1 z-10">{ownerMenu(it, 'h-7 w-7')}</div>}
              </div>
            );
          })}
        </div>
      )}

      {focus && (
        <Suspense fallback={null}>
          <OcultoPlayFocusModal
            item={focus}
            open={!!focus}
            onClose={() => {
              if (focus.kind === 'audio') { try { pauseSharedAudio(focus.id); } catch { /* noop */ } }
              setFocus(null);
            }}
            onLike={(it) => actions.toggleLike.mutate(it.id)}
            onDislike={(it) => actions.toggleDislike.mutate(it.id)}
            onSave={(it) => actions.toggleSave.mutate(it.id)}
            onComment={(it) => setCommentsItem(it)}
            videoQueue={focus.is_frozen ? [focus] : videoQueue}
            onAudioEnded={(it) => moveAudio(it, 1)}
            onAudioNext={(it) => moveAudio(it, 1)}
            onAudioPrev={(it) => moveAudio(it, -1)}
          />
        </Suspense>
      )}
      {commentsItem && (
        <PlayCommentsSheet itemId={commentsItem.id} open={!!commentsItem} onClose={() => setCommentsItem(null)} />
      )}
      {isOwner && (
        <>
          <OcultoPlayEditModal
            item={editItem}
            open={!!editItem}
            onClose={() => {
              setEditItem(null);
              qc.invalidateQueries({ queryKey: PLAY_CHANNELS_KEY });
            }}
          />
          <OcultoPlayDeleteConfirmDialog
            open={!!deleteItem}
            onOpenChange={(o) => { if (!o && !deleting) setDeleteItem(null); }}
            onConfirm={confirmDelete}
            pending={deleting}
          />
        </>
      )}
    </>
  );
}
