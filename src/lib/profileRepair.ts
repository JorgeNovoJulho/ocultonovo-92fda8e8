import { supabase } from "@/lib/supabaseExternal";
import { buildPublicUrl } from "@/lib/storageUrl";

type MatchedBy = "user_id" | "id" | null;

type AssetKind = "avatar" | "banner";

type AssetCandidate = {
  bucket: string;
  path: string;
  name: string;
};

type RepairMessage = {
  level: "info" | "warning" | "error";
  text: string;
};

export type RepairProfileResult = {
  updated: boolean;
  matchedBy: MatchedBy;
  usedRpc: boolean;
  usedFallback: boolean;
  profileFound: boolean;
  repairedFields: string[];
  messages: RepairMessage[];
  before: Record<string, any> | null;
  after: Record<string, any> | null;
};

const IMAGE_EXT_RE = /\.(avif|gif|heic|jpe?g|png|webp|bmp|svg)$/i;

const pickString = (...values: any[]): string | null => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
};

const pickDate = (...values: any[]): string | null => {
  for (const value of values) {
    if (typeof value !== "string" || !value.trim()) continue;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return value.length >= 10 ? value.slice(0, 10) : value;
    }
  }
  return null;
};

const parseObject = (value: any): Record<string, any> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value : null;

const parseStringArray = (value: any): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
      }
    } catch {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }

  return [];
};

const pickArray = (...values: any[]): string[] => {
  for (const value of values) {
    const parsed = parseStringArray(value);
    if (parsed.length > 0) return parsed;
  }
  return [];
};

const pickCoordinate = (...values: any[]): number | null => {
  for (const value of values) {
    const numeric = typeof value === "string" ? Number(value) : value;
    if (typeof numeric === "number" && Number.isFinite(numeric) && Math.abs(numeric) > 0.000001) {
      return numeric;
    }
  }
  return null;
};

const hasMeaningfulValue = (value: any) => {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

const buildUsernameFallback = (email?: string | null, name?: string | null) =>
  ((name || email?.split("@")[0] || "usuario") as string)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30) || "usuario";

export async function fetchProfileRecord(userId: string): Promise<{
  data: Record<string, any> | null;
  matchedBy: MatchedBy;
  error: any;
}> {
  const byUserId = await (supabase as any)
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (byUserId.error) {
    return { data: null, matchedBy: null, error: byUserId.error };
  }

  if (byUserId.data) {
    return { data: byUserId.data as Record<string, any>, matchedBy: "user_id", error: null };
  }

  const byId = await (supabase as any)
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (byId.error) {
    return { data: null, matchedBy: null, error: byId.error };
  }

  return {
    data: (byId.data as Record<string, any> | null) || null,
    matchedBy: byId.data ? "id" : null,
    error: null,
  };
}

async function fetchProfileCandidates(userId: string, authUser: any, current: Record<string, any> | null) {
  const filters = [
    `user_id.eq.${userId}`,
    `id.eq.${userId}`,
    current?.username ? `username.eq.${current.username}` : null,
    authUser?.user_metadata?.username ? `username.eq.${authUser.user_metadata.username}` : null,
    authUser?.email ? `email.eq.${authUser.email}` : null,
  ].filter(Boolean);

  if (filters.length === 0) return [];

  const { data, error } = await (supabase as any)
    .from("profiles")
    .select("*")
    .or(filters.join(","))
    .limit(10);

  if (error || !Array.isArray(data)) return [];
  return data as Record<string, any>[];
}

function scoreProfileCandidate(candidate: Record<string, any>): number {
  const location = parseObject(candidate.location);
  const address = parseObject(candidate.address);
  const checks = [
    candidate.username,
    candidate.avatar_url,
    candidate.banner_url || candidate.cover_image_url,
    candidate.birth_date,
    candidate.gender,
    candidate.address_cep || address?.cep,
    candidate.address_city || address?.city,
    candidate.location_lat || candidate.address_lat || location?.lat,
    candidate.location_lng || candidate.address_lng || location?.lng,
    ...(parseStringArray(candidate.tags_social).length ? [candidate.tags_social] : []),
    ...(parseStringArray(candidate.tags_adult).length ? [candidate.tags_adult] : []),
    ...(parseStringArray(candidate.interests_general).length ? [candidate.interests_general] : []),
    ...(parseStringArray(candidate.interests_occult).length ? [candidate.interests_occult] : []),
  ];

  return checks.filter(hasMeaningfulValue).length;
}

function mergeProfileCandidates(candidates: Array<Record<string, any> | null | undefined>) {
  const valid = candidates.filter((candidate): candidate is Record<string, any> => !!candidate);
  if (valid.length === 0) return null;

  const sorted = [...valid].sort((a, b) => scoreProfileCandidate(b) - scoreProfileCandidate(a));
  return sorted.reduce<Record<string, any>>((acc, candidate) => {
    for (const [key, value] of Object.entries(candidate)) {
      if (!hasMeaningfulValue(acc[key]) && hasMeaningfulValue(value)) {
        acc[key] = value;
      }
    }
    return acc;
  }, {});
}

function rankAsset(candidate: AssetCandidate, kind: AssetKind): number {
  const value = `${candidate.bucket}/${candidate.path}`.toLowerCase();
  let score = 0;

  if (kind === "avatar") {
    if (/(^|[_/.-])(avatar|profile|foto)([_/.-]|$)/.test(value)) score += 120;
    if (!/(^|[_/.-])(banner|cover|capa)([_/.-]|$)/.test(value)) score += 25;
    if (!value.includes("/banners/")) score += 10;
  }

  if (kind === "banner") {
    if (candidate.bucket === "banners") score += 100;
    if (value.includes("/banners/")) score += 80;
    if (/(^|[_/.-])(banner|cover|capa)([_/.-]|$)/.test(value)) score += 60;
  }

  if (IMAGE_EXT_RE.test(candidate.name)) score += 10;
  return score;
}

export function selectBestStorageAsset(candidates: AssetCandidate[], kind: AssetKind): AssetCandidate | null {
  const valid = candidates.filter((candidate) => IMAGE_EXT_RE.test(candidate.name));
  if (valid.length === 0) return null;

  return [...valid].sort((a, b) => {
    const scoreDiff = rankAsset(b, kind) - rankAsset(a, kind);
    if (scoreDiff !== 0) return scoreDiff;
    return b.path.localeCompare(a.path);
  })[0] ?? null;
}

async function listAssetCandidates(bucket: string, prefix: string): Promise<AssetCandidate[]> {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, {
    limit: 100,
    sortBy: { column: "name", order: "desc" },
  });

  if (error || !data) return [];

  return data
    .filter((entry) => typeof entry.name === "string" && IMAGE_EXT_RE.test(entry.name))
    .map((entry) => ({
      bucket,
      path: `${prefix}/${entry.name}`,
      name: entry.name,
    }));
}

async function discoverProfileAssets(userId: string) {
  const [avatarRoot, avatarNestedBanners, bannerBucketRoot] = await Promise.all([
    listAssetCandidates("avatars", userId),
    listAssetCandidates("avatars", `${userId}/banners`),
    listAssetCandidates("banners", userId),
  ]);

  const avatarAsset = selectBestStorageAsset(avatarRoot, "avatar");
  const bannerAsset = selectBestStorageAsset(
    [...avatarNestedBanners, ...bannerBucketRoot, ...avatarRoot],
    "banner",
  );

  return {
    avatarUrl: avatarAsset ? buildPublicUrl(avatarAsset.bucket, avatarAsset.path) : null,
    bannerUrl: bannerAsset ? buildPublicUrl(bannerAsset.bucket, bannerAsset.path) : null,
  };
}

function buildProfilePayload(
  userId: string,
  current: Record<string, any> | null,
  authUser: any,
  discovered: { avatarUrl: string | null; bannerUrl: string | null },
) {
  const meta = ((authUser?.user_metadata || {}) as Record<string, any>) ?? {};
  const addressObject = parseObject(current?.address);
  const locationObject = parseObject(current?.location);
  const resolvedName =
    current?.display_name ||
    current?.name ||
    current?.full_name ||
    meta.display_name ||
    meta.name ||
    meta.full_name ||
    authUser?.email?.split("@")[0] ||
    "Usuário";
  const resolvedUsername =
    current?.username || meta.username || buildUsernameFallback(authUser?.email || null, resolvedName);

  const avatarUrl = current?.avatar_url || meta.avatar_url || discovered.avatarUrl || null;
  const bannerUrl = current?.banner_url || current?.cover_image_url || meta.banner_url || discovered.bannerUrl || null;
  const tagsSocial = pickArray(
    current?.tags_social,
    current?.interests_general,
    meta.tags_social,
    meta.interests_general,
    current?.tags,
  );
  const tagsAdult = pickArray(
    current?.tags_adult,
    current?.interests_occult,
    meta.tags_adult,
    meta.interests_occult,
  );
  const locationLat = pickCoordinate(
    current?.location_lat,
    current?.address_lat,
    locationObject?.lat,
    locationObject?.latitude,
    addressObject?.lat,
    addressObject?.latitude,
  );
  const locationLng = pickCoordinate(
    current?.location_lng,
    current?.address_lng,
    locationObject?.lng,
    locationObject?.lon,
    locationObject?.longitude,
    addressObject?.lng,
    addressObject?.lon,
    addressObject?.longitude,
  );
  const addressCep = pickString(
    current?.address_cep,
    addressObject?.cep,
    addressObject?.postal_code,
    addressObject?.postcode,
  );
  const addressCity = pickString(
    current?.address_city,
    addressObject?.city,
    addressObject?.town,
    addressObject?.municipality,
    addressObject?.village,
  );
  const resolvedGender = pickString(
    current?.gender,
    meta.gender,
    current?.gender_identity,
    current?.sex,
  );
  const resolvedBirthDate = pickDate(
    current?.birth_date,
    meta.birth_date,
    current?.date_of_birth,
    current?.dob,
  );
  const resolvedPartner2BirthDate = pickDate(
    current?.partner2_birth_date,
    meta.partner2_birth_date,
  );

  return {
    merged: {
      id: current?.id || userId,
      user_id: userId,
      username: resolvedUsername,
      display_name: resolvedName,
      full_name: resolvedName,
      name: resolvedName,
      avatar_url: avatarUrl,
      banner_url: bannerUrl,
      cover_image_url: bannerUrl,
      bio: current?.bio ?? meta.bio ?? null,
      gender: resolvedGender,
      birth_date: resolvedBirthDate,
      partner2_birth_date: resolvedPartner2BirthDate,
      location_lat: locationLat,
      location_lng: locationLng,
      address_lat: locationLat,
      address_lng: locationLng,
      address_verified: current?.address_verified ?? (locationLat != null && locationLng != null),
      address_cep: addressCep,
      address_city: addressCity,
      tags: tagsSocial,
      tags_social: tagsSocial,
      tags_adult: tagsAdult,
    },
  };
}

/**
 * Faz update se a linha existe; senão insert. Usa apenas a PK `id` para evitar
 * "no unique or exclusion constraint matching the ON CONFLICT specification"
 * em bancos externos que não têm UNIQUE em user_id.
 *
 * Também remove campos não-existentes na tabela (PGRST204 / column not found)
 * tentando novamente sem eles.
 */
async function safeWriteProfile(payload: Record<string, any>, hasExisting: boolean): Promise<void> {
  let attempt = { ...payload };
  const tried = new Set<string>();

  for (let i = 0; i < 12; i++) {
    const op = hasExisting
      ? await (supabase as any).from("profiles").update(attempt).eq("id", attempt.id)
      : await (supabase as any).from("profiles").insert(attempt);

    if (!op.error) return;

    const msg: string = op.error.message || "";
    // Coluna inexistente: "Could not find the 'X' column" / "column \"X\" of relation \"profiles\" does not exist"
    const m =
      msg.match(/Could not find the '([^']+)' column/i) ||
      msg.match(/column "([^"]+)" of relation "profiles" does not exist/i) ||
      msg.match(/column ([a-z0-9_]+) does not exist/i);
    if (m && attempt[m[1]] !== undefined && !tried.has(m[1])) {
      tried.add(m[1]);
      const { [m[1]]: _, ...rest } = attempt;
      attempt = rest;
      continue;
    }
    throw op.error;
  }
}

function getChangedFields(before: Record<string, any> | null, after: Record<string, any> | null): string[] {
  if (!after) return [];

  const fields = [
    { key: "avatar_url", label: "Avatar" },
    { key: "cover_image_url", label: "Banner" },
    { key: "banner_url", label: "Banner" },
    { key: "username", label: "Username" },
    { key: "birth_date", label: "Birth Date" },
    { key: "gender", label: "Gender" },
    { key: "tags_social", label: "Tags Social" },
    { key: "tags_adult", label: "Tags Adult" },
    { key: "address_cep", label: "CEP" },
    { key: "address_city", label: "City" },
    { key: "location_lat", label: "GPS" },
    { key: "location_lng", label: "GPS" },
  ];

  return [...new Set(fields
    .filter(({ key }) => JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after?.[key] ?? null) && hasMeaningfulValue(after?.[key]))
    .map(({ label }) => label))];
}

export async function repairProfile(userId?: string): Promise<RepairProfileResult> {
  const { data: authData } = await supabase.auth.getUser();
  const authUser = authData?.user ?? null;
  const targetUserId = userId || authUser?.id;

  if (!targetUserId) {
    throw new Error("Usuário não autenticado");
  }

  const messages: RepairMessage[] = [];
  let usedRpc = false;
  let usedFallback = false;

  const beforeFetch = await fetchProfileRecord(targetUserId);
  if (beforeFetch.error) throw beforeFetch.error;
  let current = beforeFetch.data;
  let matchedBy = beforeFetch.matchedBy;

  const rpcResult = await supabase.rpc("repair_profile_assets", { p_user_id: targetUserId });
  if (!rpcResult.error) {
    usedRpc = true;
    messages.push({ level: "info", text: "RPC de reparo executado com sucesso." });
  } else {
    usedFallback = true;
    const rpcMsg = rpcResult.error.message || "Falha desconhecida no RPC";
    const schemaCacheMiss = /schema cache|Could not find the function|PGRST202/i.test(rpcMsg);
    messages.push({
      level: schemaCacheMiss ? "warning" : "error",
      text: schemaCacheMiss
        ? "RPC indisponível neste banco; aplicando reparo automático pelo storage e perfil salvo."
        : `RPC falhou: ${rpcMsg}`,
    });
  }

  if (!current && authUser?.id === targetUserId) {
    const ensureAttempt = await supabase.rpc("ensure_my_profile");
    if (!ensureAttempt.error) {
      const ensured = await fetchProfileRecord(targetUserId);
      current = ensured.data;
      matchedBy = ensured.matchedBy;
      if (current) {
        messages.push({ level: "info", text: "Perfil base recriado antes do reparo." });
      }
    }
  }

  const candidateProfiles = await fetchProfileCandidates(targetUserId, authUser, current);
  current = mergeProfileCandidates([current, ...candidateProfiles]);

  const discovered = await discoverProfileAssets(targetUserId);
  if (!discovered.avatarUrl) {
    messages.push({ level: "warning", text: "Nenhum avatar foi encontrado no storage." });
  }
  if (!discovered.bannerUrl) {
    messages.push({ level: "warning", text: "Nenhum banner foi encontrado no storage." });
  }

  const payload = buildProfilePayload(targetUserId, current, authUser, discovered);
  await safeWriteProfile(payload.merged, !!current);

  const afterFetch = await fetchProfileRecord(targetUserId);
  if (afterFetch.error) throw afterFetch.error;

  const repairedFields = getChangedFields(beforeFetch.data, afterFetch.data);

  return {
    updated: repairedFields.length > 0 || !!(rpcResult.data as any)?.updated || !beforeFetch.data,
    matchedBy: afterFetch.matchedBy || matchedBy,
    usedRpc,
    usedFallback,
    profileFound: !!afterFetch.data,
    repairedFields,
    messages,
    before: beforeFetch.data,
    after: afterFetch.data,
  };
}