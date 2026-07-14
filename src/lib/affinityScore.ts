/**
 * affinityScore — cálculo único e determinístico da afinidade entre
 * o usuário logado e um perfil-alvo. Usado em TODOS os locais de UI
 * (cards do carrossel de descoberta, badge no perfil etc.) para garantir
 * que o mesmo par de usuários sempre exiba a MESMA porcentagem.
 *
 * Regra: hash estável do par (id menor :: id maior) → 30..98.
 * Sem dependência de sinais variáveis (interesses, online) — assim
 * o número não muda entre telas onde alguns sinais não estão carregados.
 */

export type AffinityTone = 'high' | 'mid' | 'low' | 'veryLow';

export interface AffinityResult {
  score: number;
  tone: AffinityTone;
  label: string;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function computeAffinityScore(
  myId?: string | null,
  targetId?: string | null,
): number | null {
  if (!myId || !targetId || myId === targetId) return null;
  // Ordena o par para que (A,B) e (B,A) gerem o MESMO valor
  const [a, b] = myId < targetId ? [myId, targetId] : [targetId, myId];
  const h = hashString(`${a}::${b}`);
  // Distribui em 30..98 (69 valores) — evita parecer "muito baixo" por padrão
  const score = 30 + (h % 69);
  return score;
}

export function affinityTone(score: number): AffinityTone {
  if (score >= 75) return 'high';
  if (score >= 50) return 'mid';
  if (score >= 30) return 'low';
  return 'veryLow';
}

export function affinityLabel(tone: AffinityTone): string {
  switch (tone) {
    case 'high': return 'Afinidade alta';
    case 'mid': return 'Afinidade média';
    case 'low': return 'Afinidade baixa';
    default: return 'Pouca afinidade';
  }
}

export function computeAffinity(
  myId?: string | null,
  targetId?: string | null,
): AffinityResult | null {
  const score = computeAffinityScore(myId, targetId);
  if (score == null) return null;
  const tone = affinityTone(score);
  return { score, tone, label: affinityLabel(tone) };
}
