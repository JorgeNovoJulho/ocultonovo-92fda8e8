import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseExternal";
import { normalizePublicStorageUrl } from "@/lib/storageUrl";
import { normalizeActorLookupKey } from "@/lib/notificationActors";

export interface ActorProfile {
  id: string;
  user_id: string | null;
  username: string | null;
  display_name: string | null;
  name: string | null;
  profile_type: string | null;
  address_city: string | null;
  address_state: string | null;
  avatar_url: string | null;
}

const cache = new Map<string, ActorProfile | null>();
const pendingRequests = new Map<string, Promise<Record<string, ActorProfile | null>>>();

function buildProfileLookupKeys(profile: ActorProfile): string[] {
  return [
    profile.id,
    profile.user_id,
    profile.username,
    profile.display_name,
    profile.name,
    normalizeActorLookupKey(profile.username),
    normalizeActorLookupKey(profile.display_name),
    normalizeActorLookupKey(profile.name),
  ].filter((value): value is string => !!value);
}

function cacheProfile(profile: ActorProfile | null, lookupKey?: string | null) {
  if (!profile) {
    if (lookupKey) cache.set(lookupKey, null);
    return;
  }

  buildProfileLookupKeys(profile).forEach((key) => cache.set(key, profile));
  if (lookupKey) cache.set(lookupKey, profile);
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function resolveActorAvatarUrl(avatarUrl?: string | null): string | null {
  return normalizePublicStorageUrl(avatarUrl, "avatars");
}

function normalizeActorProfile(profile: any): ActorProfile | null {
  if (!profile) return null;

  return {
    ...profile,
    display_name: profile.display_name ?? profile.name ?? profile.username ?? null,
    avatar_url: resolveActorAvatarUrl(profile.avatar_url),
  } as ActorProfile;
}

/**
 * Busca em batch perfis dos actor_ids para uso em listas (notificações, etc).
 * Faz cache em memória para evitar refetch.
 * Procura por id e user_id (fallback duplo).
 */
export function useActorProfiles(actorIds: (string | null | undefined)[]) {
  const [profiles, setProfiles] = useState<Record<string, ActorProfile | null>>(
    {},
  );

  // Lista única de ids válidos
  const ids = Array.from(
    new Set(actorIds.filter((x): x is string => !!x && typeof x === "string")),
  );
  const cacheKey = ids.sort().join(",");

  useEffect(() => {
    if (!ids.length) return;

    const missing = ids.filter((id) => !cache.has(id));

    // Hidrata o estado a partir do cache imediatamente
    const initial: Record<string, ActorProfile | null> = {};
    ids.forEach((id) => {
      if (cache.has(id)) initial[id] = cache.get(id) ?? null;
    });
    if (Object.keys(initial).length) {
      setProfiles((prev) => ({ ...prev, ...initial }));
    }

    if (!missing.length) return;

    let cancelled = false;
    const requestKey = missing.slice().sort().join(",");

    const fetchMissingProfiles = async () => {
      try {
        const uuidIds = missing.filter(isUuidLike);
        const textKeys = missing.filter((value) => !isUuidLike(value));
        const filters: string[] = [];

        if (uuidIds.length) {
          const inList = uuidIds.join(",");
          filters.push(`id.in.(${inList})`, `user_id.in.(${inList})`);
        }

        textKeys.forEach((value) => {
          filters.push(`username.ilike.${value}`, `name.ilike.${value}`);
        });

        const orFilter = filters.join(",");
        if (!orFilter) {
          return Object.fromEntries(missing.map((mid) => [mid, null])) as Record<string, ActorProfile | null>;
        }

        const { data, error } = await (supabase as any)
          .from("profiles")
          .select(
            "id, user_id, username, name, profile_type, address_city, address_state, avatar_url",
          )
          .or(orFilter);

        if (error) throw error;

        const next: Record<string, ActorProfile | null> = {};
        const normalizedRows = (data || []).map((profile: any) => normalizeActorProfile(profile)).filter(Boolean) as ActorProfile[];

        normalizedRows.forEach((profile) => {
          cacheProfile(profile);
        });

        missing.forEach((mid) => {
          const normalizedMid = normalizeActorLookupKey(mid);
          const found = normalizedRows.find((p) =>
            buildProfileLookupKeys(p).includes(mid) ||
            (!!normalizedMid && buildProfileLookupKeys(p).includes(normalizedMid)),
          ) || null;
          cacheProfile(found, mid);
          next[mid] = found;
        });
        return next;
      } catch (e) {
        try {
          const results = await Promise.all(
            missing.map(async (mid) => {
              const filter = isUuidLike(mid)
                ? `id.eq.${mid},user_id.eq.${mid}`
                : `username.ilike.${mid},name.ilike.${mid}`;
              const { data: row } = await (supabase as any)
                .from("profiles")
                .select(
                  "id, user_id, username, name, profile_type, address_city, address_state, avatar_url",
                )
                .or(filter)
                .limit(1)
                .maybeSingle();
              const normalizedRow = normalizeActorProfile(row);
              cacheProfile(normalizedRow, mid);
              return [mid, normalizedRow] as const;
            }),
          );

          const next: Record<string, ActorProfile | null> = {};
          results.forEach(([mid, row]) => {
            cacheProfile(row, mid);
            next[mid] = row;
          });
          return next;
        } catch {
          missing.forEach((mid) => cache.set(mid, null));
          return Object.fromEntries(missing.map((mid) => [mid, null])) as Record<string, ActorProfile | null>;
        }
      }
    };

    const request = pendingRequests.get(requestKey) || fetchMissingProfiles();
    pendingRequests.set(requestKey, request);

    request
      .then((next) => {
        if (cancelled) return;
        setProfiles((prev) => ({ ...prev, ...next }));
      })
      .finally(() => {
        pendingRequests.delete(requestKey);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  return profiles;
}

const TYPE_LABELS: Record<string, { label: string; emoji: string }> = {
  couple: { label: "Casal", emoji: "👫" },
  casal: { label: "Casal", emoji: "👫" },
  male: { label: "Homem", emoji: "👨" },
  homem: { label: "Homem", emoji: "👨" },
  man: { label: "Homem", emoji: "👨" },
  female: { label: "Mulher", emoji: "👩" },
  mulher: { label: "Mulher", emoji: "👩" },
  woman: { label: "Mulher", emoji: "👩" },
  trans: { label: "Trans", emoji: "⚧️" },
  travesti: { label: "Trans", emoji: "⚧️" },
  trav: { label: "Trans", emoji: "⚧️" },
};

export function getProfileTypeLabel(profileType: string | null | undefined): {
  label: string;
  emoji: string;
} | null {
  if (!profileType) return null;
  const key = profileType.toLowerCase().trim();
  return TYPE_LABELS[key] || null;
}

export type ProfileTypeKey = 'couple' | 'male' | 'female' | 'trans';

export function normalizeProfileType(
  profileType: string | null | undefined,
): ProfileTypeKey | null {
  if (!profileType) return null;
  const key = profileType.toLowerCase().trim();
  if (['couple', 'casal'].includes(key)) return 'couple';
  if (['male', 'homem', 'man'].includes(key)) return 'male';
  if (['female', 'mulher', 'woman'].includes(key)) return 'female';
  if (['trans', 'travesti', 'trav'].includes(key)) return 'trans';
  return null;
}

