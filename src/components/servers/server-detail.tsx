'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  ArrowLeft,
  Play, 
  Square, 
  Settings, 
  Activity,
  Cpu,
  MemoryStick,
  HardDrive,
  Network,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  ExternalLink,
  Download,
  Eye,
  Terminal,
  Database,
  Shield,
  RefreshCw
} from 'lucide-react';
import { formatTimeAgo } from '@/lib/utils';
import { usePermissions } from '@/components/auth/auth-provider';

// =============================================================================
// ServerDetail - MCPサーバー詳細表示コンポーネント
// サーバーの詳細情報、ログ、設定、操作を提供
// =============================================================================

interface ServerDetailProps {
  serverId: string;
  server?: {
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
    lastStoppedAt?: string;
    resourceUsage?: {
      cpu: number;
      memory: number;
      memoryLimit: number;
      diskUsage?: number;
      diskLimit?: number;
      networkRx?: number;
      networkTx?: number;
    };
    healthStatus?: 'healthy' | 'unhealthy' | 'unknown';
    toolsCount?: number;
    configurationsCount?: number;
    tags?: string[];
    environment?: Record<string, string>;
    volumes?: Array<{
      source: string;
      target: string;
      readonly: boolean;
    }>;
    networks?: string[];
    restartPolicy?: 'no' | 'always' | 'on-failure' | 'unless-stopped';
    logs?: {
      lastUpdated: string;
      entries: Array<{
        timestamp: string;
        level: 'info' | 'warn' | 'error' | 'debug';
        message: string;
        source?: string;
      }>;
    };
  };
  isLoading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  onStart?: (serverId: string) => Promise<void>;
  onStop?: (serverId: string) => Promise<void>;
  onRestart?: (serverId: string) => Promise<void>;
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
 * バイト数をフォーマット
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * サーバー詳細コンポーネント
 */
export function ServerDetail({
  serverId,
  server,
  isLoading = false,
  error = null,
  onRefresh,
  onStart,
  onStop,
  onRestart,
  className
}: ServerDetailProps) {
  const { hasPermission } = usePermissions();
  const [isOperating, setIsOperating] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'logs' | 'environment' | 'volumes'>('overview');
  
  // 権限チェック
  const canManageServers = hasPermission('SERVERS_MANAGE');
  const canConfigureServers = hasPermission('SERVERS_CONFIGURE');
  const canViewLogs = hasPermission('LOGS_READ');

  // サーバー操作関数
  const handleOperation = async (operation: 'start' | 'stop' | 'restart') => {
    if (!server || isOperating) return;
    
    const operationFn = operation === 'start' ? onStart : 
                       operation === 'stop' ? onStop : onRestart;
    
    if (!operationFn) return;
    
    setIsOperating(true);
    setOperationError(null);
    
    try {
      await operationFn(server.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 
                     `サーバーの${operation === 'start' ? '起動' : operation === 'stop' ? '停止' : '再起動'}に失敗しました`;
      setOperationError(message);
      console.error('[SERVER_DETAIL] Operation failed:', error);
    } finally {
      setIsOperating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto" />
          <p className="text-sm text-gray-500">サーバー情報を読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error || !server) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          {error || 'サーバー情報の取得に失敗しました'}
        </AlertDescription>
      </Alert>
    );
  }

  const statusInfo = getStatusInfo(server.status, server.healthStatus);
  const StatusIcon = statusInfo.icon;

  return (
    <div className={`space-y-6 ${className}`}>
      {/* ヘッダー */}
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/servers">
              <ArrowLeft className="h-4 w-4 mr-2" />
              サーバー一覧に戻る
            </Link>
          </Button>
          
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <h1 className="text-2xl font-semibold text-gray-900">{server.name}</h1>
              <StatusIcon className={`h-5 w-5 ${statusInfo.iconColor}`} />
              <Badge variant={statusInfo.badge as any}>
                {statusInfo.label}
              </Badge>
              {server.version && (
                <Badge variant="outline">v{server.version}</Badge>
              )}
            </div>
            
            {server.description && (
              <p className="text-gray-600">{server.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {onRefresh && (
            <Button variant="outline" size="sm" onClick={onRefresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              更新
            </Button>
          )}
          
          {canConfigureServers && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/servers/${server.id}/settings`}>
                <Settings className="h-4 w-4 mr-2" />
                設定
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* エラーメッセージ */}
      {operationError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{operationError}</AlertDescription>
        </Alert>
      )}

      {/* サーバー操作ボタン */}
      {canManageServers && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                サーバーの操作を実行できます
              </div>
              
              <div className="flex space-x-2">
                {server.status === 'stopped' && (
                  <Button
                    onClick={() => handleOperation('start')}
                    disabled={isOperating}
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
                  <>
                    <Button
                      onClick={() => handleOperation('stop')}
                      disabled={isOperating}
                      variant="outline"
                      size="sm"
                    >
                      {isOperating ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Square className="mr-2 h-4 w-4" />
                      )}
                      停止
                    </Button>
                    
                    {onRestart && (
                      <Button
                        onClick={() => handleOperation('restart')}
                        disabled={isOperating}
                        variant="outline"
                        size="sm"
                      >
                        {isOperating ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        再起動
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* タブナビゲーション */}
      <Card>
        <CardHeader>
          <div className="flex space-x-1">
            {[
              { id: 'overview', label: '概要', icon: Activity },
              { id: 'logs', label: 'ログ', icon: Terminal },
              { id: 'environment', label: '環境変数', icon: Database },
              { id: 'volumes', label: 'ボリューム', icon: HardDrive }
            ].map((tab) => {
              const TabIcon = tab.icon;
              return (
                <Button
                  key={tab.id}
                  variant={activeTab === tab.id ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveTab(tab.id as any)}
                  disabled={tab.id === 'logs' && !canViewLogs}
                >
                  <TabIcon className="h-4 w-4 mr-2" />
                  {tab.label}
                </Button>
              );
            })}
          </div>
        </CardHeader>
        
        <CardContent>
          {/* 概要タブ */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* 基本情報 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">基本情報</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <span className="text-gray-500">ID:</span>
                      <span className="font-mono text-xs">{server.id}</span>
                      
                      <span className="text-gray-500">イメージ:</span>
                      <span className="font-mono text-xs break-all">{server.imageUrl}</span>
                      
                      {server.port && (
                        <>
                          <span className="text-gray-500">ポート:</span>
                          <span>{server.port}</span>
                        </>
                      )}
                      
                      {server.restartPolicy && (
                        <>
                          <span className="text-gray-500">再起動ポリシー:</span>
                          <span>{server.restartPolicy}</span>
                        </>
                      )}
                      
                      <span className="text-gray-500">ツール数:</span>
                      <span>{server.toolsCount || 0}個</span>
                      
                      <span className="text-gray-500">設定数:</span>
                      <span>{server.configurationsCount || 0}個</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">タイムスタンプ</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center space-x-2">
                        <Clock className="h-4 w-4 text-gray-400" />
                        <span className="text-gray-500">作成:</span>
                        <span>{formatTimeAgo(server.createdAt)}</span>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Clock className="h-4 w-4 text-gray-400" />
                        <span className="text-gray-500">更新:</span>
                        <span>{formatTimeAgo(server.updatedAt)}</span>
                      </div>
                      
                      {server.lastStartedAt && (
                        <div className="flex items-center space-x-2">
                          <Activity className="h-4 w-4 text-green-500" />
                          <span className="text-gray-500">最終起動:</span>
                          <span>{formatTimeAgo(server.lastStartedAt)}</span>
                        </div>
                      )}
                      
                      {server.lastStoppedAt && (
                        <div className="flex items-center space-x-2">
                          <Square className="h-4 w-4 text-gray-500" />
                          <span className="text-gray-500">最終停止:</span>
                          <span>{formatTimeAgo(server.lastStoppedAt)}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* リソース使用量 */}
              {server.resourceUsage && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">リソース使用量</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* CPU */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Cpu className="h-4 w-4 text-blue-500" />
                            <span className="text-sm font-medium">CPU</span>
                          </div>
                          <span className="text-sm">{server.resourceUsage.cpu.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-500 h-2 rounded-full" 
                            style={{ width: `${Math.min(server.resourceUsage.cpu, 100)}%` }}
                          />
                        </div>
                      </div>

                      {/* メモリ */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <MemoryStick className="h-4 w-4 text-green-500" />
                            <span className="text-sm font-medium">メモリ</span>
                          </div>
                          <span className="text-xs">
                            {formatBytes(server.resourceUsage.memory)} / {formatBytes(server.resourceUsage.memoryLimit)}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-green-500 h-2 rounded-full" 
                            style={{ 
                              width: `${Math.min((server.resourceUsage.memory / server.resourceUsage.memoryLimit) * 100, 100)}%` 
                            }}
                          />
                        </div>
                      </div>

                      {/* ディスク */}
                      {server.resourceUsage.diskUsage && server.resourceUsage.diskLimit && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <HardDrive className="h-4 w-4 text-purple-500" />
                              <span className="text-sm font-medium">ディスク</span>
                            </div>
                            <span className="text-xs">
                              {formatBytes(server.resourceUsage.diskUsage)} / {formatBytes(server.resourceUsage.diskLimit)}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-purple-500 h-2 rounded-full" 
                              style={{ 
                                width: `${Math.min((server.resourceUsage.diskUsage / server.resourceUsage.diskLimit) * 100, 100)}%` 
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {/* ネットワーク */}
                      {(server.resourceUsage.networkRx || server.resourceUsage.networkTx) && (
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <Network className="h-4 w-4 text-orange-500" />
                            <span className="text-sm font-medium">ネットワーク</span>
                          </div>
                          <div className="text-xs space-y-1">
                            {server.resourceUsage.networkRx && (
                              <div>受信: {formatBytes(server.resourceUsage.networkRx)}</div>
                            )}
                            {server.resourceUsage.networkTx && (
                              <div>送信: {formatBytes(server.resourceUsage.networkTx)}</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* タグ */}
              {server.tags && server.tags.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">タグ</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {server.tags.map(tag => (
                        <Badge key={tag} variant="outline">{tag}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* ログタブ */}
          {activeTab === 'logs' && canViewLogs && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">サーバーログ</h3>
                <div className="flex space-x-2">
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    ダウンロード
                  </Button>
                  <Button variant="outline" size="sm">
                    <Eye className="h-4 w-4 mr-2" />
                    リアルタイム表示
                  </Button>
                </div>
              </div>
              
              {server.logs && server.logs.entries.length > 0 ? (
                <div className="bg-black text-green-400 p-4 rounded-lg font-mono text-sm max-h-96 overflow-y-auto">
                  {server.logs.entries.map((entry, index) => (
                    <div key={index} className="flex space-x-2 mb-1">
                      <span className="text-gray-500">{entry.timestamp}</span>
                      <span className={
                        entry.level === 'error' ? 'text-red-400' :
                        entry.level === 'warn' ? 'text-yellow-400' :
                        entry.level === 'debug' ? 'text-blue-400' :
                        'text-green-400'
                      }>
                        [{entry.level.toUpperCase()}]
                      </span>
                      <span>{entry.message}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  ログが見つかりません
                </div>
              )}
            </div>
          )}

          {/* 環境変数タブ */}
          {activeTab === 'environment' && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium">環境変数</h3>
              
              {server.environment && Object.keys(server.environment).length > 0 ? (
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="space-y-2">
                    {Object.entries(server.environment).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between py-2 border-b border-gray-200 last:border-b-0">
                        <code className="text-sm font-mono text-blue-600">{key}</code>
                        <code className="text-sm font-mono bg-white px-2 py-1 rounded border">
                          {value.length > 50 ? `${value.substring(0, 50)}...` : value}
                        </code>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  設定された環境変数がありません
                </div>
              )}
            </div>
          )}

          {/* ボリュームタブ */}
          {activeTab === 'volumes' && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium">マウントされたボリューム</h3>
              
              {server.volumes && server.volumes.length > 0 ? (
                <div className="space-y-2">
                  {server.volumes.map((volume, index) => (
                    <Card key={index}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <HardDrive className="h-4 w-4 text-gray-500" />
                              <code className="text-sm font-mono">{volume.source}</code>
                              <span className="text-gray-500">→</span>
                              <code className="text-sm font-mono">{volume.target}</code>
                            </div>
                          </div>
                          
                          {volume.readonly && (
                            <Badge variant="outline" className="text-xs">
                              <Shield className="h-3 w-3 mr-1" />
                              読み取り専用
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  マウントされたボリュームがありません
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}