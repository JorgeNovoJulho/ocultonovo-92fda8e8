import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseExternal';
import { useDebounce } from './useDebounce';

export interface SearchedUser {
  id: string;
  user_id: string;
  /** @deprecated Nunca preenchido — nome real é privado. Mantido apenas por compat. */
  name?: string;
  username: string | null;
  avatar_url: string | null;
  gender?: string | null;
  profile_type?: string | null;
}

/** Normaliza string: lowercase + remove acentos + trim. */
function norm(s: string): string {
  return (s || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Tabela canônica de sinônimos por categoria de gender/profile_type.
 * `triggers` = o que o usuário pode digitar (já normalizado).
 * `values`   = valores aceitos nos campos `gender` / `profile_type` do banco.
 * `label`    = rótulo exibido como badge ao lado do @username.
 */
export type GenderCategory = 'mulher' | 'homem' | 'casal' | 'trans';

interface GenderGroup {
  category: GenderCategory;
  label: string;
  triggers: string[];
  values: string[];
}

const GENDER_GROUPS: GenderGroup[] = [
  {
    category: 'mulher',
    label: 'Mulher',
    triggers: [
      'mulher', 'mulheres', 'mulherzinha', 'mulherao',
      'woman', 'women', 'female', 'fem', 'f',
      'garota', 'garotas', 'mina', 'minas',
      'menina', 'meninas', 'moca', 'moça', 'dama',
      'feminino', 'feminina', 'feminine',
      'girl', 'girls', 'lady', 'ladies',
      'srta', 'senhorita', 'senhora',
    ],
    values: ['mulher', 'woman', 'female', 'f', 'feminino'],
  },
  {
    category: 'homem',
    label: 'Homem',
    triggers: [
      'homem', 'homens', 'homenzinho', 'homenzao',
      'man', 'men', 'male', 'masc', 'm',
      'cara', 'caras', 'rapaz', 'rapazes',
      'menino', 'meninos', 'moco', 'moço',
      'masculino', 'masculina', 'masculine',
      'guy', 'guys', 'boy', 'boys',
      'macho',
    ],
    values: ['homem', 'man', 'male', 'm', 'masculino'],
  },
  {
    category: 'casal',
    label: 'Casal',
    triggers: [
      'casal', 'casais', 'casalzinho',
      'couple', 'couples',
      'dupla', 'duplas',
      'par', 'pares',
      'mff', 'mmf', 'hh', 'mm', 'ff',
      'hetero', 'heterossexual', 'heterosexual',
      'casadinhos', 'noivos',
    ],
    values: ['casal', 'couple', 'couples'],
  },
  {
    category: 'trans',
    label: 'Trans',
    triggers: [
      'trans', 'transex', 'transexual', 'transexuais',
      'transgenero', 'transgender', 'trangero',
      'travesti', 'travestis', 't',
      'trans_man', 'trans_woman',
      'transwoman', 'transman',
      'tgirl', 'tboy',
      'crossdresser', 'cd',
    ],
    values: [
      'trans', 'travesti', 'transgender',
      'trans_man', 'trans_woman',
      'transex', 'transexual',
    ],
  },
];

/**
 * Retorna a categoria/label/valores se o termo digitado bate com algum
 * sinônimo. Match tolerante: prefixo OU substring (mín. 2 chars).
 */
export function detectGenderMatch(raw: string): {
  category: GenderCategory;
  label: string;
  values: string[];
  triggers: string[];
} | null {
  const q = norm(raw);
  if (!q) return null;

  // Se parece um @username (contém _, dígitos ou é longo), não tratamos
  // como busca de gênero — evita que "mulatacuriosa_ofc" dispare "homem"
  // só porque começa com "m".
  if (q.includes('_') || /\d/.test(q) || q.length > 12) return null;

  // 1) Match exato — único caso em que triggers curtos ("f","m","t") valem.
  for (const g of GENDER_GROUPS) {
    if (g.triggers.includes(q)) {
      return { category: g.category, label: g.label, values: g.values, triggers: g.triggers };
    }
  }

  // 2) Match tolerante — exige trigger com ≥3 chars para evitar
  // colisão com qualquer username que comece com "m"/"f"/"t".
  if (q.length < 3) return null;
  for (const g of GENDER_GROUPS) {
    if (
      g.triggers.some(
        (t) => t.length >= 3 && (t.startsWith(q) || q.startsWith(t) || t.includes(q)),
      )
    ) {
      return { category: g.category, label: g.label, values: g.values, triggers: g.triggers };
    }
  }
  return null;
}

/**
 * Lista todos os termos a destacar no resultado: o termo digitado + todos
 * os sinônimos da categoria detectada (para o usuário entender o porquê
 * de cada perfil ter aparecido).
 */
export function getHighlightTerms(query: string): string[] {
  const q = norm(query);
  if (!q) return [];
  const set = new Set<string>([q]);
  const match = detectGenderMatch(q);
  if (match) {
    for (const t of match.triggers) set.add(t);
    for (const v of match.values) set.add(v);
  }
  return Array.from(set).filter(Boolean);
}

export function useSearchUsers(query: string, limit: number = 10) {
  const debouncedQuery = useDebounce(query, 150);

  return useQuery({
    queryKey: ['search-users', debouncedQuery],
    queryFn: async (): Promise<SearchedUser[]> => {
      if (!debouncedQuery || debouncedQuery.length < 2) return [];

      // Remove @ prefix if user typed it
      const cleanQuery = debouncedQuery.replace(/^@+/, '').trim();
      if (cleanQuery.length < 2) return [];

      const match = detectGenderMatch(cleanQuery);

      // Variantes da query removendo sufixos comuns ("_ofc", "_oficial", …).
      const variants = new Set<string>([cleanQuery]);
      const stripped = cleanQuery.replace(
        /[_\-.\s]*(ofc|oficial|official|real|verificad[oa]|br|brasil|vip|premium|tv|hot|adulto|18)+$/i,
        '',
      );
      if (stripped && stripped !== cleanQuery && stripped.length >= 2) variants.add(stripped);
      const coreToken = cleanQuery.split(/[_\-.\s]/)[0];
      if (coreToken && coreToken.length >= 3) variants.add(coreToken);

      const usernameOr = Array.from(variants)
        .map((v) => `username.ilike.%${v}%`)
        .join(',');

      // PRIVACIDADE: busca por @username. O nome real (profiles.name) nunca
      // é usado como critério nem retornado, pois é dado privado.
      // IMPORTANTE: não filtramos `is_seed` aqui — perfis seed também são
      // navegáveis (aparecem nos stories) e o usuário espera achá-los.
      let q = supabase
        .from('profiles')
        .select('id, user_id, username, avatar_url, gender, profile_type')
        .limit(limit);

      if (match && match.values.length > 0) {
        const inList = `(${match.values.map((v) => `"${v}"`).join(',')})`;
        const orParts = [
          usernameOr,
          `gender.in.${inList}`,
          `profile_type.in.${inList}`,
        ];
        q = q.or(orParts.join(','));
      } else {
        q = q.or(usernameOr);
      }

      const { data, error } = await q;

      if (error) throw error;
      return (data || []) as SearchedUser[];
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    placeholderData: (prev) => prev,
  });
}

// Buscar profile por username para menções clicáveis
export async function getProfileByUsername(username: string): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .single();

  if (error || !data) return null;
  return data;
}
