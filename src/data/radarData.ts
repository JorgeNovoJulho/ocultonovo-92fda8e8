import { Desire, Gender, ProfileType } from "@/store/useAuthStore";

export interface RadarUser {
  id: string;
  name: string;
  avatar: string;
  avatar2?: string;
  profileType: ProfileType;
  gender: Gender;
  partnerName1?: string;
  partnerName2?: string;
  desires: Desire[];
  isVerifiedCreator: boolean;
  isVerifiedCouple: boolean;
  isOnline: boolean;
  distance: number;
  age: number;
  bio: string;
  location: string;
}

export interface Event {
  id: string;
  title: string;
  description: string;
  location: string;
  date: string;
  time: string;
  image: string;
  attendees: number;
  maxAttendees?: number;
  price?: string;
  tags: string[];
}

// Desire labels for display
export const desireLabels: Record<Desire, string> = {
  menage: 'Ménage',
  voyeur: 'Voyeur',
  soft: 'Soft Swing',
  full: 'Full Swap',
  exibicionismo: 'Exibicionismo',
  fetiche: 'Fetiche',
  bdsm: 'BDSM',
  'role-play': 'Role Play',
};

// Gender labels for display
export const genderLabels: Record<Gender, string> = {
  homem: 'Homem',
  mulher: 'Mulher',
  casal: 'Casal',
  trans: 'Trans',
};
