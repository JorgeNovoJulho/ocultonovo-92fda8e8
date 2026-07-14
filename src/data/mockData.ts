// Tipos compartilhados de Creator/Post + rótulos de gênero.
// Arquivo mantido em /data/mockData por compatibilidade de imports legados.
// Arrays de mock removidos (Fase 5 — limpeza). Não voltar a inserir dados fake aqui:
// dados de negócio vêm exclusivamente do Supabase externo (ver mem://tech-stack/zero-mock-data-policy).

import { Gender, ProfileType } from "@/store/useAuthStore";

export interface Creator {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  avatar2?: string;
  banner: string;
  bio: string;
  isVerified: boolean;
  followers: number;
  following: number;
  posts: number;
  views: number;
  recommendations: number;
  profileType: ProfileType;
  gender: Gender;
  location: string;
  isOnline: boolean;
  lastSeen?: string;
  interests: string[];
  joinDate: string;
}

export interface Post {
  id: string;
  creator: Creator;
  type: 'text' | 'image' | 'video' | 'link';
  content: string;
  mediaUrl?: string;
  /** true = mídia marcada como +18; false/null/undefined = sem blur adulto por fallback seguro. */
  is_adult?: boolean | null;
  linkPreview?: {
    title: string;
    description: string;
    image: string;
    url: string;
  };
  likes: number;
  comments: number;
  shares: number;
  isLiked: boolean;
  createdAt: string;
}

// Rótulos estáticos de gênero (config, não mock data).
export const genderIcons: Record<string, string> = {
  homem: '👨',
  mulher: '👩',
  casal: '👫',
  trans: '🏳️‍⚧️',
};

export const genderLabels: Record<string, string> = {
  homem: 'Homem',
  mulher: 'Mulher',
  casal: 'Casal',
  trans: 'Trans',
};
