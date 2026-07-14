import { Crown } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { CachedImage } from "@/components/common/CachedImage";
import { resolveAvatarUrl } from "@/lib/avatarUrl";
import { normalizePublicStorageUrl } from "@/lib/storageUrl";
import { cn } from "@/lib/utils";

/**
 * ChannelBanner
 * Componente reutilizável para exibir a capa de um canal VIP com:
 *  - foto de capa (banner_url do canal) ou gradiente de fallback
 *  - badge VIP no topo direito
 *  - avatar circular sobre o banner
 *  - título do canal
 *  - @username do criador (NUNCA o nome real)
 *
 * Regra de privacidade: sempre exibe o @handle do dono do canal.
 * Se não houver handle, mostra "@usuario" como fallback genérico.
 */
export interface ChannelBannerProps {
  /** URL da foto de capa salva do canal (ex.: "Segredos de Canela") */
  bannerUrl?: string | null;
  /** URL do avatar do canal. Cai no bannerUrl se ausente. */
  avatarUrl?: string | null;
  /** Título do canal (ex.: "Segredos de Canela") */
  channelTitle: string;
  /** @username do criador. Deve começar com "@". Ex.: "@mulatacuriosa_ofc" */
  handle?: string | null;
  /** Mostrar a badge VIP no topo direito. Default: true */
  showVipBadge?: boolean;
  /** Altura do banner em classes Tailwind. Default: h-32 */
  heightClass?: string;
  className?: string;
}

export function ChannelBanner({
  bannerUrl,
  avatarUrl,
  channelTitle,
  handle,
  showVipBadge = true,
  heightClass = "h-32",
  className,
}: ChannelBannerProps) {
  const safeHandle = handle && handle.trim().length > 0 ? handle : "@usuario";
  const handleInitial = (safeHandle || channelTitle || "C")
    .replace(/^@/, "")
    .charAt(0)
    .toUpperCase();

  const normalizedBannerUrl =
    normalizePublicStorageUrl(bannerUrl, "banners") ||
    normalizePublicStorageUrl(bannerUrl, "avatars") ||
    null;

  const avatarSrc =
    resolveAvatarUrl(avatarUrl) ||
    normalizePublicStorageUrl(avatarUrl, "avatars") ||
    normalizedBannerUrl ||
    undefined;

  return (
    <div
      className={cn(
        "relative flex-shrink-0 overflow-hidden",
        heightClass,
        className
      )}
    >
      {normalizedBannerUrl ? (
        <CachedImage
          src={normalizedBannerUrl}
          alt={channelTitle}
          className="absolute inset-0 h-full w-full object-cover"
          wrapperClassName="absolute inset-0 bg-muted/40 animate-pulse"
          showPlaceholderIcon={false}
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(135deg, hsl(var(--primary)/0.3), hsl(var(--secondary)/0.3))",
          }}
        />
      )}

      {/* Overlay para contraste do texto */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/10" />

      {showVipBadge && (
        <div className="absolute top-2 right-2 z-10">
          <Badge className="text-[11px] font-bold bg-[hsl(45,93%,47%)] text-background border-0 rounded-full px-2.5 py-1 shadow-sm">
            <Crown className="h-3 w-3 mr-1" />
            VIP
          </Badge>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 z-10 p-3 flex items-end gap-3">
        <Avatar className="h-14 w-14 border-2 border-background/80 shadow-md shrink-0">
          {avatarSrc && <AvatarImage src={avatarSrc} alt={safeHandle} />}
          <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-primary-foreground text-base font-bold">
            {handleInitial || "C"}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 pb-0.5">
          <h3 className="font-bold text-white text-[15px] leading-tight truncate drop-shadow-sm">
            {channelTitle}
          </h3>
          <p className="text-sm text-white/85 truncate drop-shadow-sm">
            {safeHandle}
          </p>
        </div>
      </div>
    </div>
  );
}

export default ChannelBanner;
