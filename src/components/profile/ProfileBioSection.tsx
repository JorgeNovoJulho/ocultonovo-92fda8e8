import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, Link2, Zap, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useProfile } from "@/hooks/useProfile";
import { Link } from "react-router-dom";
import { ProfileSocialLinks, type SocialLinksMap } from "./ProfileSocialLinks";
import { calculateCompatibility } from "@/data/tagsData";

interface ProfileBioSectionProps {
  bio: string;
  maxLength?: number;
  tagsSocial?: string[];
  tagsAdult?: string[];
  connectionMode?: boolean;
  viewerConnectionMode?: boolean; // Visitor's connection mode
  isOwnProfile?: boolean;
  socialLinks?: SocialLinksMap | null;
  viewerTagsSocial?: string[];
  viewerTagsAdult?: string[];
}

// Parse @mentions in text
function parseMentions(text: string): React.ReactNode[] {
  const parts = text.split(/(@\w+)/g);
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      const username = part.slice(1);
      return (
        <Link
          key={i}
          to={`/creator/${username}`}
          className="text-primary hover:underline font-medium"
        >
          {part}
        </Link>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function ProfileBioSection({
  bio,
  maxLength = 120,
  tagsSocial = [],
  tagsAdult = [],
  connectionMode = true,
  viewerConnectionMode = true,
  isOwnProfile = false,
  socialLinks = null,
  viewerTagsSocial = [],
  viewerTagsAdult = [],
}: ProfileBioSectionProps) {
  const [expanded, setExpanded] = useState(false);

  const hasBio = !!bio && bio.trim().length > 0;
  const needsExpansion = hasBio && bio.length > maxLength;
  const displayBio = expanded ? bio : bio.slice(0, maxLength);
  const bioContent = useMemo(() => parseMentions(displayBio), [displayBio]);

  // Tags de interesses ficam SEMPRE visíveis (públicas) — independente do Modo Conexão.
  const showSocialTags = tagsSocial.length > 0;
  const showAdultTags = tagsAdult.length > 0;

  // Afinidade: usa a MESMA fórmula do Aura Match, Sugestões e Salas
  // (calculateCompatibility) — social 40% + adult 60%, normalizado pelo
  // maior conjunto de cada categoria.
  // Chaves serializadas garantem recálculo automático quando as tags do
  // perfil visitado OU do logado mudarem (edição/recarga).
  const norm = (s: string) => s.trim().toLowerCase();
  const mineSocial = useMemo(
    () => (viewerTagsSocial || []).map(norm).filter(Boolean),
    [JSON.stringify(viewerTagsSocial || [])],
  );
  const mineAdult = useMemo(
    () => (viewerTagsAdult || []).map(norm).filter(Boolean),
    [JSON.stringify(viewerTagsAdult || [])],
  );
  const theirSocial = useMemo(
    () => (tagsSocial || []).map(norm).filter(Boolean),
    [JSON.stringify(tagsSocial || [])],
  );
  const theirAdult = useMemo(
    () => (tagsAdult || []).map(norm).filter(Boolean),
    [JSON.stringify(tagsAdult || [])],
  );

  const affinity = useMemo(() => {
    if (isOwnProfile) return null;
    const mineTotal = mineSocial.length + mineAdult.length;
    const theirTotal = theirSocial.length + theirAdult.length;
    // Fallback neutro: se algum dos lados não tem tags, não dá pra calcular
    // afinidade — devolve estado "neutro" sem porcentagem fictícia.
    if (mineTotal === 0 || theirTotal === 0) {
      return { neutral: true as const, reason: mineTotal === 0 ? "self" : "other" };
    }
    const comp = calculateCompatibility(mineSocial, mineAdult, theirSocial, theirAdult);
    const shared = comp.socialCommon.length + comp.adultCommon.length;
    return { neutral: false as const, pct: comp.totalPct, shared };
  }, [isOwnProfile, mineSocial, mineAdult, theirSocial, theirAdult]);


  return (
    <div className="w-full max-w-xl mx-auto space-y-4 text-center">

      {/* Bio Text — só renderiza quando há bio */}
      {hasBio && (
        <div className="mx-auto max-w-md">
          <p className="text-foreground/85 text-sm leading-relaxed whitespace-pre-wrap text-center">
            {bioContent}
            {needsExpansion && !expanded && '…'}
          </p>

          {needsExpansion && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-primary text-xs font-medium mt-1 flex items-center gap-1 mx-auto hover:underline"
            >
              {expanded ? (
                <>Ver menos <ChevronUp className="h-3 w-3" /></>
              ) : (
                <>Ver mais <ChevronDown className="h-3 w-3" /></>
              )}
            </button>
          )}
          {isOwnProfile && (
            <p className="text-[10px] text-muted-foreground mt-1">
              {bio.length}/5.000 caracteres
            </p>
          )}
        </div>
      )}


      {/* Social Links (Instagram, Telegram, TikTok, etc.) */}
      <ProfileSocialLinks links={socialLinks} />

      {/* Tags Section */}
      {(showSocialTags || showAdultTags) && (
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-2">
            <p className="text-[11px] font-semibold text-foreground/90 uppercase tracking-[0.18em]">
              Tags
            </p>
            {affinity && !affinity.neutral && (
              <Badge
                variant="secondary"
                className="bg-gradient-to-r from-primary/20 to-secondary/20 text-foreground text-[10px] px-2 py-0.5 border border-primary/30"
                title={`${affinity.shared} tag(s) em comum`}
              >
                <Sparkles className="h-2.5 w-2.5 mr-1 text-primary" />
                {affinity.pct}% afinidade
              </Badge>
            )}
            {affinity && affinity.neutral && (
              <Badge
                variant="secondary"
                className="bg-muted/40 text-muted-foreground text-[10px] px-2 py-0.5 border border-border"
                title={
                  affinity.reason === "self"
                    ? "Adicione tags ao seu perfil para calcular afinidade"
                    : "Este perfil ainda não cadastrou tags"
                }
              >
                <Sparkles className="h-2.5 w-2.5 mr-1 opacity-60" />
                Afinidade indisponível
              </Badge>
            )}
          </div>

          {/* Social Tags */}
          {showSocialTags && (
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1">
                <Link2 className="h-3 w-3" />
                Interesses Sociais
              </p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {tagsSocial.map((tag) => {
                  const isShared = !isOwnProfile && (viewerTagsSocial || []).some(
                    (t) => t.trim().toLowerCase() === tag.trim().toLowerCase()
                  );
                  return (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className={
                        isShared
                          ? "bg-primary/25 text-primary text-[10px] px-2 border border-primary/40"
                          : "bg-primary/10 text-primary text-[10px] px-2"
                      }
                    >
                      {tag}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}

          {/* Adult Tags */}
          {showAdultTags && (
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1">
                <Zap className="h-3 w-3 text-secondary" />
                Interesses +18
              </p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {tagsAdult.map((tag) => {
                  const isShared = !isOwnProfile && (viewerTagsAdult || []).some(
                    (t) => t.trim().toLowerCase() === tag.trim().toLowerCase()
                  );
                  return (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className={
                        isShared
                          ? "bg-secondary/25 text-secondary text-[10px] px-2 border border-secondary/40"
                          : "bg-secondary/10 text-secondary text-[10px] px-2"
                      }
                    >
                      {tag}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
