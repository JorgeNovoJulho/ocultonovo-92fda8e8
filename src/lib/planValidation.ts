/**
 * Validações de coerência entre planos Free, Premium e VIP.
 * Garante que a hierarquia faça sentido antes de salvar.
 */
import { PLAN_FEATURE_CATALOG, PlanTypeKey } from "@/lib/planFeatureCatalog";
import type { SubscriptionPlan } from "@/hooks/useSubscriptionPlans";

export interface PlanValidationIssue {
  level: "error" | "warning";
  message: string;
}

export interface LimitConflict {
  level: "error" | "warning" | "info";
  title: string;
  impact: string;
}

/**
 * Auto-corrige limites inconsistentes restaurando os defaults canônicos do plano
 * para todos os campos que apresentem conflitos detectados por `detectLimitConflicts`.
 * Retorna um novo objeto de limites + a lista de chaves que foram modificadas.
 */
export function autoFixLimitConflicts(args: {
  planType: PlanTypeKey;
  toggles: Record<string, boolean>;
  limits: Record<string, number>;
}): { limits: Record<string, number>; toggles: Record<string, boolean>; changedKeys: string[]; changedToggles: string[] } {
  const { planType, toggles, limits } = args;
  const nextLimits: Record<string, number> = { ...limits };
  const nextToggles: Record<string, boolean> = { ...toggles };
  const changedKeys: string[] = [];
  const changedToggles: string[] = [];

  for (const def of PLAN_FEATURE_CATALOG) {
    if (!def.limits || def.limits.length === 0) continue;
    const enabled = !!nextToggles[def.key];

    for (const lim of def.limits) {
      const val = nextLimits[lim.key];
      const expected = lim.defaults[planType];

      // Valor inválido (< -1) → restaura default
      if (val !== undefined && val < -1) {
        nextLimits[lim.key] = expected;
        changedKeys.push(lim.key);
        continue;
      }

      // Toggle ativo + limite zero → restaura default (>0 ou ilimitado)
      if (enabled && val === 0) {
        nextLimits[lim.key] = expected === 0 ? (planType === 'free' ? 10 : -1) : expected;
        changedKeys.push(lim.key);
        continue;
      }

      // Toggle desativado + limite > 0 → zera o limite (coerência)
      if (!enabled && typeof val === 'number' && val > 0) {
        nextLimits[lim.key] = 0;
        changedKeys.push(lim.key);
        continue;
      }

      // Plano pago com limite zerado em função liberada que deveria ser ilimitada
      if (planType !== 'free' && enabled && expected === -1 && val === 0) {
        nextLimits[lim.key] = -1;
        changedKeys.push(lim.key);
      }
    }
  }

  // Regra Free: feed precisa de pelo menos 10 posts sem blur quando feed_full está ativo
  if (planType === 'free' && nextToggles['feed_full'] && nextLimits['posts_no_blur_per_day'] === 0) {
    nextLimits['posts_no_blur_per_day'] = 10;
    if (!changedKeys.includes('posts_no_blur_per_day')) changedKeys.push('posts_no_blur_per_day');
  }

  return { limits: nextLimits, toggles: nextToggles, changedKeys, changedToggles };
}

/**
 * Detecta conflitos entre toggles e limites numéricos que tornariam
 * uma função inacessível, contraditória ou irrelevante para o usuário final.
 */
export function detectLimitConflicts(args: {
  planType: PlanTypeKey;
  toggles: Record<string, boolean>;
  limits: Record<string, number>;
}): LimitConflict[] {
  const { planType, toggles, limits } = args;
  const conflicts: LimitConflict[] = [];

  for (const def of PLAN_FEATURE_CATALOG) {
    const enabled = !!toggles[def.key];
    if (!def.limits || def.limits.length === 0) continue;

    for (const lim of def.limits) {
      const val = limits[lim.key];
      if (val === undefined || val === null || Number.isNaN(val)) continue;

      // Valor inválido
      if (val < -1) {
        conflicts.push({
          level: "error",
          title: `Valor inválido em "${lim.label}"`,
          impact: `O limite ${val} não é válido. Use 0 para bloquear, -1 (∞) para ilimitado, ou um número positivo.`,
        });
        continue;
      }

      // Função ligada mas limite zera o uso → totalmente inacessível
      if (enabled && val === 0) {
        conflicts.push({
          level: "error",
          title: `"${def.label}" liberada mas com limite zero`,
          impact: `O toggle está ATIVO, porém "${lim.label} = 0" bloqueia 100% do uso. O usuário verá a função disponível mas não conseguirá utilizá-la — gera frustração e tickets de suporte.`,
        });
      }

      // Função desligada mas limite > 0 → limite órfão
      if (!enabled && val > 0) {
        conflicts.push({
          level: "warning",
          title: `Limite órfão em "${lim.label}"`,
          impact: `O toggle "${def.label}" está DESATIVADO, então o valor ${val} nunca será aplicado. Recomenda-se zerar o limite ou ativar a função para manter coerência.`,
        });
      }
    }
  }

  // Regra de negócio Free: feed precisa de pelo menos 1 post sem blur
  if (planType === "free" && toggles["feed_full"] && limits["posts_no_blur_per_day"] === 0) {
    conflicts.push({
      level: "error",
      title: "Feed Free totalmente bloqueado por BLUR",
      impact: "Com 0 posts sem blur, o usuário Free não vê nenhum conteúdo nítido — equivale a desativar a plataforma para o plano gratuito. Defina ao menos 5–10 posts.",
    });
  }

  // Premium / VIP com limites zerados em funções liberadas (ilimitado esperado)
  if (planType !== "free") {
    for (const def of PLAN_FEATURE_CATALOG) {
      if (!def.limits || !toggles[def.key]) continue;
      for (const lim of def.limits) {
        const val = limits[lim.key];
        const expected = lim.defaults[planType];
        if (expected === -1 && val === 0) {
          conflicts.push({
            level: "warning",
            title: `${planType.toUpperCase()}: "${lim.label}" zerado`,
            impact: `Por padrão, ${planType.toUpperCase()} tem ${lim.label} ilimitado (-1). Definir 0 contradiz a expectativa do plano pago e pode gerar pedidos de reembolso.`,
          });
        }
      }
    }
  }

  return conflicts;
}

/**
 * Valida toggles do plano em edição vs. catálogo + outros planos persistidos.
 * Regras:
 *  - Free não pode ter funções marcadas como exclusivas de Premium/VIP no catálogo
 *  - Premium não pode ter funções exclusivas de VIP
 *  - VIP deve incluir tudo que Premium tem (hierarquia)
 *  - Premium deve incluir tudo que Free tem (hierarquia)
 *  - Preço Free deve ser 0; Premium > 0; VIP >= Premium
 */
export function validatePlanForm(args: {
  planType: PlanTypeKey;
  toggles: Record<string, boolean>;
  priceMonthly: number;
  otherPlans: SubscriptionPlan[];
}): PlanValidationIssue[] {
  const { planType, toggles, priceMonthly, otherPlans } = args;
  const issues: PlanValidationIssue[] = [];

  // 1) Toggles incoerentes com o catálogo
  for (const def of PLAN_FEATURE_CATALOG) {
    const on = !!toggles[def.key];
    const allowedDefault = def.defaults[planType];
    if (planType === "free" && on && !def.defaults.free && !def.defaults.premium && def.defaults.vip) {
      issues.push({
        level: "error",
        message: `Free não pode ter função exclusiva de VIP: "${def.label}".`,
      });
    }
    if (planType === "premium" && on && !def.defaults.premium && def.defaults.vip) {
      issues.push({
        level: "warning",
        message: `Premium recebendo função normalmente exclusiva de VIP: "${def.label}".`,
      });
    }
    if (planType === "vip" && !on && allowedDefault) {
      issues.push({
        level: "warning",
        message: `VIP normalmente inclui "${def.label}" — está desativada.`,
      });
    }
  }

  // 2) Hierarquia entre planos persistidos
  const findPlan = (t: string) => otherPlans.find((p) => p.plan_type === t);
  const labelsFromToggles = (state: Record<string, boolean>) =>
    new Set(PLAN_FEATURE_CATALOG.filter((d) => state[d.key]).map((d) => d.label));

  const editingLabels = labelsFromToggles(toggles);

  if (planType === "premium") {
    const free = findPlan("free");
    if (free) {
      for (const f of free.features) {
        if (PLAN_FEATURE_CATALOG.some((d) => d.label === f) && !editingLabels.has(f)) {
          issues.push({
            level: "error",
            message: `Premium deve incluir "${f}" (já liberado no Free).`,
          });
        }
      }
    }
  }

  if (planType === "vip") {
    const premium = findPlan("premium");
    if (premium) {
      for (const f of premium.features) {
        if (PLAN_FEATURE_CATALOG.some((d) => d.label === f) && !editingLabels.has(f)) {
          issues.push({
            level: "error",
            message: `VIP deve incluir "${f}" (já liberado no Premium).`,
          });
        }
      }
    }
  }

  if (planType === "free") {
    const premium = findPlan("premium");
    if (premium) {
      for (const f of Array.from(editingLabels)) {
        const inPremium = premium.features.includes(f);
        if (!inPremium) {
          issues.push({
            level: "error",
            message: `Free não pode liberar "${f}" sem que Premium também libere.`,
          });
        }
      }
    }
  }

  // 3) Preços
  if (planType === "free" && priceMonthly > 0) {
    issues.push({ level: "error", message: "Plano Free deve ter preço mensal = 0." });
  }
  if (planType === "premium" && priceMonthly <= 0) {
    issues.push({ level: "error", message: "Plano Premium deve ter preço mensal > 0." });
  }
  if (planType === "vip") {
    const premium = findPlan("premium");
    if (premium && priceMonthly < premium.price_monthly) {
      issues.push({
        level: "error",
        message: `VIP (R$ ${priceMonthly.toFixed(2)}) não pode custar menos que Premium (R$ ${premium.price_monthly.toFixed(2)}).`,
      });
    }
  }

  return issues;
}
