import { supabase } from "@/lib/supabaseExternal";

type ProfileRow = Record<string, any>;

type PersistProfileOptions = {
  identifiers?: Array<string | null | undefined>;
};

type PersistProfileResult = {
  created: boolean;
  removedColumns: string[];
  profile: ProfileRow | null;
};

const COLUMN_ERROR_PATTERNS = [
  /Could not find the '([^']+)' column/i,
  /column "([^"]+)" of relation "profiles" does not exist/i,
  /column ([a-z0-9_]+) does not exist/i,
];

function compactPayload(payload: ProfileRow) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
}

function extractMissingColumn(message: string) {
  for (const pattern of COLUMN_ERROR_PATTERNS) {
    const match = message.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

async function safeWriteProfile(
  payload: ProfileRow,
  writer: (attempt: ProfileRow) => Promise<{ error: any }>,
) {
  let attempt = compactPayload(payload);
  const removedColumns: string[] = [];

  for (let i = 0; i < 12; i += 1) {
    const result = await writer(attempt);
    if (!result.error) {
      return { removedColumns };
    }

    const missingColumn = extractMissingColumn(result.error.message || "");
    if (missingColumn && missingColumn in attempt) {
      removedColumns.push(missingColumn);
      const { [missingColumn]: _removed, ...rest } = attempt;
      attempt = rest;
      continue;
    }

    throw result.error;
  }

  return { removedColumns };
}

export async function fetchProfileByAuthId(userId: string): Promise<ProfileRow | null> {
  const byUserId = await (supabase as any)
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (byUserId.error) throw byUserId.error;
  if (byUserId.data) return byUserId.data as ProfileRow;

  const byId = await (supabase as any)
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (byId.error) throw byId.error;
  return (byId.data as ProfileRow | null) || null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function persistProfileForUser(
  userId: string,
  payload: ProfileRow,
  options: PersistProfileOptions = {},
): Promise<PersistProfileResult> {
  const allIds = Array.from(
    new Set([userId, ...(options.identifiers || [])].filter((value): value is string => !!value?.trim())),
  );

  // Separar UUIDs (válidos para colunas id/user_id) de demais strings (username).
  // Evita erro "invalid input syntax for type uuid" quando o username vai para id.eq.
  const uuidIds = allIds.filter((v) => UUID_RE.test(v));
  const usernameIds = allIds.filter((v) => !UUID_RE.test(v));

  const filters: string[] = [];
  for (const v of uuidIds) {
    filters.push(`user_id.eq.${v}`, `id.eq.${v}`);
  }
  for (const v of usernameIds) {
    filters.push(`username.eq.${v}`);
  }

  const existingLookup = filters.length
    ? await (supabase as any)
        .from("profiles")
        .select("id, user_id, username, updated_at")
        .or(filters.join(","))
        .order("updated_at", { ascending: false })
        .limit(20)
    : { data: null, error: null };

  if (existingLookup.error) throw existingLookup.error;

  const existingRows = Array.isArray(existingLookup.data) ? existingLookup.data : existingLookup.data ? [existingLookup.data] : [];
  const existingLookupRow =
    existingRows.find((row: any) => row?.user_id === userId) ||
    existingRows.find((row: any) => row?.id === userId) ||
    existingRows[0] ||
    null;

  const basePayload = compactPayload({ ...payload, user_id: userId });
  delete basePayload.id;

  const existingId = existingLookupRow?.id as string | undefined;

  const { removedColumns } = existingId
    ? await safeWriteProfile(basePayload, (attempt) =>
        (supabase as any).from("profiles").update(attempt).eq("id", existingId),
      )
    : await safeWriteProfile(basePayload, (attempt) =>
        (supabase as any).from("profiles").upsert(attempt, { onConflict: "user_id" }),
      );

  const profile = await fetchProfileByAuthId(userId);

  return {
    created: !existingId,
    removedColumns,
    profile,
  };
}