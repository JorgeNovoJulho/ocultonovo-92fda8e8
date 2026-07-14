/**
 * Mapeamento canônico de cada Seção Oculta para uma entrada de menu
 * (rota + ícone + cor de destaque). Reutilizado pela página Sessões Ocultas
 * e pelos atalhos dinâmicos do menu lateral / drawer mobile.
 */
import {
  Sparkles, BookOpen, Heart, Compass, Share2, Crown, DoorOpen,
  Calendar, Search, Gavel, MessageCircle, Gift, Radio, Activity,
  Lightbulb, Megaphone, Users, UserPlus, LucideIcon,
} from "lucide-react";
import type { HomeSectionKey } from "@/config/homeSections";

export interface SectionNavEntry {
  route: string;
  icon: LucideIcon;
  /** Classe Tailwind do ícone quando inativo (cor temática). */
  iconClass: string;
}

export const SECTION_NAV: Partial<Record<HomeSectionKey, SectionNavEntry>> = {
  smart_start:          { route: "/feed",                  icon: Sparkles,      iconClass: "text-amber-400" },
  stories:              { route: "/feed",                  icon: BookOpen,      iconClass: "text-pink-400" },
  active_matches:       { route: "/matches",               icon: Heart,         iconClass: "text-rose-400" },
  discover_universe:    { route: "/feed",                  icon: Compass,       iconClass: "text-cyan-400" },
  referral_link:        { route: "/indicacoes",            icon: Share2,        iconClass: "text-emerald-400" },
  vip_creators:         { route: "/vitrine-vip",           icon: Crown,         iconClass: "text-[hsl(45,93%,47%)]" },
  hidden_rooms:         { route: "/experiencias-ocultas",  icon: DoorOpen,      iconClass: "text-violet-400" },
  events:               { route: "/events",                icon: Calendar,      iconClass: "text-blue-400" },
  mysterious_discovery: { route: "/pesquisar",             icon: Search,        iconClass: "text-cyan-400" },
  auctions:             { route: "/auctions",              icon: Gavel,         iconClass: "text-orange-400" },
  right_chat:           { route: "/messages",              icon: MessageCircle, iconClass: "text-primary" },
  caixa_oculta:         { route: "/caixa-oculta/criador",  icon: Gift,          iconClass: "text-pink-500" },
  feed_vivo:            { route: "/feed",                  icon: Radio,         iconClass: "text-emerald-400" },
  presence_pulse:       { route: "/feed",                  icon: Activity,      iconClass: "text-teal-400" },
  micro_tips:           { route: "/feed",                  icon: Lightbulb,     iconClass: "text-yellow-400" },
  sponsored_ads:        { route: "/feed",                  icon: Megaphone,     iconClass: "text-fuchsia-400" },
  recent_matches:       { route: "/matches",               icon: Users,         iconClass: "text-rose-400" },
  new_members:          { route: "/pesquisar",             icon: UserPlus,      iconClass: "text-sky-400" },
};

/**
 * Seções que NÃO devem virar atalho no menu lateral mesmo quando ativas,
 * porque já possuem entrada fixa equivalente no sidebar / drawer.
 * (Evita duplicidade visual.)
 */
export const SECTION_NAV_HIDE_IN_SIDEBAR: ReadonlySet<HomeSectionKey> = new Set<HomeSectionKey>([
  "smart_start",        // já é parte do /feed
  "stories",            // já é parte do /feed
  "discover_universe",  // já é parte do /feed
  "feed_vivo",          // já é parte do /feed
  "presence_pulse",     // já é parte do /feed
  "micro_tips",         // já é parte do /feed
  "sponsored_ads",      // já é parte do /feed
  "active_matches",     // /matches já está no sidebar
  "recent_matches",     // /matches já está no sidebar
  "right_chat",         // /messages já está no sidebar
  "events",             // /events já está no sidebar (quando habilitado)
  "auctions",           // /auctions já está no sidebar (quando habilitado)
  "mysterious_discovery", // /pesquisar já está no sidebar
  "new_members",        // /pesquisar já está no sidebar
  "referral_link",      // /indicacoes já é acessível pelo menu
  "vip_creators",       // /vitrine-vip já é acessível
]);
