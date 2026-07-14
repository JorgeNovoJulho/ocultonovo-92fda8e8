import {
  Sparkles, Users, Radar, MessageCircle, PlusCircle, Crown, Star,
  Banknote, Calendar, Gavel, Trophy, Flame, Heart, Eye, Lock, Gift,
  Camera, Music, Mic, Video, Bell, Compass, Zap, Shield,
  type LucideIcon,
} from 'lucide-react';

export const DISCOVERY_ICON_MAP: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  users: Users,
  radar: Radar,
  'message-circle': MessageCircle,
  'plus-circle': PlusCircle,
  crown: Crown,
  star: Star,
  banknote: Banknote,
  calendar: Calendar,
  gavel: Gavel,
  trophy: Trophy,
  flame: Flame,
  heart: Heart,
  eye: Eye,
  lock: Lock,
  gift: Gift,
  camera: Camera,
  music: Music,
  mic: Mic,
  video: Video,
  bell: Bell,
  compass: Compass,
  zap: Zap,
  shield: Shield,
};

export const DISCOVERY_ICON_NAMES = Object.keys(DISCOVERY_ICON_MAP);

export function getDiscoveryIcon(name?: string | null): LucideIcon {
  return DISCOVERY_ICON_MAP[name || ''] || Sparkles;
}
