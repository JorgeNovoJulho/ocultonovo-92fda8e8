/**
 * /meus-canais — central única de canais do usuário (substitui a entrada
 * "Meu Canal VIP" do menu, que antes só aparecia para quem era VIP).
 *
 *  - Canal de Vídeo  (grátis, 1 por perfil)  → criar / abrir / enviar
 *  - Canal de Áudio  (grátis, 1 por perfil)  → criar / abrir / enviar
 *  - Canal VIP       (assinatura paga)       → /canal-vip (plano VIP)
 */
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Clapperboard, Crown, Headphones, Loader2, Lock, Plus, Upload, ChevronRight, BadgeCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import {
  usePlayChannelBySlug,
  useMyPlayChannels,
  type PlayChannel,
  type PlayChannelKind,
} from '@/hooks/usePlayChannels';
import { CreateChannelDialog } from '@/components/oculto-play/channels/CreateChannelDialog';

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace('.0', '')} mil` : String(n));

export default function MyChannelsPage() {
  const { user, loading: authLoading } = useAuth();
  const { profile } = useProfile();
  const navigate = useNavigate();
  const { data: channels, isLoading, error } = useMyPlayChannels();
  const [createKind, setCreateKind] = useState<PlayChannelKind | null>(null);

  if (authLoading) {
    return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!user) return <Navigate to="/login" replace />;

  const list = channels ?? [];
  const isVip = (profile as any)?.plan_type === 'vip';
  const serverMissing = /does not exist|Could not find the function/i.test((error as { message?: string } | null)?.message ?? '');
  const own = (k: PlayChannelKind) => list.filter((c) => c.kind === k && !c.is_official);
  const official = list.filter((c) => c.is_official);

  return (
    <div className="container mx-auto max-w-2xl space-y-4 p-4 py-6 pb-24">
      <div>
        <h1 className="text-2xl font-extrabold">Meus Canais</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Crie seus canais no Oculto Play: um de <strong>vídeo</strong> e um de <strong>áudio</strong>, grátis.
          Vídeos e áudios ficam sempre separados.
        </p>
      </div>

      {serverMissing && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-4 text-sm">Os canais ainda não foram ativados no servidor. Tente novamente em instantes.</CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="grid place-items-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <ChannelSlot
            kind="video"
            channels={own('video')}
            onCreate={() => setCreateKind('video')}
          />
          <ChannelSlot
            kind="audio"
            channels={own('audio')}
            onCreate={() => setCreateKind('audio')}
          />

          {official.length > 0 && (
            <div className="space-y-2">
              <p className="px-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Canais oficiais (master)</p>
              {official.map((c) => <ChannelRow key={c.id} channel={c} />)}
            </div>
          )}
        </>
      )}

      {/* Canal VIP — assinatura paga (mesma função de antes) */}
      <Card className="border-[hsl(45,93%,47%)]/40 bg-gradient-to-br from-[hsl(45,93%,47%)]/10 to-transparent">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[hsl(45,93%,47%)]/15">
            <Crown className="h-6 w-6 text-[hsl(45,93%,47%)]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold">Canal VIP</p>
            <p className="text-xs leading-snug text-muted-foreground">
              Assinatura paga: planos mensais/anuais, capa, trailer e conteúdo exclusivo para assinantes.
            </p>
          </div>
          {isVip ? (
            <Button size="sm" onClick={() => navigate('/canal-vip')} className="shrink-0 bg-gradient-to-r from-[hsl(45,93%,47%)] to-[hsl(35,80%,40%)] font-semibold text-[hsl(45,93%,10%)]">
              Gerenciar
            </Button>
          ) : (
            <Button size="sm" variant="outline" asChild className="shrink-0">
              <Link to="/subscriptions?upgrade=vip"><Lock className="mr-1 h-3.5 w-3.5" /> Plano VIP</Link>
            </Button>
          )}
        </CardContent>
      </Card>

      <p className="px-1 text-[11px] leading-snug text-muted-foreground">
        Canais extras e ganhos com vídeos e áudios chegam junto com a monetização, para planos pagos e perfis verificados.
      </p>

      <CreateChannelDialog
        open={createKind !== null}
        onOpenChange={(v) => { if (!v) setCreateKind(null); }}
        defaultKind={createKind ?? 'video'}
        onCreated={(ch) => navigate(`/play/c/${ch.slug}`)}
      />
    </div>
  );
}

function ChannelSlot({ kind, channels, onCreate }: { kind: PlayChannelKind; channels: PlayChannel[]; onCreate: () => void }) {
  const Icon = kind === 'audio' ? Headphones : Clapperboard;
  const label = kind === 'audio' ? 'Canal de Áudio' : 'Canal de Vídeo';
  const hint = kind === 'audio' ? 'Músicas, podcasts e áudios' : 'Shorts, filmes, links e memes';

  if (channels.length > 0) {
    return <div className="space-y-2">{channels.map((c) => <ChannelRow key={c.id} channel={c} />)}</div>;
  }

  return (
    <button
      type="button"
      onClick={onCreate}
      className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-4 text-left transition hover:bg-primary/10 active:scale-[0.99]"
    >
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary/15">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-bold">Criar {label}</p>
        <p className="text-xs text-muted-foreground">{hint} · grátis</p>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">
        <Plus className="h-3.5 w-3.5" /> Criar
      </span>
    </button>
  );
}

function ChannelRow({ channel }: { channel: PlayChannel }) {
  const navigate = useNavigate();
  const { data: detail } = usePlayChannelBySlug(channel.slug);
  const Icon = channel.kind === 'audio' ? Headphones : Clapperboard;
  const avatar = channel.avatar_url || detail?.owner_avatar_url;
  const count = detail ? (channel.kind === 'audio' ? detail.audio_count : detail.items_total - detail.audio_count) : null;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <button type="button" onClick={() => navigate(`/play/c/${channel.slug}`)} className="flex w-full items-center gap-3 text-left">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-muted">
            {avatar
              ? <img src={avatar} alt="" className="h-full w-full object-cover" />
              : <span className="grid h-full w-full place-items-center text-lg font-extrabold">{channel.name.slice(0, 1).toUpperCase()}</span>}
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 font-bold">
              <span className="truncate">{channel.name}</span>
              {channel.is_official && <BadgeCheck className="h-4 w-4 shrink-0 text-primary" />}
            </p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Icon className="h-3.5 w-3.5" />
              {channel.kind === 'audio' ? 'Canal de áudio' : 'Canal de vídeo'}
              {count !== null && <> · {fmt(count)} {channel.kind === 'audio' ? 'faixas' : 'publicações'}</>}
              {detail && <> · {fmt(Number(detail.views_total))} views</>}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">/play/c/{channel.slug}</p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        </button>
        <div className={cn('grid grid-cols-2 gap-2')}>
          <Button size="sm" onClick={() => navigate(`/oculto-play?upload=1&channel=${channel.id}`)}>
            <Upload className="mr-1.5 h-4 w-4" /> Enviar
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate(`/play/c/${channel.slug}`)}>
            Abrir canal
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
