// Social tags (general interests)
export const SOCIAL_TAGS = [
  'Rock', 'Futebol', 'Filmes de Terror', 'Academia', 'Viagens',
  'Gastronomia', 'Games', 'Anime', 'Cerveja Artesanal', 'Vinho',
  'Praia', 'Acampar', 'Fotografia', 'Tatuagem', 'Signos',
  'Café', 'Séries', 'Literatura', 'Yoga', 'Pet Friendly',
  'Festas', 'Poker', 'Skate', 'Meditação', 'Trilhas',
  'Tecnologia', 'Dança', 'Podcast', 'Idiomas', 'Pintura',
] as const;

// Adult tags (+18 interests)
export const ADULT_TAGS = [
  'Anal', 'DP (Dupla)', 'Sadomasoquismo', 'Oral', 'Bi Feminino',
  'Bi Masculino', 'Menage', 'Menage Masculino', 'Menage Feminino',
  'Gang Bang', 'Gozo Facial', 'Cuckold',
  'BDSM', 'Dominação', 'Submissão', 'Fetiche por Pés', 'Roleplay',
  'Voyeurismo', 'Exibicionismo', 'Squirt', 'Deepthroat', 'Bondage',
  'Swing', 'Golden Shower', 'Spanking', 'Pegging', 'Creampie',
  'Milf/Dilf', 'Massagem Erótica', 'Fantasias', 'Brinquedos', 'Orgia',
  'Trans', 'Cross', 'Gay', '2 Homens', '2 Mulheres',
  'Hot Wife', 'BBW', 'Negros', 'Brancos', 'Asiáticos', 'Novidades',
] as const;

export type SocialTag = typeof SOCIAL_TAGS[number];
export type AdultTag = typeof ADULT_TAGS[number];

// Emoji mappings for visual appeal
export const SOCIAL_TAG_ICONS: Record<string, string> = {
  'Rock': '🎸', 'Futebol': '⚽', 'Filmes de Terror': '🎃', 'Academia': '💪',
  'Viagens': '✈️', 'Gastronomia': '🍽️', 'Games': '🎮', 'Anime': '🌸',
  'Cerveja Artesanal': '🍺', 'Vinho': '🍷', 'Praia': '🏖️', 'Acampar': '⛺',
  'Fotografia': '📷', 'Tatuagem': '🖋️', 'Signos': '♈', 'Café': '☕',
  'Séries': '📺', 'Literatura': '📚', 'Yoga': '🧘', 'Pet Friendly': '🐾',
  'Festas': '🎉', 'Poker': '♠️', 'Skate': '🛹', 'Meditação': '🕯️',
  'Trilhas': '🥾', 'Tecnologia': '💻', 'Dança': '💃', 'Podcast': '🎙️',
  'Idiomas': '🌍', 'Pintura': '🎨',
};

export const ADULT_TAG_ICONS: Record<string, string> = {
  'Anal': '🔥', 'DP (Dupla)': '🔥', 'Sadomasoquismo': '⛓️', 'Oral': '💋',
  'Bi Feminino': '🌈', 'Bi Masculino': '🌈', 'Menage': '👥',
  'Menage Masculino': '👥', 'Menage Feminino': '👥',
  'Gang Bang': '🔞', 'Gozo Facial': '💦', 'Cuckold': '👀',
  'BDSM': '⛓️', 'Dominação': '👑', 'Submissão': '🔒',
  'Fetiche por Pés': '🦶', 'Roleplay': '🎭', 'Voyeurismo': '👁️',
  'Exibicionismo': '✨', 'Squirt': '💦', 'Deepthroat': '💋', 'Bondage': '🪢',
  'Swing': '🔄', 'Golden Shower': '🌧️', 'Spanking': '🖐️', 'Pegging': '🔥',
  'Creampie': '💦', 'Milf/Dilf': '💎', 'Massagem Erótica': '💆', 'Fantasias': '🎭',
  'Brinquedos': '🧸', 'Orgia': '🔞',
  'Trans': '🏳️‍⚧️', 'Cross': '👗', 'Gay': '🌈', '2 Homens': '👬', '2 Mulheres': '👭',
  'Hot Wife': '🔥', 'BBW': '💖', 'Negros': '🖤', 'Brancos': '🤍', 'Asiáticos': '🌸',
  'Novidades': '🆕',
};

// Calculate compatibility client-side (for immediate display without RPC)
export function calculateCompatibility(
  aSocial: string[],
  aAdult: string[],
  bSocial: string[],
  bAdult: string[]
): { totalPct: number; socialPct: number; adultPct: number; hasAdultMatch: boolean; socialCommon: string[]; adultCommon: string[] } {
  const socialCommon = aSocial.filter(t => bSocial.includes(t));
  const adultCommon = aAdult.filter(t => bAdult.includes(t));

  const socialMax = Math.max(aSocial.length, bSocial.length, 1);
  const adultMax = Math.max(aAdult.length, bAdult.length, 1);

  const socialPct = (socialCommon.length / socialMax) * 100;
  const adultPct = (adultCommon.length / adultMax) * 100;
  const hasAdultMatch = adultCommon.length > 0;

  const totalPct = socialPct * 0.4 + adultPct * 0.6;

  return {
    totalPct: Math.round(totalPct),
    socialPct: Math.round(socialPct),
    adultPct: Math.round(adultPct),
    hasAdultMatch,
    socialCommon,
    adultCommon,
  };
}
