import { useEffect, useRef } from 'react';
import { usePushNotifications } from '@/hooks/usePushNotifications';

/**
 * Silent component that requests push notification permission
 * once per admin session. Ultra-light for Realme C55 battery.
 */
export function AdminPushPrompt() {
  const { isSupported, permission, vapidConfigured, requestPermission } = usePushNotifications();
  const prompted = useRef(false);

  useEffect(() => {
    if (prompted.current) return;
    if (!isSupported || !vapidConfigured) return;
    if (permission !== 'default') return; // already granted or denied

    // Small delay so it doesn't block initial render
    const timer = setTimeout(() => {
      prompted.current = true;
      requestPermission();
    }, 3000);

    return () => clearTimeout(timer);
  }, [isSupported, vapidConfigured, permission, requestPermission]);

  return null; // Invisible component
}
