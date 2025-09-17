'use client';

import { useState, memo, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Play, 
  Square, 
  Settings, 
  Activity, 
  Clock, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  ExternalLink
} from 'lucide-react';
import { formatTimeAgo } from '@/lib/utils';
import { usePermissions } from '@/components/auth/auth-provider';

// =============================================================================
// ServerCard - MCPサーバー情報表示カード
// サーバーの状態、統計情報、操作ボタンを表示
// =============================================================================

interface ServerCardProps {
  server: {
    id: string;
    name: string;
    description?: string;
    status: 'running' | 'stopped' | 'error' | 'starting' | 'stopping';
    imageUrl: string;
    version?: string;
    port?: number;
    createdAt: string;
    updatedAt: string;
    lastStartedAt?: string;
    resourceUsage?: {
      cpu: number;
      memory: number;
      memoryLimit: number;
    };
    healthStatus?: 'healthy' | 'unhealthy' | 'unknown';
    toolsCount?: number;
    configurationsCount?: number;
  };
  onStart?: (serverId: string) => Promise<void>;
  onStop?: (serverId: string) => Promise<void>;
  className?: string;
}

/**
 * サーバー状態のスタイリング情報を取得
 */
function getStatusInfo(status: string, healthStatus?: string) {
  switch (status) {
    case 'running':
      return {
        badge: healthStatus === 'unhealthy' ? 'warning' : 'success',
        label: healthStatus === 'unhealthy' ? '実行中（異常）' : '実行中',
        icon: healthStatus === 'unhealthy' ? AlertTriangle : CheckCircle,
        iconColor: healthStatus === 'unhealthy' ? 'text-yellow-500' : 'text-green-500'
      };
    case 'stopped':
      return {
        badge: 'secondary',
        label: '停止中',
        icon: Square,
        iconColor: 'text-gray-500'
      };
    case 'error':
      return {
        badge: 'destructive',
        label: 'エラー',
        icon: XCircle,
        iconColor: 'text-red-500'
      };
    case 'starting':
      return {
        badge: 'info',
        label: '起動中',
        icon: Loader2,
        iconColor: 'text-blue-500 animate-spin'
      };
    case 'stopping':
      return {
        badge: 'warning',
        label: '停止中',
        icon: Loader2,
        iconColor: 'text-yellow-500 animate-spin'
      };
    default:
      return {
        badge: 'outline',
        label: '不明',
        icon: AlertTriangle,
        iconColor: 'text-gray-400'
      };
  }
}

/**
 * メモリ使用量をフォーマット
 */
function formatMemoryUsage(usage: number, limit: number): string {
  const usageMB = Math.round(usage / 1024 / 1024);
  const limitMB = Math.round(limit / 1024 / 1024);
  const percentage = Math.round((usage / limit) * 100);
  return `${usageMB}MB / ${limitMB}MB (${percentage}%)`;
}

/**
 * サーバーカードコンポーネント
 */
function ServerCardComponent({ server, onStart, onStop, className }: ServerCardProps) {
  const { hasPermission } = usePermissions();
  const [isOperating, setIsOperating] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);

  // 権限チェック（メモ化）
  const canManageServers = useMemo(() => hasPermission('SERVERS_MANAGE'), [hasPermission]);
  const canConfigureServers = useMemo(() => hasPermission('SERVERS_CONFIGURE'), [hasPermission]);

  // 状態情報の取得（メモ化）
  const statusInfo = useMemo(() => getStatusInfo(server.status, server.healthStatus), [server.status, server.healthStatus]);
  const StatusIcon = statusInfo.icon;

  // サーバー操作関数（メモ化）
  const handleStart = useCallback(async () => {
    if (!onStart || !canManageServers || isOperating) return;

    setIsOperating(true);
    setOperationError(null);

    try {
      await onStart(server.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'サーバーの起動に失敗しました';
      setOperationError(message);
      console.error('[SERVER_CARD] Start failed:', error);
    } finally {
      setIsOperating(false);
    }
  }, [onStart, canManageServers, isOperating, server.id]);

  const handleStop = useCallback(async () => {
    if (!onStop || !canManageServers || isOperating) return;

    setIsOperating(true);
    setOperationError(null);

    try {
      await onStop(server.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'サーバーの停止に失敗しました';
      setOperationError(message);
      console.error('[SERVER_CARD] Stop failed:', error);
    } finally {
      setIsOperating(false);
    }
  }, [onStop, canManageServers, isOperating, server.id]);

  return (
    <Card className={`transition-shadow hover:shadow-md ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
              <Activity className="h-5 w-5 text-gray-600" />
            </div>
            <div>
              <CardTitle className="text-lg">{server.name}</CardTitle>
              <div className="flex items-center space-x-2 mt-1">
                <StatusIcon className={`h-4 w-4 ${statusInfo.iconColor}`} />
                <Badge variant={statusInfo.badge as any}>
                  {statusInfo.label}
                </Badge>
                {server.version && (
                  <Badge variant="outline" className="text-xs">
                    v{server.version}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex space-x-1">
            {canConfigureServers && (
              <Button variant="ghost" size="icon" asChild>
                <Link href={`/servers/${server.id}/settings`}>
                  <Settings className="h-4 w-4" />
                  <span className="sr-only">設定</span>
                </Link>
              </Button>
            )}
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/servers/${server.id}`}>
                <ExternalLink className="h-4 w-4" />
                <span className="sr-only">詳細を表示</span>
              </Link>
            </Button>
          </div>
        </div>

        {server.description && (
          <CardDescription className="mt-2">
            {server.description}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* エラーメッセージ */}
        {operationError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{operationError}</AlertDescription>
          </Alert>
        )}

        {/* サーバー情報 */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500 mb-1">イメージ</p>
            <p className="font-mono text-xs break-all">{server.imageUrl}</p>
          </div>
          
          {server.port && (
            <div>
              <p className="text-gray-500 mb-1">ポート</p>
              <p className="font-mono">{server.port}</p>
            </div>
          )}
          
          {server.toolsCount !== undefined && (
            <div>
              <p className="text-gray-500 mb-1">ツール数</p>
              <p>{server.toolsCount}個</p>
            </div>
          )}
          
          {server.configurationsCount !== undefined && (
            <div>
              <p className="text-gray-500 mb-1">設定数</p>
              <p>{server.configurationsCount}個</p>
            </div>
          )}
        </div>

        {/* リソース使用量 */}
        {server.resourceUsage && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">リソース使用量</p>
            <div className="space-y-2 text-sm">
              <div>
                <div className="flex justify-between">
                  <span className="text-gray-500">CPU</span>
                  <span>{server.resourceUsage.cpu.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div 
                    className="bg-blue-500 h-1.5 rounded-full" 
                    style={{ width: `${Math.min(server.resourceUsage.cpu, 100)}%` }}
                  />
                </div>
              </div>
              
              <div>
                <div className="flex justify-between">
                  <span className="text-gray-500">メモリ</span>
                  <span className="text-xs">
                    {formatMemoryUsage(server.resourceUsage.memory, server.resourceUsage.memoryLimit)}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div 
                    className="bg-green-500 h-1.5 rounded-full" 
                    style={{ 
                      width: `${Math.min((server.resourceUsage.memory / server.resourceUsage.memoryLimit) * 100, 100)}%` 
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* タイムスタンプ情報 */}
        <div className="text-xs text-gray-500 space-y-1">
          <div className="flex items-center space-x-1">
            <Clock className="h-3 w-3" />
            <span>作成: {formatTimeAgo(server.createdAt)}</span>
          </div>
          {server.lastStartedAt && (
            <div className="flex items-center space-x-1">
              <Activity className="h-3 w-3" />
              <span>最終起動: {formatTimeAgo(server.lastStartedAt)}</span>
            </div>
          )}
        </div>
      </CardContent>

      {/* 操作ボタン */}
      {canManageServers && (
        <CardFooter className="pt-0">
          <div className="flex space-x-2 w-full">
            {server.status === 'stopped' && (
              <Button
                onClick={handleStart}
                disabled={isOperating}
                className="flex-1"
                size="sm"
              >
                {isOperating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                起動
              </Button>
            )}
            
            {(server.status === 'running' || server.status === 'error') && (
              <Button
                onClick={handleStop}
                disabled={isOperating}
                variant="outline"
                className="flex-1"
                size="sm"
              >
                {isOperating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Square className="mr-2 h-4 w-4" />
                )}
                停止
              </Button>
            )}
          </div>
        </CardFooter>
      )}
    </Card>
  );
}

// メモ化されたServerCardコンポーネントをエクスポート
export const ServerCard = memo(ServerCardComponent);