/**
 * Flags de Beta controladas pelo administrador master.
 *
 * Enquanto o produto está em fase de testes fechados, todas as formas de
 * pagamento, monetização, assinatura e destaque pago ficam temporariamente
 * indisponíveis. Os botões correspondentes devem exibir "Em breve".
 *
 * Quando o admin master liberar a fase de produção, basta trocar para `false`.
 */
export const BETA_PAYMENTS_LOCKED = true;

/** Texto padrão usado nos CTAs bloqueados durante o beta. */
export const BETA_CTA_LABEL = "Em breve";
