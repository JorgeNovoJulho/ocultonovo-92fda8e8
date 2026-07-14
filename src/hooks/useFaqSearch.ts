import { useMemo } from 'react';
import { FAQ_INDEX, type FaqEntry } from '@/data/faqIndex';

function norm(s: string): string {
  return (s || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function scoreFaq(entry: FaqEntry, terms: string[]): number {
  const haystacks = [
    { text: norm(entry.question), weight: 7 },
    { text: norm(entry.section), weight: 2 },
    { text: entry.keywords.map(norm).join(' | '), weight: 5 },
    { text: norm(entry.answer), weight: 1 },
  ];

  let score = 0;
  for (const term of terms) {
    let matched = false;
    for (const h of haystacks) {
      if (!h.text) continue;
      if (h.text.includes(term)) {
        score += h.weight;
        matched = true;
        if (h.text.startsWith(term)) score += 2;
      }
    }
    // FAQ é tolerante: não exige todos os termos baterem (perguntas naturais)
    if (matched) score += 1;
  }
  return score;
}

/**
 * Busca tolerante na base de FAQ.
 * Retorna até `limit` entradas ordenadas por relevância.
 */
export function useFaqSearch(query: string, limit = 3): FaqEntry[] {
  return useMemo(() => {
    const q = norm(query);
    if (q.length < 2) return [];
    const terms = q.split(/\s+/).filter((t) => t.length >= 2);
    if (!terms.length) return [];

    return FAQ_INDEX
      .map((entry) => ({ entry, score: scoreFaq(entry, terms) }))
      .filter((x) => x.score >= 5)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.entry);
  }, [query, limit]);
}
