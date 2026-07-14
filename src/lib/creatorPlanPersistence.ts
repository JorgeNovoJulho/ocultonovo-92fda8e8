import { supabase } from "@/lib/supabaseExternal";

type PlanRow = Record<string, any>;

export interface PersistedCreatorPlanInput {
  profile_id: string;
  title: string;
  bio?: string | null;
  banner_url?: string | null;
  monthly_price: number;
  annual_price?: number | null;
  lifetime_price?: number | null;
  is_enabled?: boolean;
  sort_order?: number;
  plan_type?: string | null;
  accepts_pix?: boolean | null;
  accepts_card?: boolean | null;
  affiliate_user_id?: string | null;
}

const parseMissingColumn = (error: any): string | null => {
  const message = String(error?.message || "");
  const match = message.match(/Could not find the '([^']+)' column/i);
  return match?.[1] ?? null;
};

const toNumeric = (value: unknown, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

export const mapCreatorPlanRow = (row: PlanRow) => ({
  ...row,
  bio: row.bio ?? row.description ?? null,
  monthly_price: toNumeric(row.monthly_price),
  annual_price: row.annual_price == null ? null : toNumeric(row.annual_price),
  lifetime_price: row.lifetime_price == null ? null : toNumeric(row.lifetime_price),
  is_enabled: row.is_enabled ?? row.is_active ?? true,
  sort_order: row.sort_order ?? 0,
  plan_type: row.plan_type ?? "mixed_content",
  accepts_pix: row.accepts_pix ?? true,
  accepts_card: row.accepts_card ?? true,
  affiliate_user_id: row.affiliate_user_id ?? null,
});

export const buildCreatorPlanPayload = (input: PersistedCreatorPlanInput) => ({
  profile_id: input.profile_id,
  title: input.title,
  description: input.bio?.trim() || null,
  banner_url: input.banner_url ?? null,
  monthly_price: toNumeric(input.monthly_price),
  annual_price: input.annual_price == null ? null : toNumeric(input.annual_price),
  lifetime_price: input.lifetime_price == null ? null : toNumeric(input.lifetime_price),
  is_enabled: input.is_enabled ?? true,
  is_active: input.is_enabled ?? true,
  sort_order: input.sort_order ?? 0,
  plan_type: input.plan_type ?? "mixed_content",
  accepts_pix: input.accepts_pix ?? true,
  accepts_card: input.accepts_card ?? true,
  affiliate_user_id: input.affiliate_user_id ?? null,
});

async function mutatePlanWithFallback(
  mode: "insert" | "update",
  payload: Record<string, any>,
  planId?: string,
) {
  const candidate = { ...payload };
  const removed = new Set<string>();

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const query = mode === "insert"
      ? (supabase as any).from("subscription_plans").insert(candidate).select("id").single()
      : (supabase as any).from("subscription_plans").update(candidate).eq("id", planId).select("id").single();

    const { data, error } = await query;
    if (!error) return data;

    const missingColumn = parseMissingColumn(error);
    if (!missingColumn || !(missingColumn in candidate) || removed.has(missingColumn)) {
      throw error;
    }

    removed.add(missingColumn);
    delete candidate[missingColumn];
  }

  throw new Error("Não foi possível compatibilizar o schema de subscription_plans automaticamente.");
}

export async function insertCreatorPlan(input: PersistedCreatorPlanInput) {
  return mutatePlanWithFallback("insert", buildCreatorPlanPayload(input));
}

export async function updateCreatorPlan(planId: string, input: PersistedCreatorPlanInput) {
  return mutatePlanWithFallback("update", buildCreatorPlanPayload(input), planId);
}

export async function updateCreatorPlanStatus(planId: string, isEnabled: boolean) {
  return mutatePlanWithFallback(
    "update",
    { is_enabled: isEnabled, is_active: isEnabled },
    planId,
  );
}

export async function fetchCreatorPlans(profileId: string) {
  const buildBase = () =>
    (supabase as any).from("subscription_plans").select("*").eq("profile_id", profileId);

  // 1ª tentativa: ordenar por sort_order
  let response = await buildBase().order("sort_order", { ascending: true });

  // Fallback robusto: detecta tanto "Could not find the 'X' column" quanto "column X does not exist"
  if (response.error) {
    const msg = String(response.error.message || "").toLowerCase();
    const isSortMissing =
      parseMissingColumn(response.error) === "sort_order" ||
      /sort_order/.test(msg);

    if (isSortMissing) {
      response = await buildBase().order("created_at", { ascending: true });
    }
  }

  // Último fallback: sem ordenação alguma
  if (response.error) {
    const msg = String(response.error.message || "").toLowerCase();
    if (/does not exist|could not find/.test(msg)) {
      response = await buildBase();
    }
  }

  if (response.error) throw response.error;
  return (response.data || []).map(mapCreatorPlanRow);
}

export function getAnnualDiscountPercent(monthlyPrice?: number | null, annualPrice?: number | null) {
  const monthly = toNumeric(monthlyPrice, 0);
  const annual = toNumeric(annualPrice, 0);
  const baseAnnual = monthly * 12;

  if (baseAnnual <= 0 || annual <= 0 || annual >= baseAnnual) return 0;

  return Math.max(0, Math.min(99, Math.round(((baseAnnual - annual) / baseAnnual) * 100)));
}