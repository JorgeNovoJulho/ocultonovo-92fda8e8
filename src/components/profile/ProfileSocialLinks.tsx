import { Instagram, Send, Music2, Twitter, Youtube, MessageCircle, Globe, Heart, Lock } from "lucide-react";

export type SocialLinksMap = Partial<Record<
  "instagram" | "telegram" | "tiktok" | "twitter" | "youtube" | "whatsapp" | "onlyfans" | "privacy" | "website",
  string
>>;

type Platform = {
  key: keyof SocialLinksMap;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  /** classes do botão: gradiente da marca */
  className: string;
  /** monta a URL pública a partir do handle/valor salvo */
  toUrl: (value: string) => string;
};

const sanitizeHandle = (v: string) => v.trim().replace(/^@+/, "").replace(/^https?:\/\/(www\.)?[^/]+\//i, "");
const sanitizePhone = (v: string) => v.replace(/\D+/g, "");

const PLATFORMS: Platform[] = [
  {
    key: "instagram",
    label: "Instagram",
    Icon: Instagram,
    className: "bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af] text-white hover:opacity-90",
    toUrl: (v) => `https://instagram.com/${sanitizeHandle(v)}`,
  },
  {
    key: "telegram",
    label: "Telegram",
    Icon: Send,
    className: "bg-[#229ED9] text-white hover:bg-[#1d8bbf]",
    toUrl: (v) => `https://t.me/${sanitizeHandle(v)}`,
  },
  {
    key: "tiktok",
    label: "TikTok",
    Icon: Music2,
    className: "bg-black text-white hover:bg-neutral-800 border border-white/10",
    toUrl: (v) => `https://tiktok.com/@${sanitizeHandle(v)}`,
  },
  {
    key: "twitter",
    label: "X / Twitter",
    Icon: Twitter,
    className: "bg-black text-white hover:bg-neutral-800 border border-white/10",
    toUrl: (v) => `https://x.com/${sanitizeHandle(v)}`,
  },
  {
    key: "youtube",
    label: "YouTube",
    Icon: Youtube,
    className: "bg-[#FF0000] text-white hover:bg-[#cc0000]",
    toUrl: (v) => {
      const h = sanitizeHandle(v);
      return `https://youtube.com/${h.startsWith("@") || h.startsWith("c/") || h.startsWith("channel/") ? h : "@" + h}`;
    },
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    Icon: MessageCircle,
    className: "bg-[#25D366] text-white hover:bg-[#1ebe57]",
    toUrl: (v) => `https://wa.me/${sanitizePhone(v)}`,
  },
  {
    key: "onlyfans",
    label: "OnlyFans",
    Icon: Heart,
    className: "bg-[#00AFF0] text-white hover:bg-[#008fc4]",
    toUrl: (v) => `https://onlyfans.com/${sanitizeHandle(v)}`,
  },
  {
    key: "privacy",
    label: "Privacy",
    Icon: Lock,
    className: "bg-gradient-to-br from-[#ffb800] to-[#ff7a00] text-black hover:opacity-90",
    toUrl: (v) => `https://privacy.com.br/profile/${sanitizeHandle(v)}`,
  },
  {
    key: "website",
    label: "Site",
    Icon: Globe,
    className: "bg-gradient-to-br from-primary to-secondary text-primary-foreground hover:opacity-90",
    toUrl: (v) => {
      const t = v.trim();
      return /^https?:\/\//i.test(t) ? t : `https://${t}`;
    },
  },
];

interface ProfileSocialLinksProps {
  links?: SocialLinksMap | null;
  size?: "sm" | "md";
  className?: string;
}

export function ProfileSocialLinks({ links, size = "md", className = "" }: ProfileSocialLinksProps) {
  if (!links) return null;
  const active = PLATFORMS.filter((p) => {
    const v = links[p.key];
    return typeof v === "string" && v.trim().length > 0;
  });
  if (active.length === 0) return null;

  const sizeCls = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const iconCls = size === "sm" ? "h-4 w-4" : "h-5 w-5";

  return (
    <div className={`flex flex-wrap items-center justify-center gap-2 ${className}`}>
      {active.map(({ key, label, Icon, className: btnCls, toUrl }) => {
        const value = (links[key] as string).trim();
        const url = toUrl(value);
        return (
          <a
            key={key}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            title={label}
            className={`inline-flex items-center justify-center rounded-full shadow-md transition-transform active:scale-95 hover:scale-110 ${sizeCls} ${btnCls}`}
          >
            <Icon className={iconCls} />
          </a>
        );
      })}
    </div>
  );
}

export const SOCIAL_PLATFORMS_META: Array<{
  key: keyof SocialLinksMap;
  label: string;
  placeholder: string;
  helper?: string;
}> = [
  { key: "instagram", label: "Instagram", placeholder: "seu_usuario", helper: "Apenas o @ ou usuário" },
  { key: "telegram", label: "Telegram", placeholder: "seu_usuario", helper: "Usuário público do Telegram" },
  { key: "tiktok", label: "TikTok", placeholder: "seu_usuario" },
  { key: "twitter", label: "X / Twitter", placeholder: "seu_usuario" },
  { key: "youtube", label: "YouTube", placeholder: "@seu_canal" },
  { key: "whatsapp", label: "WhatsApp", placeholder: "5511999999999", helper: "DDI + DDD + número, só dígitos" },
  { key: "onlyfans", label: "OnlyFans", placeholder: "seu_usuario" },
  { key: "privacy", label: "Privacy", placeholder: "seu_usuario" },
  { key: "website", label: "Site / Link próprio", placeholder: "https://seusite.com" },
];
