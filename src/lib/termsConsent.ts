/**
 * Persistência local do aceite dos Termos de Uso.
 * Uma única fonte de verdade para Footer, Cookies, Banner +18, Signup e Checkout.
 */

export const TERMS_VERSION = '2026-05-05.5';
export const TERMS_ROUTE = '/legal/termos-de-uso';

const STORAGE_KEY = 'oculto_terms_consent';

export interface StoredTermsConsent {
  version: string;
  acceptedAt: string; // ISO date
  source?: string; // signup | age-banner | checkout | cookie
}

export function getStoredTermsConsent(): StoredTermsConsent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredTermsConsent;
    return parsed?.version ? parsed : null;
  } catch {
    return null;
  }
}

export function hasAcceptedCurrentTerms(): boolean {
  const c = getStoredTermsConsent();
  return !!c && c.version === TERMS_VERSION;
}

export function saveTermsConsent(source: StoredTermsConsent['source'] = 'unknown') {
  const payload: StoredTermsConsent = {
    version: TERMS_VERSION,
    acceptedAt: new Date().toISOString(),
    source,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota errors */
  }
  return payload;
}

export function clearTermsConsent() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
