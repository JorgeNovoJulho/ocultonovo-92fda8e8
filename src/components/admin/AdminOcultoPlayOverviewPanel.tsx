/**
 * AdminOcultoPlayOverviewPanel — Visão Geral (PROMPT 3 — Etapa 3)
 * Cards de status do OCULTO PLAY + alertas de visibilidade.
 */
import { useEffect, useState } from 'react';
import { Loader2, Eye, EyeOff, Users, Film, Image as ImageIcon, Music, MessageSquare, Flag, Bookmark, TrendingUp, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseExternal';
import { useOcultoPlayConfig } from '@/hooks/useOcultoPlayAccess';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type Counts = {
  total: number;
  videos: number;
  memes: number;
  audios: number;
  saved: number;
  comments: number;
  reports_pending: number;
  trending: number;
};

export function AdminOcultoPlayOverviewPanel() {
  const { data: cfg } = useOcultoPlayConfig();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [items, saves, comments, reports] = await Promise.all([
          supabase.from('oculto_play_items' as never).select('id, kind, is_featured', { count: 'exact' }).eq('is_published', true),
          supabase.from('oculto_play_saves' as never).select('id', { count: 'exact', head: true }),
          supabase.from('oculto_play_comments' as never).select('id', { count: 'exact', head: true }),
          supabase.from('oculto_play_reports' as never).select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        ]);
        const rows = (items.data ?? []) as Array<{ kind: string; is_featured?: boolean }>;
        setCounts({
          total: items.count ?? rows.length,
          videos: rows.filter(r => r.kind === 'short_video' || r.kind === 'vip_teaser').length,
          memes: rows.filter(r => r.kind === 'meme').length,
          audios: rows.filter(r => r.kind === 'audio').length,
          saved: saves.count ?? 0,
          comments: comments.count ?? 0,
          reports_pending: reports.count ?? 0,
          trending: rows.filter(r => !!r.is_featured).length,
        });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const publicOn = !!cfg?.enabled && !!cfg?.visible_to_users;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {publicOn ? (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="pt-5 flex gap-3 text-sm">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
            <div>
              <p className="font-medium">OCULTO PLAY está ATIVO para os usuários.</p>
              <p className="text-muted-foreground mt-0.5">Killswitch e visibilidade pública ligados.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-5 flex gap-3 text-sm">
            <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0" />
            <div>
              <p className="font-medium">OCULTO PLAY está visível apenas para <code>_@oculta_master</code>.</p>
              <p className="text-muted-foreground mt-0.5">Ative na aba "Config" → "Acesso global" quando estiver pronto para lançar.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <StatCard icon={<Eye className="h-4 w-4" />} label="Status público" value={publicOn ? 'ATIVO' : 'OCULTO'} highlight={publicOn ? 'success' : 'warn'} />
        <StatCard icon={<EyeOff className="h-4 w-4" />} label="Modo interno (Master)" value={cfg?.enabled ? 'ON' : 'OFF'} />
        <StatCard icon={<Film className="h-4 w-4" />} label="Conteúdos publicados" value={counts?.total ?? 0} />
        <StatCard icon={<Film className="h-4 w-4" />} label="Vídeos" value={counts?.videos ?? 0} />
        <StatCard icon={<ImageIcon className="h-4 w-4" />} label="Memes / Imagens" value={counts?.memes ?? 0} />
        <StatCard icon={<Music className="h-4 w-4" />} label="Áudios" value={counts?.audios ?? 0} />
        <StatCard icon={<Bookmark className="h-4 w-4" />} label="Conteúdos salvos" value={counts?.saved ?? 0} />
        <StatCard icon={<MessageSquare className="h-4 w-4" />} label="Comentários" value={counts?.comments ?? 0} />
        <StatCard icon={<Flag className="h-4 w-4" />} label="Denúncias pendentes" value={counts?.reports_pending ?? 0} highlight={(counts?.reports_pending ?? 0) > 0 ? 'warn' : undefined} />
        <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Em alta (featured)" value={counts?.trending ?? 0} />
        <StatCard icon={<Users className="h-4 w-4" />} label="Beta aberto" value={cfg?.beta_open ? 'SIM' : 'NÃO'} />
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string | number; highlight?: 'success' | 'warn' }) {
  const tone =
    highlight === 'success' ? 'border-emerald-500/30 bg-emerald-500/5' :
    highlight === 'warn'    ? 'border-amber-500/30 bg-amber-500/5' :
    '';
  return (
    <Card className={tone}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}<span>{label}</span></div>
        <p className="text-2xl font-bold mt-1">{typeof value === 'number' ? value.toLocaleString('pt-BR') : value}</p>
      </CardContent>
    </Card>
  );
}
