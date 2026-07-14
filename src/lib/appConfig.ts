/**
 * Centralized app configuration.
 * All environment-dependent values should be sourced from here
 * to ensure full portability across deployments.
 */

/** The canonical public URL of the application */
export const APP_URL = 'https://ocultoswing.com.br';

/** Stable Lovable preview URL allowed in the external auth redirect list. */
export const LOVABLE_PREVIEW_URL = 'https://id-preview--1d65ae60-fb47-4778-9540-6a3d59bdb670.lovable.app';

/** Published Lovable URL allowed in the external auth redirect list. */
export const LOVABLE_PUBLISHED_URL = 'https://oculta-gems.lovable.app';


/**
 * EXTERNAL Supabase project (rvybbrkzmboqbhcemqar) — única fonte de verdade.
 * Toda persistência, storage, auth e edge functions devem usar este endpoint.
 */
export const EXTERNAL_SUPABASE_URL = 'https://rvybbrkzmboqbhcemqar.supabase.co';
export const EXTERNAL_SUPABASE_PROJECT_ID = 'rvybbrkzmboqbhcemqar';

/**
 * Anon key publishable do projeto externo (rvybbrkzmboqbhcemqar).
 * Hardcoded para garantir independência total do .env do Lovable Cloud interno.
 * Esta chave é segura para uso no frontend (RLS protege os dados).
 */
export const EXTERNAL_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2eWJicmt6bWJvcWJoY2VtcWFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNTUyNjcsImV4cCI6MjA4NjczMTI2N30.p0ZNW9nUB0qQcY6ypNLtPSy5MyZd8W5idMJv4C6AWcc';

/** Supabase Edge Functions base URL (sempre externo) */
export const FUNCTIONS_URL = `${EXTERNAL_SUPABASE_URL}/functions/v1`;

/** Build a full app URL from a path */
export function appUrl(path: string): string {
  const base = APP_URL.replace(/\/$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

/** Runtime public origin that never leaks Lovable's internal live-preview host into OAuth redirects. */
export function getPublicAppOrigin(): string {
  if (typeof window === 'undefined') return APP_URL;

  const { hostname, origin } = window.location;

  if (hostname.includes('lovableproject.com')) return LOVABLE_PREVIEW_URL;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return 'http://localhost:5173';
  if (hostname === 'www.ocultoswing.com.br') return APP_URL;

  return origin;
}

/** Build auth redirect URLs using only domains that are expected in Auth → Redirect URLs. */
export function getAuthRedirectUrl(path = '/auth/callback'): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${getPublicAppOrigin().replace(/\/$/, '')}${cleanPath}`;
}

/** Build a canonical share URL, optionally with cache-busting version */
export function buildShareUrl(path: string, version?: string | number | null): string {
  const url = new URL(appUrl(path));
  if (/^\/c\//.test(url.pathname) && version === undefined) {
    url.searchParams.set('v', '2');
    return url.toString();
  }
  if (version !== null && version !== undefined && String(version).trim()) {
    url.searchParams.set('v', String(version));
  }
  return url.toString();
}

/** Get the best base URL for share links */
export function getShareBaseUrl(): string {
  // In production or preview, use the canonical APP_URL
  if (
    typeof window !== 'undefined' &&
    !window.location.hostname.includes('localhost')
  ) {
    return APP_URL;
  }
  return typeof window !== 'undefined' ? window.location.origin : APP_URL;
}
