'use client';

import { useState } from 'react';
import { Bell, X, Trash2, Wifi, WifiOff, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useNotifications, type Notification } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';

interface NotificationItemProps {
  notification: Notification;
}

function NotificationItem({ notification }: NotificationItemProps) {
  const severityColors = {
    info: 'bg-blue-500',
    success: 'bg-green-500',
    warning: 'bg-yellow-500',
    error: 'bg-red-500',
  };

  const severityIcons = {
    info: '🔔',
    success: '✅',
    warning: '⚠️',
    error: '❌',
  };

  return (
    <div className="p-3 border rounded-lg hover:bg-gray-50">
      <div className="flex items-start gap-3">
        <div className={`w-2 h-2 rounded-full mt-2 ${severityColors[notification.severity]}`} />
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium flex items-center gap-1">
              <span>{severityIcons[notification.severity]}</span>
              {notification.title}
            </h4>
            <Badge variant="outline" className="text-xs">
              {notification.type}
            </Badge>
          </div>
          <p className="text-sm text-gray-600">{notification.message}</p>
          <p className="text-xs text-gray-400">
            {formatDistanceToNow(new Date(notification.timestamp), {
              addSuffix: true,
              locale: ja,
            })}
          </p>
        </div>
      </div>
    </div>
  );
}

export function NotificationPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const {
    isConnected,
    connectionError,
    notifications,
    unreadCount,
    connectionStats,
    clearNotifications,
    reconnect,
    sendTestNotification,
  } = useNotifications();

  const handleTestNotification = async () => {
    try {
      await sendTestNotification({
        title: 'テスト通知',
        message: `テスト通知が送信されました - ${new Date().toLocaleTimeString()}`,
        severity: 'info',
      });
    } catch (error) {
      console.error('テスト通知の送信に失敗しました:', error);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            リアルタイム通知
            <div className="flex items-center gap-2">
              {isConnected ? (
                <Badge variant="default" className="bg-green-500 flex items-center gap-1">
                  <Wifi className="h-3 w-3" />
                  接続中
                </Badge>
              ) : (
                <Badge variant="destructive" className="flex items-center gap-1">
                  <WifiOff className="h-3 w-3" />
                  切断
                </Badge>
              )}
            </div>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* 接続状態とコントロール */}
          <div className="p-3 border rounded-lg bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">接続状態</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={reconnect}
                  disabled={isConnected}
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  再接続
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestNotification}
                  disabled={!isConnected}
                >
                  テスト送信
                </Button>
              </div>
            </div>

            {connectionError && (
              <p className="text-sm text-red-600 mb-2">{connectionError}</p>
            )}

            {connectionStats && (
              <div className="text-xs text-gray-600 space-y-1">
                <p>アクティブ接続数: {connectionStats.activeConnections || 0}</p>
                <p>最終更新: {new Date(connectionStats.timestamp).toLocaleTimeString()}</p>
              </div>
            )}
          </div>

          {/* 通知リストヘッダー */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">
              通知履歴 ({notifications.length})
            </h3>
            {notifications.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearNotifications}
                className="text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                全削除
              </Button>
            )}
          </div>

          <Separator />

          {/* 通知リスト */}
          <ScrollArea className="h-[500px]">
            {notifications.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>通知はありません</p>
                <p className="text-sm">新しい通知が届くとここに表示されます</p>
              </div>
            ) : (
              <div className="space-y-3">
                {notifications.map((notification, index) => (
                  <NotificationItem
                    key={`${notification.timestamp}-${index}`}
                    notification={notification}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}