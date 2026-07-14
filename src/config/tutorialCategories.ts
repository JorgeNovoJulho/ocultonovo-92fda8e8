/**
 * Categorias de Tutoriais — cores casadas com os itens do menu lateral.
 * `key` é gravado em `oculto_tutorials.category`. "geral" é virtual:
 * exibida na UI mas nunca é salva — a guia Geral agrega tudo.
 */
export interface TutorialCategory {
  key: string;
  label: string;
  /** Tailwind classes para o tab/badge ativo. */
  color: string;
  /** Cor de borda/realce do card. */
  ring: string;
  /** Cor do texto/ícone. */
  text: string;
}

export const TUTORIAL_CATEGORIES: TutorialCategory[] = [
  { key: 'geral',            label: 'Geral',            color: 'bg-primary/15',    ring: 'ring-primary/40',    text: 'text-primary' },
  { key: 'feed',             label: 'Feed Principal',   color: 'bg-blue-500/15',   ring: 'ring-blue-400/40',   text: 'text-blue-400' },
  { key: 'perfil',           label: 'Meu Perfil',       color: 'bg-violet-500/15', ring: 'ring-violet-400/40', text: 'text-violet-400' },
  { key: 'canal_vip',        label: 'Meu Canal VIP',    color: 'bg-amber-500/15',  ring: 'ring-amber-400/40',  text: 'text-amber-400' },
  { key: 'oculto_play',      label: 'Oculto Play',      color: 'bg-orange-500/15', ring: 'ring-orange-400/40', text: 'text-orange-400' },
  { key: 'comunidades',      label: 'Comunidades',      color: 'bg-emerald-500/15',ring: 'ring-emerald-400/40',text: 'text-emerald-400' },
  { key: 'chat',             label: 'Chat',             color: 'bg-cyan-500/15',   ring: 'ring-cyan-400/40',   text: 'text-cyan-400' },
  { key: 'aura_ia',          label: 'Aura IA',          color: 'bg-fuchsia-500/15',ring: 'ring-fuchsia-400/40',text: 'text-fuchsia-400' },
  { key: 'aura_match',       label: 'Aura Match',       color: 'bg-pink-500/15',   ring: 'ring-pink-400/40',   text: 'text-pink-400' },
  { key: 'radar',            label: 'Radar',            color: 'bg-green-500/15',  ring: 'ring-green-400/40',  text: 'text-green-400' },
  { key: 'notepad',          label: 'Bloco de Notas',   color: 'bg-yellow-500/15', ring: 'ring-yellow-400/40', text: 'text-yellow-400' },
  { key: 'ranking',          label: 'Ranking',          color: 'bg-yellow-600/15', ring: 'ring-yellow-500/40', text: 'text-yellow-500' },
  { key: 'encontro_seguro',  label: 'Encontro Seguro',  color: 'bg-emerald-600/15',ring: 'ring-emerald-500/40',text: 'text-emerald-500' },
  { key: 'indicacoes',       label: 'Ganhe Indicando',  color: 'bg-teal-500/15',   ring: 'ring-teal-400/40',   text: 'text-teal-400' },
  { key: 'eventos',          label: 'Eventos',          color: 'bg-sky-500/15',    ring: 'ring-sky-400/40',    text: 'text-sky-400' },
  { key: 'leiloes',          label: 'Leilões',          color: 'bg-orange-600/15', ring: 'ring-orange-500/40', text: 'text-orange-500' },
];

export const TUTORIAL_SAVE_CATEGORIES = TUTORIAL_CATEGORIES.filter((c) => c.key !== 'geral');

export function getTutorialCategory(key: string): TutorialCategory {
  return TUTORIAL_CATEGORIES.find((c) => c.key === key) ?? TUTORIAL_CATEGORIES[0];
}
