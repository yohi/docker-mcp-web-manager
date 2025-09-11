import { useEffect, useRef, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';

export interface Notification {
  type: string;
  title: string;
  message: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  timestamp: string;
  data?: any;
}

interface SSEMessage {
  type: 'connected' | 'heartbeat' | 'notification' | 'broadcast';
  data: any;
}

interface UseNotificationsOptions {
  autoConnect?: boolean;
  showToast?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export function useNotifications(options: UseNotificationsOptions = {}) {
  const {
    autoConnect = true,
    showToast = true,
    reconnectInterval = 5000,
    maxReconnectAttempts = 5,
  } = options;

  const { data: session, status } = useSession();
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [connectionStats, setConnectionStats] = useState<any>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  // 通知ハンドラー
  const handleNotification = useCallback((notification: Notification) => {
    setNotifications(prev => [notification, ...prev.slice(0, 99)]); // 最新100件まで保持

    // Toast通知を表示
    if (showToast) {
      switch (notification.severity) {
        case 'error':
          toast.error(notification.title, {
            description: notification.message,
          });
          break;
        case 'warning':
          toast.warning(notification.title, {
            description: notification.message,
          });
          break;
        case 'success':
          toast.success(notification.title, {
            description: notification.message,
          });
          break;
        default:
          toast.info(notification.title, {
            description: notification.message,
          });
      }
    }
  }, [showToast]);

  // SSE接続の確立
  const connect = useCallback(() => {
    if (!session || status !== 'authenticated') {
      return;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      const eventSource = new EventSource('/api/v1/notifications/sse');
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsConnected(true);
        setConnectionError(null);
        reconnectAttempts.current = 0;
        console.log('SSE接続が確立されました');
      };

      eventSource.onmessage = (event) => {
        try {
          const message: SSEMessage = JSON.parse(event.data);
          
          switch (message.type) {
            case 'connected':
              console.log('SSE接続確認:', message.data);
              break;
            
            case 'heartbeat':
              setConnectionStats(message.data);
              break;
            
            case 'notification':
            case 'broadcast':
              handleNotification(message.data);
              break;
          }
        } catch (error) {
          console.error('SSEメッセージパースエラー:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE接続エラー:', error);
        setIsConnected(false);
        setConnectionError('接続エラーが発生しました');

        // 自動再接続
        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log(`SSE再接続試行 ${reconnectAttempts.current}/${maxReconnectAttempts}`);
            connect();
          }, reconnectInterval);
        } else {
          setConnectionError(`接続に失敗しました（${maxReconnectAttempts}回試行）`);
        }
      };

    } catch (error) {
      console.error('SSE接続初期化エラー:', error);
      setConnectionError('接続の初期化に失敗しました');
    }
  }, [session, status, handleNotification, reconnectInterval, maxReconnectAttempts]);

  // 接続切断
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    setIsConnected(false);
    setConnectionError(null);
    reconnectAttempts.current = 0;
  }, []);

  // 手動再接続
  const reconnect = useCallback(() => {
    disconnect();
    reconnectAttempts.current = 0;
    setTimeout(connect, 1000);
  }, [connect, disconnect]);

  // 通知クリア
  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  // 通知送信（テスト用）
  const sendTestNotification = useCallback(async (notification: Partial<Notification>) => {
    try {
      const response = await fetch('/api/v1/notifications/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'test',
          title: 'テスト通知',
          message: 'これはテスト通知です',
          severity: 'info',
          ...notification,
        }),
      });

      if (!response.ok) {
        throw new Error('通知送信に失敗しました');
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('通知送信エラー:', error);
      throw error;
    }
  }, []);

  // 自動接続
  useEffect(() => {
    if (autoConnect && session && status === 'authenticated') {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, session, status, connect, disconnect]);

  return {
    // 接続状態
    isConnected,
    connectionError,
    connectionStats,
    
    // 通知データ
    notifications,
    unreadCount: notifications.length,
    
    // 接続制御
    connect,
    disconnect,
    reconnect,
    
    // 通知制御
    clearNotifications,
    sendTestNotification,
  };
}