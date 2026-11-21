import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    install,
  };
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  return isOnline;
}

export interface LiveToast {
  id: string;
  title: string;
  body: string;
  timestamp: string;
}

export function useRealtimePush(subscribedPlayerIds: string[]) {
  const [pushEnabled, setPushEnabled] = useState(
    typeof Notification !== 'undefined' && Notification.permission === 'granted'
  );
  const [toasts, setToasts] = useState<LiveToast[]>([]);
  const [wsConnected, setWsConnected] = useState(false);

  const requestPushPermission = async () => {
    if (typeof Notification === 'undefined') return false;
    const perm = await Notification.requestPermission();
    const granted = perm === 'granted';
    setPushEnabled(granted);
    if (granted && 'serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification('PlayPy · Alertas activadas', {
          body: 'Recibirás notificaciones en tiempo real sobre próximos partidos y resultados.',
          icon: '/pwa-192x192.png',
        });
      } catch {
        // Fallback if SW notification restricted
      }
    }
    return granted;
  };

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let closedByUnmount = false;

    const connect = () => {
      if (closedByUnmount) return;
      socket = new WebSocket(wsUrl);
      socket.onopen = () => setWsConnected(true);
      socket.onclose = () => {
        setWsConnected(false);
        if (!closedByUnmount) {
          reconnectTimer = window.setTimeout(connect, 3000);
        }
      };
      socket.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data) as {
            type: string;
            title?: string;
            body?: string;
            targetPlayerIds?: string[];
            timestamp?: string;
          };
          if (data.type === 'connection:ready' || !data.title || !data.body) return;

          const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          setToasts((prev) => [
            { id, title: data.title!, body: data.body!, timestamp: data.timestamp || new Date().toISOString() },
            ...prev.slice(0, 4),
          ]);

          const isRelevant =
            subscribedPlayerIds.length === 0 ||
            !data.targetPlayerIds ||
            data.targetPlayerIds.length === 0 ||
            data.targetPlayerIds.some((pid) => subscribedPlayerIds.includes(pid));

          if (isRelevant && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            if ('serviceWorker' in navigator) {
              const reg = await navigator.serviceWorker.ready;
              await reg.showNotification(data.title, {
                body: data.body,
                icon: '/pwa-192x192.png',
              });
            } else {
              new Notification(data.title, { body: data.body });
            }
          }
        } catch {
          // Ignore malformed WS message
        }
      };
    };

    connect();
    return () => {
      closedByUnmount = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [subscribedPlayerIds]);

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return {
    pushEnabled,
    requestPushPermission,
    toasts,
    dismissToast,
    wsConnected,
  };
}
