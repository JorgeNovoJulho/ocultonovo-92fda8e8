export const MASTER_USERNAME_CANONICAL = "oculto_master";
export const MASTER_EMAIL_CANONICAL = "ocultomaster@gmail.com";
const MASTER_USERNAME_NORMALIZED = "ocultomaster";

export function normalizeMasterComparable(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

export function isMasterUsernameVariant(value: unknown): boolean {
  return normalizeMasterComparable(value) === MASTER_USERNAME_NORMALIZED;
}

export function getMasterHandleLabel(): string {
  return `@${MASTER_USERNAME_CANONICAL}`;
}
