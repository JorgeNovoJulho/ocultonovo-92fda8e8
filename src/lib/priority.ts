/**
 * Sistema de Prioridade para Usuários Verificados/Premium/VIP
 * 
 * Ordem de prioridade (maior score = maior visibilidade):
 * - Humano real (is_seed=false): base 0 (prioridade natural)
 * - Bot/Seed (is_seed=true): -1000 pontos (sempre abaixo de humanos)
 * - VIP: +100 pontos
 * - Premium: +50 pontos
 * - Verificado: +30 pontos
 * - Casal Verificado: +20 pontos adicionais
 * - Criador: +10 pontos
 * - Online agora: +25 pontos
 */

export interface PrioritizableUser {
  is_verified?: boolean;
  is_verified_couple?: boolean;
  plan_type?: string;
  is_creator?: boolean;
  is_seed?: boolean;
  is_online?: boolean;
}

/**
 * Calcula o score de prioridade de um usuário
 * @param user Objeto com dados do usuário
 * @returns Score numérico de prioridade (maior = mais prioritário)
 */
export function calculatePriorityScore(user: PrioritizableUser): number {
  let score = 0;
  
  // REGRA #1: Bots/seed sempre abaixo de humanos reais
  if (user.is_seed) {
    score -= 1000;
  }
  
  // Plano: VIP = 100, Premium = 50, Free = 0
  if (user.plan_type === 'vip') {
    score += 100;
  } else if (user.plan_type === 'premium') {
    score += 50;
  }
  
  // Verificação individual: +30 pontos
  if (user.is_verified) {
    score += 30;
  }
  
  // Casal verificado: +20 pontos adicionais
  if (user.is_verified_couple) {
    score += 20;
  }
  
  // Criador: +10 pontos
  if (user.is_creator) {
    score += 10;
  }
  
  // Online agora: +25 pontos
  if (user.is_online) {
    score += 25;
  }
  
  return score;
}

/**
 * Ordena um array de usuários por prioridade (maior primeiro)
 */
export function sortByPriority<T extends PrioritizableUser>(users: T[]): T[] {
  return [...users].sort((a, b) => {
    const scoreA = calculatePriorityScore(a);
    const scoreB = calculatePriorityScore(b);
    return scoreB - scoreA;
  });
}

/**
 * Retorna o badge/label de status do usuário
 */
export function getPriorityLabel(user: PrioritizableUser): 'vip' | 'premium' | 'verified' | 'couple' | null {
  if (user.plan_type === 'vip') return 'vip';
  if (user.plan_type === 'premium') return 'premium';
  if (user.is_verified_couple) return 'couple';
  if (user.is_verified) return 'verified';
  return null;
}

/**
 * Verifica se o usuário tem status premium (VIP ou Premium)
 */
export function isPremiumUser(user: PrioritizableUser): boolean {
  return user.plan_type === 'vip' || user.plan_type === 'premium';
}

/**
 * Verifica se o usuário é real (não é bot/seed)
 */
export function isRealUser(user: PrioritizableUser): boolean {
  return !user.is_seed;
}
