import { useState, useEffect, useCallback, useRef } from 'react';
import { EXTERNAL_SUPABASE_URL } from '@/lib/appConfig';
import { useAuth } from './useAuth';
import { supabase } from '@/lib/supabaseExternal';
import { toast } from './use-toast';

interface PushServiceWorkerRegistration extends ServiceWorkerRegistration {
  pushManager: PushManager;
}

interface AdminPushState {
  isSupported: boolean;
  permission: NotificationPermission | 'unsupported';
  isEnabled: boolean;
  isLoading: boolean;
  vapidKey: string | null;
  vapidLoading: boolean;
}

export function useAdminPushNotifications() {
  const { user } = useAuth();
  const fetchedRef = useRef(false);

  const [state, setState] = useState<AdminPushState>({
    isSupported: false,
    permission: 'unsupported',
    isEnabled: false,
    isLoading: false,
    vapidKey: null,
    vapidLoading: true,
  });

  // Check browser support (non-blocking)
  useEffect(() => {
    try {
      const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      const inIframe = window.self !== window.top;

      if (!supported || inIframe) {
        setState(prev => ({ ...prev, isSupported: false, permission: 'unsupported', vapidLoading: false }));
        return;
      }

      setState(prev => ({ ...prev, isSupported: true, permission: Notification.permission }));
    } catch {
      setState(prev => ({ ...prev, isSupported: false, vapidLoading: false }));
    }
  }, []);

  // Auto-fetch VAPID key (async, non-blocking)
  useEffect(() => {
    if (!state.isSupported || fetchedRef.current) return;
    fetchedRef.current = true;

    const fetchVapid = async () => {
      try {
        // Call Lovable Cloud edge function directly (not external Supabase)
        const res = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/setup-vapid`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'VAPID fetch failed');
        if (data?.publicKey) {
          setState(prev => ({ ...prev, vapidKey: data.publicKey, vapidLoading: false }));
        } else {
          setState(prev => ({ ...prev, vapidLoading: false }));
        }
      } catch (err) {
        console.warn('[AdminPush] VAPID fetch failed, non-critical:', err);
        setState(prev => ({ ...prev, vapidLoading: false }));
      }
    };

    // Use requestIdleCallback for non-blocking execution
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(fetchVapid);
    } else {
      setTimeout(fetchVapid, 100);
    }
  }, [state.isSupported]);

  // Check existing subscription (async, non-blocking)
  useEffect(() => {
    if (!state.isSupported || !user) return;

    const checkSub = async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          const sub = await (reg as PushServiceWorkerRegistration).pushManager.getSubscription();
          if (sub) {
            setState(prev => ({ ...prev, isEnabled: true }));
          }
        }
      } catch {
        // Silent fail — don't break the app
      }
    };

    checkSub();
  }, [state.isSupported, user]);

  const activate = useCallback(async () => {
    if (!state.isSupported || !user || !state.vapidKey) {
      if (!state.vapidKey) {
        toast({ title: 'VAPID não disponível', description: 'Aguarde a configuração automática.', variant: 'destructive' });
      }
      return false;
    }

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      const permission = await Notification.requestPermission();
      setState(prev => ({ ...prev, permission }));

      if (permission !== 'granted') {
        toast({ title: 'Permissão negada', description: 'Ative as notificações nas configurações do navegador.', variant: 'destructive' });
        return false;
      }

      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

      // Wait for activation
      if (registration.installing) {
        await new Promise<void>(resolve => {
          const sw = registration.installing!;
          sw.addEventListener('statechange', function handler() {
            if (sw.state === 'activated') {
              sw.removeEventListener('statechange', handler);
              resolve();
            }
          });
        });
      }

      const subscription = await (registration as PushServiceWorkerRegistration).pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: state.vapidKey,
      });

      // Save to push_tokens (async, non-blocking for UI)
      const savePromise = supabase.from('push_tokens' as any).upsert({
        user_id: user.id,
        token: JSON.stringify(subscription),
        platform: 'web',
        last_used_at: new Date().toISOString(),
      });
      
      Promise.resolve(savePromise).catch(err => {
        console.error('[AdminPush] token save error:', err);
      });

      setState(prev => ({ ...prev, isEnabled: true }));
      toast({ title: '🔔 Push ativado!', description: 'Você receberá alertas de novas assinaturas e denúncias.' });
      return true;
    } catch (err: any) {
      console.error('[AdminPush]', err);
      toast({ title: 'Erro ao ativar push', description: err?.message || 'Tente novamente.', variant: 'destructive' });
      return false;
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [state.isSupported, state.vapidKey, user]);

  const deactivate = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        const sub = await (reg as PushServiceWorkerRegistration).pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
      }
      if (user) {
        await supabase.from('push_tokens' as any).delete().eq('user_id', user.id);
      }
      setState(prev => ({ ...prev, isEnabled: false }));
      toast({ title: 'Push desativado', description: 'Notificações removidas deste aparelho.' });
    } catch (err) {
      console.error('[AdminPush] deactivate error', err);
    }
  }, [user]);

  const sendTest = useCallback(async () => {
    if (!user) return;
    try {
      // Call Lovable Cloud edge function directly
      const res = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/send-admin-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '🧪 Teste Admin Push',
          body: 'Se você vê isso, o push admin está funcionando!',
          url: '/admin',
          tag: 'admin-test',
          type: 'admin_test',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Send failed');
      toast({ title: 'Teste enviado', description: `Resultado: ${data?.sent || 0} enviado(s)` });
    } catch (err) {
      console.error('[AdminPush] test error', err);
      toast({ title: 'Erro no teste', description: 'Verifique os logs.', variant: 'destructive' });
    }
  }, [user]);

  return {
    ...state,
    vapidConfigured: !!state.vapidKey,
    activate,
    deactivate,
    sendTest,
  };
}
