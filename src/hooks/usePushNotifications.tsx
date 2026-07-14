import { useEffect, useState, useCallback } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/lib/supabaseExternal';
import { useSettingValue } from './useSystemSettings';
import { toast } from './use-toast';
import { logger } from '@/lib/logger';

// Extend ServiceWorkerRegistration to include pushManager
interface PushServiceWorkerRegistration extends ServiceWorkerRegistration {
  pushManager: PushManager;
}

interface PushNotificationState {
  permission: NotificationPermission | 'unsupported';
  isSupported: boolean;
  isEnabled: boolean;
  isLoading: boolean;
  isInIframe: boolean;
}

export function usePushNotifications() {
  const { user } = useAuth();
  const vapidPublicKey = useSettingValue<string>('vapid_public_key', '');
  const vapidEnabled = useSettingValue<boolean>('vapid_enabled', false);
  
  const [state, setState] = useState<PushNotificationState>({
    permission: 'default',
    isSupported: false,
    isEnabled: false,
    isLoading: false,
    isInIframe: false,
  });

  useEffect(() => {
    const isSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    const isInIframe = window.self !== window.top;
    
    const currentPermission = isSupported ? Notification.permission : 'unsupported';
    
    setState(prev => ({
      ...prev,
      isSupported,
      isInIframe,
      permission: currentPermission,
    }));

    // Verificar se já tem subscription
    if (isSupported && user) {
      checkExistingSubscription();
    }

    // Poll permission changes every second
    if (isSupported) {
      const interval = setInterval(() => {
        const perm = Notification.permission;
        setState(prev => {
          if (prev.permission !== perm) {
            logger.log('[Push] Permission changed:', prev.permission, '->', perm);
            return { ...prev, permission: perm };
          }
          return prev;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const checkExistingSubscription = async () => {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        const subscription = await (registration as PushServiceWorkerRegistration).pushManager.getSubscription();
        setState(prev => ({ ...prev, isEnabled: !!subscription }));
      }
    } catch (error) {
      console.error('Error checking push subscription:', error);
    }
  };

  const registerServiceWorker = async () => {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service Worker não suportado');
    }

    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    // Aguardar ativação
    if (registration.installing) {
      await new Promise<void>((resolve) => {
        registration.installing!.addEventListener('statechange', function(this: ServiceWorker) {
          if (this.state === 'activated') {
            resolve();
          }
        });
      });
    }

    return registration;
  };

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!state.isSupported) {
      toast({
        title: 'Não suportado',
        description: 'Seu navegador não suporta notificações push.',
        variant: 'destructive',
      });
      return false;
    }

    if (!vapidEnabled || !vapidPublicKey) {
      toast({
        title: 'Notificações desabilitadas',
        description: 'O administrador ainda não configurou as notificações push.',
        variant: 'destructive',
      });
      return false;
    }

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      // Always try to request - browser may have been updated
      const permission = await Notification.requestPermission();
      logger.log('[Push] Permission result:', permission);
      setState(prev => ({ ...prev, permission }));

      if (permission !== 'granted') {
        toast({
          title: 'Permissão negada',
          description: 'Você precisa permitir notificações para receber alertas.',
          variant: 'destructive',
        });
        return false;
      }

      // Registrar service worker e criar subscription
      const registration = await registerServiceWorker();
      
      const subscription = await (registration as PushServiceWorkerRegistration).pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidPublicKey,
      });

      // Salvar token no banco
      if (user) {
        await supabase.from('push_tokens' as any).upsert({
          user_id: user.id,
          token: JSON.stringify(subscription),
          platform: 'web',
          last_used_at: new Date().toISOString(),
        });
      }

      setState(prev => ({ ...prev, isEnabled: true }));
      
      toast({
        title: '🔔 Notificações ativadas!',
        description: 'Você receberá alertas mesmo com o app fechado.',
      });

      return true;
    } catch (error: any) {
      console.error('Push notification error:', error);
      toast({
        title: 'Erro ao ativar notificações',
        description: error.message || 'Tente novamente mais tarde.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [state.isSupported, vapidEnabled, vapidPublicKey, user]);

  const disableNotifications = useCallback(async () => {
    if (!state.isSupported) return;

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        const subscription = await (registration as PushServiceWorkerRegistration).pushManager.getSubscription();
        if (subscription) {
          await subscription.unsubscribe();
        }
      }

      // Remover token do banco
      if (user) {
        await supabase.from('push_tokens' as any).delete().eq('user_id', user.id);
      }

      setState(prev => ({ ...prev, isEnabled: false }));
      
      toast({
        title: 'Notificações desativadas',
        description: 'Você não receberá mais alertas push.',
      });
    } catch (error) {
      console.error('Error disabling push:', error);
    }
  }, [state.isSupported, user]);

  const sendTestNotification = useCallback(async () => {
    if (!user) return;

    try {
      await supabase.functions.invoke('send-push-notification', {
        body: {
          user_id: user.id,
          title: '🧪 Teste de Notificação',
          body: 'Se você está vendo isso, as notificações estão funcionando!',
          url: '/notifications',
        },
      });

      toast({
        title: 'Notificação enviada',
        description: 'Verifique se recebeu a notificação de teste.',
      });
    } catch (error) {
      console.error('Test notification error:', error);
    }
  }, [user]);

  return {
    ...state,
    requestPermission,
    disableNotifications,
    sendTestNotification,
    vapidConfigured: vapidEnabled && !!vapidPublicKey,
  };
}

// Função removida - não necessária, o browser aceita string base64 diretamente
