// Utilitários de formatação de perfil — padroniza Tipo (CASAL/HOMEM/MULHER/TRANS)
// e localidade (cidade/UF) em TODOS os componentes/modais.

/**
 * Mapa canônico do mock: SEMPRE retorna em MAIÚSCULAS.
 * Aceita variações em PT e EN vindas do banco.
 */
const GENDER_TO_MOCK: Record<string, "CASAL" | "HOMEM" | "MULHER" | "TRANS"> = {
  // PT
  homem: "HOMEM",
  mulher: "MULHER",
  casal: "CASAL",
  trans: "TRANS",
  // EN / variações
  man: "HOMEM",
  male: "HOMEM",
  woman: "MULHER",
  female: "MULHER",
  couple: "CASAL",
  couples: "CASAL",
  trans_man: "TRANS",
  trans_woman: "TRANS",
  transgender: "TRANS",
  travesti: "TRANS",
};

/**
 * Retorna exatamente um dos 4 valores do mock (CASAL/HOMEM/MULHER/TRANS)
 * ou null se não houver mapeamento confiável (sem fallback "Usuário").
 */
export function getGenderLabel(
  raw: string | null | undefined,
  profileType?: string | null
): "CASAL" | "HOMEM" | "MULHER" | "TRANS" | null {
  const key = (raw ?? profileType ?? "").toString().toLowerCase().trim();
  return GENDER_TO_MOCK[key] ?? null;
}

/**
 * Mapa nome → UF (apenas Brasil). Aceita acentos, com/sem capitalização.
 */
const STATE_NAME_TO_UF: Record<string, string> = {
  acre: "AC",
  alagoas: "AL",
  amapa: "AP",
  amazonas: "AM",
  bahia: "BA",
  ceara: "CE",
  "distrito federal": "DF",
  "espirito santo": "ES",
  goias: "GO",
  maranhao: "MA",
  "mato grosso": "MT",
  "mato grosso do sul": "MS",
  "minas gerais": "MG",
  para: "PA",
  paraiba: "PB",
  parana: "PR",
  pernambuco: "PE",
  piaui: "PI",
  "rio de janeiro": "RJ",
  "rio grande do norte": "RN",
  "rio grande do sul": "RS",
  rondonia: "RO",
  roraima: "RR",
  "santa catarina": "SC",
  "sao paulo": "SP",
  sergipe: "SE",
  tocantins: "TO",
};

const VALID_UFS = new Set(Object.values(STATE_NAME_TO_UF));

/**
 * Converte qualquer entrada de estado (nome completo ou sigla) em UF maiúsculo.
 * Ex: "São Paulo" -> "SP", "sp" -> "SP", "MG" -> "MG", "" -> null.
 */
export function toUF(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!cleaned) return null;
  // Já é sigla válida?
  const upper = cleaned.toUpperCase();
  if (upper.length === 2 && VALID_UFS.has(upper)) return upper;
  return STATE_NAME_TO_UF[cleaned] ?? (upper.length === 2 ? upper : null);
}

/**
 * Localidade no formato "CIDADE/UF" (ex: "Sorocaba/SP").
 * Mantém a cidade como veio (capitalização original).
 */
export function formatCidadeUF(
  city: string | null | undefined,
  state: string | null | undefined
): string | null {
  const c = (city || "").toString().trim();
  const uf = toUF(state);
  if (c && uf) return `${c}/${uf}`;
  if (c) return c;
  if (uf) return uf;
  return null;
}

/**
 * Texto combinado "TIPO • Cidade/UF" usado nos modais e cards.
 * Tipo SEMPRE em maiúsculas (mock); Cidade preserva capitalização; UF maiúscula.
 */
export function formatTipoCidade(input: {
  gender?: string | null;
  profile_type?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  location?: string | null;
}): string | null {
  const tipo = getGenderLabel(input?.gender, input?.profile_type);
  const localidade =
    formatCidadeUF(input?.address_city, input?.address_state) ||
    (input?.location ? input.location.toString().trim() : null);
  if (tipo && localidade) return `${tipo} • ${localidade}`;
  if (tipo) return tipo;
  if (localidade) return localidade;
  return null;
}
