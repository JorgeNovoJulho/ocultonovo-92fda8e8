import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseExternal';
import { useAuth } from './useAuth';

export interface CookiePreferences {
  essential: boolean; // Sempre true
  analytics: boolean;
  personalization: boolean;
  marketing: boolean;
}

const COOKIE_CONSENT_KEY = 'oculto_cookie_consent';
// Chave própria de visitantes/cookies. Não usar `oculto_session_id`, pois ela
// colidia com o bloqueio de sessão única e podia gerar logout/flicker no feed.
const SESSION_ID_KEY = 'oculto_cookie_session_id';

const defaultPreferences: CookiePreferences = {
  essential: true,
  analytics: false,
  personalization: false,
  marketing: false,
};

// Gerar ID de sessão único para visitantes não logados
function generateSessionId(): string {
  return 'session_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

export function useCookieConsent() {
  const { user, loading: authLoading } = useAuth();
  const [preferences, setPreferences] = useState<CookiePreferences>(() => {
    // Checar localStorage de forma síncrona para evitar flash do banner
    try {
      const stored = localStorage.getItem(COOKIE_CONSENT_KEY);
      if (stored) return JSON.parse(stored);
    } catch {}
    return defaultPreferences;
  });
  const [hasConsented, setHasConsented] = useState<boolean>(() => {
    try { return !!localStorage.getItem(COOKIE_CONSENT_KEY); } catch { return false; }
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  // Inicializa sincronicamente: se já consentiu, NUNCA mostra o banner
  const [showBanner, setShowBanner] = useState<boolean>(() => {
    try { return !localStorage.getItem(COOKIE_CONSENT_KEY); } catch { return true; }
  });

  // Carregar preferências do localStorage ou Supabase
  useEffect(() => {
    // Não rodar enquanto auth está carregando
    if (authLoading) return;

    // Se já temos consentimento local, NUNCA reexibir o banner
    // (independente do que o backend tenha — localStorage é a fonte de verdade do device)
    const localConsentEarly = (() => { try { return localStorage.getItem(COOKIE_CONSENT_KEY); } catch { return null; } })();
    if (localConsentEarly) {
      try {
        const parsed = JSON.parse(localConsentEarly);
        setPreferences(parsed);
      } catch { /* ignore */ }
      setHasConsented(true);
      setShowBanner(false);
      setIsLoading(false);
      return;
    }

    async function loadPreferences() {
      setIsLoading(true);

      // Primeiro verificar localStorage
      const localConsent = localStorage.getItem(COOKIE_CONSENT_KEY);
      
      if (localConsent) {
        try {
          const parsed = JSON.parse(localConsent);
          setPreferences(parsed);
          setHasConsented(true);
          setShowBanner(false);
          setIsLoading(false);
          return;
        } catch {
          // Continuar para buscar do banco
        }
      }

      // Se usuário está logado, buscar do Supabase
      if (user) {
        try {
          const { data } = await (supabase as any)
            .from('cookie_consents')
            .select('*')
            .eq('user_id', user.id)
            .single();

          if (data) {
            const prefs: CookiePreferences = {
              essential: true,
              analytics: data.analytics,
              personalization: data.personalization,
              marketing: data.marketing,
            };
            setPreferences(prefs);
            setHasConsented(true);
            setShowBanner(false);
            
            // Salvar no localStorage também
            localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(prefs));
          } else {
            setShowBanner(true);
          }
        } catch (error) {
          console.error('[CookieConsent] Erro ao carregar preferências:', error);
          setShowBanner(true);
        }
      } else {
        // Usuário não logado, mostrar banner
        setShowBanner(true);
      }

      setIsLoading(false);
    }

    loadPreferences();
  }, [user, authLoading]);

  // Salvar preferências
  const savePreferences = useCallback(async (newPreferences: CookiePreferences) => {
    const prefs = { ...newPreferences, essential: true }; // Essential sempre true
    
    // Salvar no localStorage
    localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(prefs));
    setPreferences(prefs);
    setHasConsented(true);
    setShowBanner(false);

    // Se usuário está logado, salvar no Supabase
    if (user) {
      try {
        await (supabase as any)
          .from('cookie_consents')
          .upsert({
            user_id: user.id,
            essential: true,
            analytics: prefs.analytics,
            personalization: prefs.personalization,
            marketing: prefs.marketing,
            consented_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });
      } catch (error) {
        console.error('[CookieConsent] Erro ao salvar preferências:', error);
      }
    } else {
      // Visitante não logado - salvar com session_id
      let sessionId = localStorage.getItem(SESSION_ID_KEY);
      if (!sessionId) {
        sessionId = generateSessionId();
        localStorage.setItem(SESSION_ID_KEY, sessionId);
      }

      try {
        await (supabase as any)
          .from('cookie_consents')
          .upsert({
            session_id: sessionId,
            essential: true,
            analytics: prefs.analytics,
            personalization: prefs.personalization,
            marketing: prefs.marketing,
            consented_at: new Date().toISOString(),
          }, { onConflict: 'session_id' });
      } catch (error) {
        console.error('[CookieConsent] Erro ao salvar preferências (sessão):', error);
      }
    }
  }, [user]);

  // Aceitar todos os cookies
  const acceptAll = useCallback(() => {
    savePreferences({
      essential: true,
      analytics: true,
      personalization: true,
      marketing: true,
    });
  }, [savePreferences]);

  // Aceitar apenas essenciais
  const acceptEssentialOnly = useCallback(() => {
    savePreferences({
      essential: true,
      analytics: false,
      personalization: false,
      marketing: false,
    });
  }, [savePreferences]);

  // Resetar preferências (para debugging ou re-consentimento)
  const resetConsent = useCallback(() => {
    localStorage.removeItem(COOKIE_CONSENT_KEY);
    setPreferences(defaultPreferences);
    setHasConsented(false);
    setShowBanner(true);
  }, []);

  return {
    preferences,
    hasConsented,
    isLoading,
    showBanner,
    setShowBanner,
    savePreferences,
    acceptAll,
    acceptEssentialOnly,
    resetConsent,
  };
}
