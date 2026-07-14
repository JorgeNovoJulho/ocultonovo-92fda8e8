import { supabase } from "@/lib/supabaseExternal";
import { isMasterUsernameVariant, MASTER_USERNAME_CANONICAL } from "@/lib/masterUsername";

export interface AvailabilityResult {
  email_taken: boolean;
  username_taken: boolean;
}

export function slugifyUsername(raw: string): string {
  return (raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
}

export const RESERVED_USERNAMES = new Set([
  "admin",
  "administrador",
  "adm",
  "suporte",
  "moderador",
  "oculto",
  "oculto_admin",
  "ocultoadmin",
]);

export function isValidUsername(u: string): string | null {
  if (!u) return "Escolha um nome de usuário.";
  if (u.length < 3) return "Mínimo de 3 caracteres.";
  if (u.length > 30) return "Máximo de 30 caracteres.";
  if (!/^[a-z0-9_]+$/.test(u)) return "Use apenas letras minúsculas, números e _.";

  const lower = u.toLowerCase();
  if (isMasterUsernameVariant(lower) && lower !== MASTER_USERNAME_CANONICAL) {
    return `O username reservado do master é ${MASTER_USERNAME_CANONICAL}.`;
  }
  if (RESERVED_USERNAMES.has(lower) || 
      lower.includes("administrador") || 
      lower.includes("moderador") ||
      (lower.includes("admin") && !isMasterUsernameVariant(lower))) {
    return "Este nome de usuário é reservado ou inválido.";
  }

  return null;
}


/** Server-side check (anon-safe RPC). Falls back to false/false on error. */
export async function checkAvailability(
  email: string,
  username: string
): Promise<AvailabilityResult> {
  if (username && isMasterUsernameVariant(username) && username.trim().toLowerCase() !== MASTER_USERNAME_CANONICAL) {
    return { email_taken: false, username_taken: true };
  }
  try {
    const { data, error } = await supabase.rpc("signup_check_availability", {
      p_email: email?.trim().toLowerCase() || "",
      p_username: username?.trim().toLowerCase() || "",
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return {
      email_taken: !!row?.email_taken,
      username_taken: !!row?.username_taken,
    };
  } catch (err) {
    console.warn("[signupAvailability] RPC failed, fallback only username via profiles:", err);
    // Best-effort fallback: only username via profiles table
    try {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username.toLowerCase())
        .maybeSingle();
      return { email_taken: false, username_taken: !!data?.id };
    } catch {
      return { email_taken: false, username_taken: false };
    }
  }
}

/** Suggest 3 unique, available usernames derived from `seed`. */
export async function suggestUsernames(seed: string): Promise<string[]> {
  const base = slugifyUsername(seed) || "user";
  const candidates: string[] = [];
  const year = new Date().getFullYear().toString().slice(-2);

  // Generate a diverse pool
  const pool: string[] = Array.from(new Set([
    `${base}${Math.floor(10 + Math.random() * 90)}`,
    `${base}_${Math.floor(100 + Math.random() * 900)}`,
    `${base}${year}`,
    `the_${base}`,
    `${base}_real`,
    `${base}.oficial`.replace(".", "_"),
    `${base}${Math.floor(Math.random() * 10000)}`,
  ])).map((u) => slugifyUsername(u)).filter((u) => u.length >= 3);

  for (const u of pool) {
    if (candidates.length >= 3) break;
    const { username_taken } = await checkAvailability("", u);
    if (!username_taken && !candidates.includes(u)) candidates.push(u);
  }

  // Last-resort fillers if RPC failed everywhere
  while (candidates.length < 3) {
    const filler = slugifyUsername(`${base}_${Math.floor(Math.random() * 100000)}`);
    if (!candidates.includes(filler)) candidates.push(filler);
  }
  return candidates;
}
