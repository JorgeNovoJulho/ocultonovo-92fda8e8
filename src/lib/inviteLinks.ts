import { appUrl, getShareBaseUrl } from '@/lib/appConfig';

export function normalizeCreatorInviteCode(value: string | null | undefined): string | null {
  const normalized = (value || '')
    .trim()
    .replace(/^@+/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized ? normalized.toUpperCase() : null;
}

export function compactCreatorInviteCode(value: string | null | undefined): string | null {
  const compact = (value || '')
    .trim()
    .replace(/^@+/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '');

  return compact ? compact.toUpperCase() : null;
}

export function getCreatorInviteCodeVariants(value: string | null | undefined): string[] {
  const raw = (value || '').trim().replace(/^@+/, '');
  const normalized = normalizeCreatorInviteCode(raw);
  const compact = compactCreatorInviteCode(raw);

  return Array.from(new Set([raw, normalized, normalized?.toLowerCase(), compact, compact?.toLowerCase()].filter(Boolean))) as string[];
}

export function buildCreatorInvitePath(code: string | null | undefined): string | null {
  const normalized = normalizeCreatorInviteCode(code);
  return normalized ? `/creator-invite/${encodeURIComponent(normalized)}` : null;
}

export function buildCreatorInviteUrl(code: string | null | undefined): string | null {
  const path = buildCreatorInvitePath(code);
  return path ? appUrl(path) : null;
}

export function buildCreatorInviteShareUrl(code: string | null | undefined): string | null {
  const path = buildCreatorInvitePath(code);
  return path ? `${getShareBaseUrl().replace(/\/$/, '')}${path}` : null;
}
