/**
 * Página pública de convite — /comunidades/invite/:code
 *
 * Visitantes (mesmo sem login) podem ver capa, tema, descrição e tópicos
 * recentes em modo leitura. Qualquer interação exige criar conta.
 *
 * Fluxo:
 * - GET community_invite_preview(code) — SECURITY DEFINER, aberta a anon.
 * - Sem login → CTAs "Criar conta" e "Entrar" (preservam o code via redirect).
 * - Com login → botão "Aceitar convite e entrar na comunidade".
 */
import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  Link2, Loader2, AlertCircle, Users, MessageCircle, Pin,
  Lock, ShieldCheck, ArrowRight, LogIn, UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { buildSupabaseImageThumb } from '@/lib/imageTransform';
import { useAcceptInvite } from '@/hooks/useCommunities';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from 'sonner';

interface PreviewTopic {
  id: string;
  title: string;
  body_preview: string | null;
  is_pinned: boolean;
  replies_count: number;
  reactions_count: number;
  created_at: string;
}

interface PreviewData {
  ok: boolean;
  error?: string;
  community?: {
    id: string;
    title: string;
    slug: string;
    description: string | null;
    cover_url: string | null;
    avatar_url: string | null;
    visibility: string;
    is_adult: boolean;
    members_count: number;
    topics_count: number;
    last_activity_at: string | null;
    rules: string | null;
  };
  topics?: PreviewTopic[];
  invite?: { code: string; expires_at: string | null; max_uses: number | null; uses_count: number };
}

const ERR_LABEL: Record<string, string> = {
  invite_not_found: 'Convite inválido ou revogado.',
  invite_revoked: 'Este convite foi revogado.',
  invite_expired: 'Este convite expirou.',
  invite_exhausted: 'Este convite atingiu o limite de usos.',
  community_unavailable: 'Esta comunidade não está disponível.',
};

export default function CommunityInvitePage() {
  const { code } = useParams<{ code: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const accept = useAcceptInvite();

  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);

  // Preserva o code no redirect de auth
  const authRedirect = useMemo(() => {
    const target = `/comunidades/invite/${code ?? ''}`;
    return encodeURIComponent(target);
  }, [code]);

  // Carrega preview público (não exige login)
  useEffect(() => {
    let cancelled = false;
    if (!code) return;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await (supabase as any).rpc('community_invite_preview', { _code: code });
        if (cancelled) return;
        if (error) {
          setPreview({ ok: false, error: 'invite_not_found' });
        } else {
          setPreview(data as PreviewData);
        }
      } catch {
        if (!cancelled) setPreview({ ok: false, error: 'invite_not_found' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  const handleAccept = () => {
    if (!code) return;
    accept.mutate(code, {
      onSuccess: (res) => {
        toast.success('Bem-vindo(a) à comunidade!');
        if (res?.slug) navigate(`/comunidades/${res.slug}`, { replace: true });
        else navigate('/comunidades', { replace: true });
      },
      onError: (e: any) => {
        const m = String(e?.message || '');
        const key = Object.keys(ERR_LABEL).find((k) => m.includes(k));
        toast.error(key ? ERR_LABEL[key] : 'Não foi possível usar este convite.');
      },
    });
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <Loader2 className="h-8 w-8 mx-auto animate-spin text-fuchsia-400 mb-2" />
        <p className="text-sm text-muted-foreground">Carregando convite…</p>
      </div>
    );
  }

  if (!preview?.ok || !preview.community) {
    const msg = ERR_LABEL[preview?.error ?? ''] ?? 'Convite inválido ou indisponível.';
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <AlertCircle className="h-10 w-10 mx-auto text-rose-400 mb-3" />
        <h1 className="text-base font-semibold mb-1">{msg}</h1>
        <Button variant="outline" className="mt-3" onClick={() => navigate('/comunidades')}>
          Ver comunidades
        </Button>
      </div>
    );
  }

  const c = preview.community;
  const topics = preview.topics ?? [];
  const isPrivate = c.visibility !== 'public';

  return (
    <div className="min-h-dvh bg-background pb-24">
      {/* CAPA */}
      <div className="relative w-full h-48 sm:h-64 bg-gradient-to-br from-fuchsia-900/40 via-purple-900/30 to-slate-900 overflow-hidden">
        {c.cover_url && (
          <img
            src={c.cover_url}
            alt={c.title}
            className="absolute inset-0 w-full h-full object-cover opacity-70"
            loading="eager"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
      </div>

      <div className="max-w-3xl mx-auto px-4 -mt-12 sm:-mt-16 relative">
        {/* CABEÇALHO */}
        <div className="flex items-end gap-4 mb-4">
          <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-2xl border-4 border-background bg-slate-800 overflow-hidden shrink-0 shadow-xl">
            {c.avatar_url ? (
              <img src={buildSupabaseImageThumb(c.avatar_url, { width: 192, quality: 75 }) ?? c.avatar_url} alt={c.title} className="w-full h-full object-cover" loading="eager" decoding="async" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-fuchsia-300">
                {c.title.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="pb-2 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Link2 className="h-4 w-4 text-fuchsia-400" />
              <span className="text-xs text-fuchsia-300 font-medium uppercase tracking-wide">Convite</span>
              {isPrivate && (
                <Badge variant="outline" className="border-amber-500/40 text-amber-300 text-[10px]">
                  <Lock className="h-3 w-3 mr-1" /> Privada
                </Badge>
              )}
              {c.is_adult && (
                <Badge variant="outline" className="border-rose-500/40 text-rose-300 text-[10px]">
                  +18
                </Badge>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold leading-tight truncate">{c.title}</h1>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" /> {c.members_count} membros
              </span>
              <span className="inline-flex items-center gap-1">
                <MessageCircle className="h-3.5 w-3.5" /> {c.topics_count} tópicos
              </span>
            </div>
          </div>
        </div>

        {/* DESCRIÇÃO / TEMA */}
        {c.description && (
          <p className="text-sm sm:text-base text-foreground/85 mb-5 whitespace-pre-line">
            {c.description}
          </p>
        )}

        {/* CTA — TOPO */}
        <InviteCta user={user} accept={accept} authRedirect={authRedirect} onAccept={handleAccept} />

        {/* TÓPICOS RECENTES — MODO LEITURA */}
        <section className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Tópicos recentes
            </h2>
            <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" /> modo leitura
            </span>
          </div>

          {topics.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8 border border-dashed border-border rounded-xl">
              Nenhum tópico publicado ainda.
            </div>
          ) : (
            <ul className="space-y-3">
              {topics.map((t) => (
                <li
                  key={t.id}
                  className="rounded-xl border border-border bg-card/50 p-4 hover:bg-card/80 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    {t.is_pinned && <Pin className="h-3.5 w-3.5 text-fuchsia-400 shrink-0 mt-1" />}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-sm sm:text-base leading-snug mb-1">
                        {t.title}
                      </h3>
                      {t.body_preview && (
                        <p className="text-xs sm:text-sm text-muted-foreground line-clamp-3">
                          {t.body_preview}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                        <span>{t.replies_count} respostas</span>
                        <span>{t.reactions_count} reações</span>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Aviso de gate */}
          {!user?.id && (
            <div className="mt-4 text-center text-xs text-muted-foreground">
              Crie sua conta para abrir tópicos, responder e reagir.
            </div>
          )}
        </section>

        {/* CTA — RODAPÉ */}
        <div className="mt-8">
          <InviteCta user={user} accept={accept} authRedirect={authRedirect} onAccept={handleAccept} />
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* CTA reutilizável: muda conforme estado de auth.                  */
/* ---------------------------------------------------------------- */
function InviteCta({
  user,
  accept,
  authRedirect,
  onAccept,
}: {
  user: { id?: string } | null;
  accept: ReturnType<typeof useAcceptInvite>;
  authRedirect: string;
  onAccept: () => void;
}) {
  if (user?.id) {
    return (
      <Button
        size="lg"
        className="w-full bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500"
        disabled={accept.isPending}
        onClick={onAccept}
      >
        {accept.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
        ) : (
          <ArrowRight className="h-4 w-4 mr-2" />
        )}
        Aceitar convite e entrar
      </Button>
    );
  }

  return (
    <div className="rounded-2xl border border-fuchsia-500/30 bg-fuchsia-500/5 p-4 sm:p-5">
      <p className="text-sm sm:text-base font-semibold mb-1">
        Você está vendo o modo leitura.
      </p>
      <p className="text-xs sm:text-sm text-muted-foreground mb-4">
        Para participar — responder, reagir, abrir tópicos — crie sua conta. É grátis.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Button
          asChild
          size="lg"
          className="bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500"
        >
          <Link to={`/signup?redirect=${authRedirect}`}>
            <UserPlus className="h-4 w-4 mr-2" /> Criar conta grátis
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link to={`/login?redirect=${authRedirect}`}>
            <LogIn className="h-4 w-4 mr-2" /> Já tenho conta
          </Link>
        </Button>
      </div>
    </div>
  );
}
