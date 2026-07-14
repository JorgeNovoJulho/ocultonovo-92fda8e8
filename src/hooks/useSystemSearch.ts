import { useMemo } from 'react';
import { SYSTEM_SEARCH_INDEX, type SystemSearchEntry } from '@/data/systemSearchIndex';
import { SOCIAL_TAGS, ADULT_TAGS, SOCIAL_TAG_ICONS, ADULT_TAG_ICONS } from '@/data/tagsData';
import { useIsMasterAdmin } from '@/hooks/useUserRoles';


/** Normaliza removendo acentos e caixa, para matching tolerante. */
function norm(s: string): string {
  return (s || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Score simples: soma pontos por título, descrição, seção e keywords. */
function scoreEntry(entry: SystemSearchEntry, terms: string[]): number {
  const haystacks = [
    { text: norm(entry.title), weight: 6 },
    { text: norm(entry.description || ''), weight: 3 },
    { text: norm(entry.section), weight: 2 },
    { text: entry.keywords.map(norm).join(' | '), weight: 4 },
  ];

  let score = 0;
  for (const term of terms) {
    let matchedAny = false;
    for (const h of haystacks) {
      if (!h.text) continue;
      if (h.text.includes(term)) {
        score += h.weight;
        matchedAny = true;
        if (h.text.startsWith(term)) score += 2;
      }
    }
    if (!matchedAny) return 0;
  }
  return score;
}

function tagSlug(tag: string): string {
  return norm(tag).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Converte uma tag (social ou adulta) em entrada de busca sintética. */
function tagToEntry(tag: string, isAdult: boolean): SystemSearchEntry {
  const emoji = (isAdult ? ADULT_TAG_ICONS : SOCIAL_TAG_ICONS)[tag] || '🏷️';
  return {
    id: `tag:${isAdult ? 'adult' : 'social'}:${tag}`,
    title: `${emoji} ${tag}`,
    description: `Ver pessoas com a tag "${tag}"`,
    section: isAdult ? 'Tag +18' : 'Tag de afinidade',
    icon: 'Tag',
    route: `/pesquisar/tag/${encodeURIComponent(tagSlug(tag))}?label=${encodeURIComponent(tag)}&adult=${isAdult ? '1' : '0'}`,
    keywords: [tag, ...norm(tag).split(/\s+/)],
  };
}

function matchTags(q: string, limit: number): SystemSearchEntry[] {
  const out: SystemSearchEntry[] = [];
  const nq = norm(q);
  if (nq.length < 2) return out;

  const push = (tag: string, isAdult: boolean) => {
    const nt = norm(tag);
    if (nt === nq || nt.includes(nq) || nq.includes(nt)) {
      out.push(tagToEntry(tag, isAdult));
    }
  };

  for (const t of SOCIAL_TAGS) push(t, false);
  for (const t of ADULT_TAGS) push(t, true);

  // priorize exatos
  out.sort((a, b) => {
    const ta = norm(a.title);
    const tb = norm(b.title);
    const ea = ta.endsWith(nq) || ta.includes(` ${nq}`) ? 0 : 1;
    const eb = tb.endsWith(nq) || tb.includes(` ${nq}`) ? 0 : 1;
    return ea - eb;
  });

  return out.slice(0, limit);
}

export function useSystemSearch(query: string, limit = 10): SystemSearchEntry[] {
  const isMasterAdmin = useIsMasterAdmin();
  return useMemo(() => {
    const q = norm(query);
    if (q.length < 2) return [];
    const terms = q.split(/\s+/).filter(Boolean);
    if (!terms.length) return [];

    // Esconde Perfect Pair de qualquer usuário que não seja o master admin.
    const baseIndex = isMasterAdmin
      ? SYSTEM_SEARCH_INDEX
      : SYSTEM_SEARCH_INDEX.filter((e) => e.id !== 'perfect-pair' && e.route !== '/perfect-pair');

    const systemScored = baseIndex
      .map((entry) => ({ entry, score: scoreEntry(entry, terms) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.entry);

    const tagEntries = matchTags(query, 4);

    // Mescla: sistema primeiro, depois tags. Limita total.
    const merged = [...systemScored, ...tagEntries];
    return merged.slice(0, limit);
  }, [query, limit, isMasterAdmin]);
}

