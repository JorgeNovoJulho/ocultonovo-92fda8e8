import { supabase } from "@/lib/supabaseExternal";

const FOLLOW_TABLE_CANDIDATES = ["followers", "follows"] as const;

type FollowRecord = {
  id: string;
  follower_id: string;
  following_id: string;
  created_at?: string | null;
};

type FollowIdInput = string | string[];

function isMissingTableError(error: any) {
  return error?.code === "PGRST205" || /schema cache|Could not find the table/i.test(error?.message || "");
}

function isBrokenFollowerNotificationTrigger(error: any) {
  return error?.code === "42703" && /actor_id/.test(error?.message || "");
}

function shouldTryNextTable(error: any) {
  return isMissingTableError(error) || isBrokenFollowerNotificationTrigger(error);
}

function normalizeFollowIds(input: FollowIdInput) {
  return [...new Set((Array.isArray(input) ? input : [input]).filter(Boolean))];
}

function buildFollowPairFilters(followerIds: string[], followingIds: string[]) {
  return followerIds.flatMap((followerId) =>
    followingIds.map((followingId) => `and(follower_id.eq.${followerId},following_id.eq.${followingId})`)
  );
}

function isDuplicateFollowError(error: any) {
  return error?.code === '23505' || /duplicate key/i.test(error?.message || '');
}

function isRowLevelSecurityError(error: any) {
  return error?.code === '42501' || /row-level security|permission denied/i.test(error?.message || '');
}

function isRecoverableFollowWriteError(error: any) {
  return shouldTryNextTable(error) || isRowLevelSecurityError(error) || error?.code === '23503' || /foreign key/i.test(error?.message || '');
}

async function tryTables<T>(runner: (table: typeof FOLLOW_TABLE_CANDIDATES[number]) => Promise<{ data: T | null; error: any }>) {
  let lastError: any = null;

  for (const table of FOLLOW_TABLE_CANDIDATES) {
    const result = await runner(table);
    if (!result.error) return result;

    lastError = result.error;
    if (shouldTryNextTable(result.error)) continue;
    return result;
  }

  return { data: null, error: lastError };
}

export async function selectFollowMaybeSingle(followerId: FollowIdInput, followingId: FollowIdInput) {
  const followerIds = normalizeFollowIds(followerId);
  const followingIds = normalizeFollowIds(followingId);

  if (followerIds.length === 0 || followingIds.length === 0) {
    return { data: null, error: null };
  }

  const filters = buildFollowPairFilters(followerIds, followingIds);

  return tryTables<Pick<FollowRecord, "id">>((table) =>
    (supabase as any)
      .from(table)
      .select("id")
      .or(filters.join(','))
      .limit(1)
      .maybeSingle()
  );
}

export async function insertFollow(followerId: FollowIdInput, followingId: FollowIdInput) {
  const followerIds = normalizeFollowIds(followerId);
  const followingIds = normalizeFollowIds(followingId);

  if (followerIds.length === 0 || followingIds.length === 0) {
    return { data: null, error: new Error('Missing follow identifiers') };
  }

  let lastError: any = null;

  for (const table of FOLLOW_TABLE_CANDIDATES) {
    for (const currentFollowerId of followerIds) {
      for (const currentFollowingId of followingIds) {
        const result = await (supabase as any)
          .from(table)
          .insert({ follower_id: currentFollowerId, following_id: currentFollowingId });

        if (!result.error) return { data: null, error: null };
        if (isDuplicateFollowError(result.error)) {
          return { data: null, error: null };
        }

        lastError = result.error;
        if (isRecoverableFollowWriteError(result.error)) continue;
        return result;
      }
    }
  }

  return { data: null, error: lastError };
}

export async function deleteFollow(followerId: FollowIdInput, followingId: FollowIdInput) {
  const followerIds = normalizeFollowIds(followerId);
  const followingIds = normalizeFollowIds(followingId);

  if (followerIds.length === 0 || followingIds.length === 0) {
    return { data: null, error: null };
  }

  const filters = buildFollowPairFilters(followerIds, followingIds);

  return tryTables<null>((table) =>
    (supabase as any)
      .from(table)
      .delete()
      .or(filters.join(','))
  );
}

export async function selectFollowingIds(followerId: string) {
  return tryTables<Array<Pick<FollowRecord, "following_id">>>((table) =>
    (supabase as any)
      .from(table)
      .select("following_id")
      .eq("follower_id", followerId)
  );
}

export async function selectFollowerIdsFollowingTarget(followerIds: string[], targetProfileId: string) {
  const normalizedFollowerIds = normalizeFollowIds(followerIds);

  if (normalizedFollowerIds.length === 0 || !targetProfileId) {
    return { data: [] as Array<Pick<FollowRecord, "follower_id">>, error: null };
  }

  return tryTables<Array<Pick<FollowRecord, "follower_id">>>((table) =>
    (supabase as any)
      .from(table)
      .select("follower_id")
      .eq("following_id", targetProfileId)
      .in("follower_id", normalizedFollowerIds)
  );
}

export async function selectFollowers(profileId: string) {
  return tryTables<Array<Pick<FollowRecord, "follower_id" | "created_at">>>((table) =>
    (supabase as any)
      .from(table)
      .select("follower_id, created_at")
      .eq("following_id", profileId)
      .order("created_at", { ascending: false })
  );
}

export async function selectFollowing(profileId: string) {
  return tryTables<Array<Pick<FollowRecord, "following_id" | "created_at">>>((table) =>
    (supabase as any)
      .from(table)
      .select("following_id, created_at")
      .eq("follower_id", profileId)
      .order("created_at", { ascending: false })
  );
}

export async function countFollowers(profileId: string) {
  return tryTables<any>((table) =>
    (supabase as any)
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("following_id", profileId)
  );
}

export async function countFollowing(profileId: string) {
  return tryTables<any>((table) =>
    (supabase as any)
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("follower_id", profileId)
  );
}

export async function selectFollowRowsWithProfiles(mode: "followers" | "following", fetchedProfileId: string) {
  const filterColumn = mode === "followers" ? "following_id" : "follower_id";
  const profileColumn = mode === "followers" ? "follower_id" : "following_id";
  const aliasKey = mode === "followers" ? "follower" : "following";

  const rowsRes = await tryTables<any[]>((table) =>
    (supabase as any)
      .from(table)
      .select("id, created_at, follower_id, following_id")
      .eq(filterColumn, fetchedProfileId)
      .order("created_at", { ascending: false })
  );

  const rows = (rowsRes?.data || []) as any[];
  if (rows.length === 0) return rowsRes;

  const profileIds = [...new Set(rows.map((r) => r[profileColumn]).filter(Boolean))];
  const { data: profiles } = profileIds.length
    ? await (supabase as any)
        .from("profiles")
        .select("id, name, username, avatar_url, plan_type, is_verified")
        .in("id", profileIds)
    : { data: [] as any[] };
  const profileMap = new Map<string, any>((profiles || []).map((p: any) => [p.id, p]));

  const enriched = rows.map((r) => ({ ...r, [aliasKey]: profileMap.get(r[profileColumn]) || null }));
  return { ...rowsRes, data: enriched };
}

export async function deleteFollowById(followId: string) {
  return tryTables<null>((table) =>
    (supabase as any)
      .from(table)
      .delete()
      .eq("id", followId)
  );
}
