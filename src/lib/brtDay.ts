/**
 * Helpers de "dia" no fuso de Brasília (America/Sao_Paulo).
 * Garante que os agregados diários (gráficos admin) usem o calendário local
 * (00:00 → 23:59 BRT) em vez do dia UTC.
 */
export const BRT_TZ = 'America/Sao_Paulo';

/** Retorna 'YYYY-MM-DD' no fuso de Brasília para a data dada. */
export function brtDayKey(date: Date | string | number): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  // en-CA formata como YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BRT_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Data correspondente a 00:00 BRT do dia atual (em BRT), como instante UTC. */
export function brtStartOfToday(): Date {
  const key = brtDayKey(new Date());
  // BRT é UTC-03:00 (sem horário de verão atualmente)
  return new Date(`${key}T00:00:00-03:00`);
}

/** Início (00:00 BRT) de N dias atrás, como instante UTC. */
export function brtStartDaysAgo(daysBack: number): Date {
  const todayBrt = brtStartOfToday();
  const d = new Date(todayBrt);
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d;
}

/** Lista de chaves YYYY-MM-DD (BRT) dos últimos `days` dias incluindo hoje. */
export function brtLastDaysKeys(days: number): string[] {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    keys.push(brtDayKey(brtStartDaysAgo(i)));
  }
  return keys;
}

/** Converte chave YYYY-MM-DD em label "dd/MM". */
export function brtDayLabel(key: string): string {
  const [, mm, dd] = key.split('-');
  return `${dd}/${mm}`;
}
