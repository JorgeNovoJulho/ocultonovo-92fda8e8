import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useValidateCreatorCode } from "@/hooks/useCreatorReferrals";
import { useAuth } from "@/hooks/useAuth";
import { Logo } from "@/components/Logo";
import { MadrinhaVipModal } from "@/components/MadrinhaVipModal";
import { useInviteCodeStore } from "@/store/useInviteCodeStore";
import { useInviteSettings, DEFAULT_INVITE_SETTINGS } from "@/hooks/useInviteSettings";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { buildCreatorInviteUrl, normalizeCreatorInviteCode } from "@/lib/inviteLinks";

import {
  CheckCircle2,
  ArrowRight,
  AlertCircle,
  Crown,
  MessageCircle,
  Radar,
  ShieldCheck,
  Coins,
  Copy,
  Share2,
} from "lucide-react";

const COOKIE_INVITE_REF = 'invite_ref_username'; // standard user referral (credita o usuário/indicador)
const COOKIE_CREATOR_REF = 'creator_referral_code';
const COOKIE_EXPIRY_DAYS = 30;

function setCookie(name: string, value: string, days: number) {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
}

export default function CreatorInvitePage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: madrinha, isLoading, error } = useValidateCreatorCode(code);
  const { data: settingsData } = useInviteSettings();
  const settings = settingsData || DEFAULT_INVITE_SETTINGS;
  const [cookieSet, setCookieSet] = useState(false);
  const [showVipModal, setShowVipModal] = useState(false);

  const setPersistedCode = useInviteCodeStore((s) => s.setCode);
  const resolvedInviteCode = madrinha?.creator_referral_code?.trim() || code?.trim() || "";

  useEffect(() => {
    // Credita o USUÁRIO indicador (lista de indicados + 5% via referred_by_creator_id),
    // NÃO o sistema de madrinha. Persistimos o profile.id do dono do link.
    if (madrinha?.id && !cookieSet) {
      setCookie(COOKIE_INVITE_REF, madrinha.id, COOKIE_EXPIRY_DAYS);
      const cleanInviteCode = normalizeCreatorInviteCode(resolvedInviteCode);
      if (cleanInviteCode) {
        setPersistedCode(cleanInviteCode);
        setCookie(COOKIE_CREATOR_REF, cleanInviteCode, COOKIE_EXPIRY_DAYS);
      }
      setCookieSet(true);
    }
  }, [madrinha, resolvedInviteCode, cookieSet, setPersistedCode]);

  const handleSignup = () => {
    // Leva para a landing page principal (preserva cookie de indicação já gravado acima)
    navigate('/');
  };

  const handleLogin = () => {
    navigate('/login');
  };


  if (isLoading) {
    return (
      <div className="min-h-dvh bg-gradient-to-br from-background via-background to-pink-950/20 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-card/80 backdrop-blur-sm border-border/50">
          <CardHeader className="text-center">
            <Skeleton className="h-28 w-28 rounded-full mx-auto mb-4" />
            <Skeleton className="h-6 w-48 mx-auto mb-2" />
            <Skeleton className="h-4 w-64 mx-auto" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!madrinha || error) {
    let attempted = code || '';
    try { attempted = decodeURIComponent(attempted); } catch { /* mantém */ }
    return (
      <div className="min-h-dvh bg-gradient-to-br from-background via-background to-red-950/20 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-card/80 backdrop-blur-sm border-border/50">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-4 rounded-full bg-red-500/10">
              <AlertCircle className="h-12 w-12 text-red-400" />
            </div>
            <h2 className="text-xl font-bold">Convite Inválido</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Este link de convite não é válido ou expirou.
            </p>
            {attempted && (
              <p className="text-xs text-muted-foreground/80 mt-2">
                Código tentado: <span className="font-mono">{attempted}</span>
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <Button className="w-full" onClick={() => navigate('/signup')}>
              Cadastrar sem Convite
            </Button>
            <Button variant="outline" className="w-full" onClick={() => navigate('/')}>
              Voltar para Início
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Privacidade: NUNCA exibir o nome real. Sempre usar @username.
  const madrinhaName = madrinha.username ? `@${madrinha.username}` : 'Anfitrião(ã)';


  const renderTemplate = (tpl: string, vars: Record<string, JSX.Element>) =>
    tpl.split(/(\{[a-z]+\})/g).map((part, i) => {
      const m = part.match(/^\{([a-z]+)\}$/);
      if (m && vars[m[1]]) return <span key={i}>{vars[m[1]]}</span>;
      return <span key={i}>{part}</span>;
    });

  const accent = settings.accent_color;
  const mainText = renderTemplate(settings.main_text_template, {
    name: <span className="font-bold" style={{ color: accent }}>{madrinhaName}</span>,
    platform: <span className="font-bold" style={{ color: accent }}>{settings.platform_name}</span>,
  });
  const footerNode = renderTemplate(settings.footer_text_template, {
    terms: <a href="/legal/terms" className="hover:underline" style={{ color: accent }}>Termos de Uso</a>,
    privacy: <a href="/legal/privacy" className="hover:underline" style={{ color: accent }}>Política de Privacidade</a>,
  });
  const normalizedInviteCode = resolvedInviteCode;
  const inviteUrl = buildCreatorInviteUrl(normalizedInviteCode) || "";
  const shareText = `${madrinhaName} te convidou para entrar no OCULTO.`;

  const handleCopyInvite = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success("Link copiado!");
    } catch {
      toast.error("Não foi possível copiar o link agora.");
    }
  };

  const handleShareInvite = async () => {
    if (!inviteUrl) return;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Convite de ${madrinhaName}`,
          text: shareText,
          url: inviteUrl,
        });
        return;
      } catch {
        /* fallback para cópia */
      }
    }

    try {
      await navigator.clipboard.writeText(`${shareText} ${inviteUrl}`);
      toast.success("Mensagem de convite copiada!");
    } catch {
      toast.error("Não foi possível compartilhar agora.");
    }
  };

  const pageBg = settings.background_image_url
    ? `url(${settings.background_image_url}) center/cover no-repeat`
    : `linear-gradient(135deg, ${settings.bg_gradient_from}, ${settings.bg_gradient_to})`;

  return (
    <div className="min-h-dvh flex items-start sm:items-center justify-center p-4 pb-80 sm:pb-4" style={{ background: pageBg }}>
      <div className="w-full max-w-md space-y-6">
        {settings.show_logo && (
          <div className="text-center">
            {settings.logo_override_url ? (
              <img loading="lazy" decoding="async" src={settings.logo_override_url} alt="Logo" className="mx-auto h-10 mb-2 object-contain" />
            ) : (
              <Logo className="mx-auto h-10 mb-2" />
            )}
          </div>
        )}

        <Card className="bg-card/80 backdrop-blur-sm border-border/50 overflow-hidden">
          {settings.show_crown_header && (
            <div className="h-20 bg-gradient-to-r from-pink-500/20 via-purple-500/20 to-pink-500/20 relative">
              <div className="absolute inset-0 flex items-center justify-center">
                <Crown className="h-8 w-8 animate-pulse" style={{ color: settings.crown_color }} />
              </div>
            </div>
          )}

          <CardHeader className={`text-center ${settings.show_crown_header ? '-mt-14' : ''} relative z-10 pb-2`}>
            {settings.show_avatar && (
              <Avatar
                className="h-28 w-28 mx-auto border-4 border-background shadow-xl ring-2"
                style={{ ['--tw-ring-color' as any]: `${accent}66` }}
              >
                <AvatarImage src={madrinha.avatar_url || ''} alt={madrinhaName} />
                <AvatarFallback className="bg-gradient-to-br from-pink-500 to-purple-500 text-white text-3xl font-bold">
                  {madrinhaName[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
            )}

            <div className="mt-3">
              <div className="flex items-center justify-center gap-2">
                <h2 className="text-xl font-bold">{madrinhaName}</h2>
                {madrinha.is_verified && <CheckCircle2 className="h-5 w-5 text-blue-500" />}
              </div>
            </div>

          </CardHeader>

          <CardContent className="space-y-5 pt-0">
            {settings.show_main_text && (
              <div
                className="p-4 rounded-xl border text-center"
                style={{ background: settings.badge_bg_color, borderColor: `${accent}33` }}
              >
                {settings.show_badge && (
                  <p className="text-base font-semibold mb-2" style={{ color: accent }}>
                    {settings.badge_emoji} {settings.badge_text}
                  </p>
                )}
                <p className="text-sm leading-relaxed text-foreground/90">{mainText}</p>
                {settings.show_subtext && (
                  <p className="text-sm mt-3 font-medium text-foreground/80">{settings.subtext}</p>
                )}
              </div>
            )}

            {settings.show_vip_discount && (
              <div
                className="p-3 rounded-lg border text-center"
                style={{ background: settings.vip_discount_bg_color, borderColor: `${settings.crown_color}55` }}
              >
                <p className="text-xs font-medium flex items-center justify-center gap-1" style={{ color: settings.crown_color }}>
                  <Crown className="h-3.5 w-3.5" />
                  {settings.vip_discount_text}
                </p>
              </div>
            )}

            {settings.show_qr_share && inviteUrl && (
              <div className="rounded-xl border border-border/60 bg-background/35 p-4">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-3 text-center">
                  {settings.share_section_title}
                </p>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[132px_minmax(0,1fr)] sm:gap-3">
                  <div className="mx-auto rounded-xl bg-white p-2.5 shadow-sm">
                    <QRCodeSVG value={inviteUrl} size={116} level="M" includeMargin={false} />
                  </div>

                  <div className="min-w-0 space-y-2">
                    <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/60 px-3 py-2.5">
                      <code className="min-w-0 flex-1 truncate text-left text-[10px] text-foreground/90 sm:text-[11px]">
                        {inviteUrl}
                      </code>
                      <button
                        type="button"
                        onClick={handleCopyInvite}
                        aria-label="Copiar link do convite"
                        className="shrink-0 rounded-md p-1 text-primary transition-colors hover:bg-primary/10"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Button type="button" variant="outline" className="h-10 w-full min-w-0 gap-1.5 px-3 text-[12px] sm:gap-2 sm:text-sm" onClick={handleCopyInvite}>
                        <Copy className="h-4 w-4 shrink-0" />
                        {settings.copy_button_text}
                      </Button>
                      <Button type="button" className="h-10 w-full min-w-0 gap-1.5 px-3 text-[12px] sm:gap-2 sm:text-sm" onClick={handleShareInvite}>
                        <Share2 className="h-4 w-4 shrink-0" />
                        {settings.share_button_text}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {(settings.show_platform_features ?? true) && (
              <div className="rounded-xl border border-border/50 bg-card/40 p-4">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-3 text-center">
                  O que te espera no OCULTO
                </p>
                <ul className="space-y-2.5">
                  <li className="flex items-start gap-3">
                    <div
                      className="shrink-0 mt-0.5 p-1.5 rounded-lg"
                      style={{ background: `${accent}1f` }}
                    >
                      <MessageCircle className="h-4 w-4" style={{ color: accent }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground/95">Salas Aura Match</p>
                      <p className="text-xs text-muted-foreground leading-snug">
                        Bate-papos temáticos em tempo real com pessoas afins ao seu estilo.
                      </p>
                    </div>
                  </li>

                  <li className="flex items-start gap-3">
                    <div
                      className="shrink-0 mt-0.5 p-1.5 rounded-lg"
                      style={{ background: `${accent}1f` }}
                    >
                      <Radar className="h-4 w-4" style={{ color: accent }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground/95">Radar de Proximidade</p>
                      <p className="text-xs text-muted-foreground leading-snug">
                        Descubra quem está por perto sem expor sua localização exata.
                      </p>
                    </div>
                  </li>

                  <li className="flex items-start gap-3">
                    <div
                      className="shrink-0 mt-0.5 p-1.5 rounded-lg"
                      style={{ background: `${accent}1f` }}
                    >
                      <ShieldCheck className="h-4 w-4" style={{ color: accent }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground/95">Privacidade Absoluta</p>
                      <p className="text-xs text-muted-foreground leading-snug">
                        Modo invisível, chat criptografado e controle total sobre quem te vê.
                      </p>
                    </div>
                  </li>

                  <li className="flex items-start gap-3">
                    <div
                      className="shrink-0 mt-0.5 p-1.5 rounded-lg"
                      style={{ background: `${settings.crown_color}26` }}
                    >
                      <Coins className="h-4 w-4" style={{ color: settings.crown_color }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground/95">Ganhe 5% de comissão</p>
                      <p className="text-xs text-muted-foreground leading-snug">
                        Divulgue o OCULTO para amigos(as) e receba 5% recorrente sobre tudo que eles assinarem.
                      </p>
                    </div>
                  </li>
                </ul>
              </div>
            )}

            {settings.show_signup_buttons && (
              user ? (
                <div className="space-y-3">
                  <Button
                    className="w-full bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white font-semibold"
                    onClick={() => setShowVipModal(true)}
                  >
                    <Crown className="h-4 w-4 mr-2" />
                    {settings.vip_subscribe_button_text}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Button
                    className="w-full bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white font-semibold"
                    onClick={handleSignup}
                  >
                    {settings.signup_button_text}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                  <Button variant="outline" className="w-full" onClick={handleLogin}>
                    {settings.login_button_text}
                  </Button>
                </div>
              )
            )}
          </CardContent>
        </Card>

        {settings.show_footer && (
          <p className="text-center text-xs text-muted-foreground">{footerNode}</p>
        )}
      </div>

      <MadrinhaVipModal
        open={showVipModal}
        onOpenChange={setShowVipModal}
        madrinhaName={madrinhaName}
        referralCode={code?.toUpperCase() || ''}
      />
    </div>
  );
}
