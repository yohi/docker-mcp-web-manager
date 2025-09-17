'use client';

import { useState, useEffect, memo, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Activity,
  Cpu,
  MemoryStick,
  HardDrive,
  Network,
  Zap,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Filter,
  Download,
  Settings,
  Eye,
  Server,
  Loader2
} from 'lucide-react';
import { formatTimeAgo } from '@/lib/utils';
import { usePermissions } from '@/components/auth/auth-provider';

// =============================================================================
// MonitoringDashboard - システム監視ダッシュボードコンポーネント
// サーバーの状態監視、メトリクス表示、アラート管理を提供
// =============================================================================

interface MetricData {
  timestamp: string;
  value: number;
  unit: string;
}

interface ServerMetrics {
  serverId: string;
  serverName: string;
  status: 'running' | 'stopped' | 'error' | 'starting' | 'stopping';
  healthStatus: 'healthy' | 'unhealthy' | 'unknown';
  uptime: number; // seconds
  cpu: {
    current: number;
    average: number;
    peak: number;
    history: MetricData[];
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
    history: MetricData[];
  };
  disk: {
    used: number;
    total: number;
    percentage: number;
    history: MetricData[];
  };
  network: {
    bytesIn: number;
    bytesOut: number;
    packetsIn: number;
    packetsOut: number;
    history: MetricData[];
  };
  responseTime: {
    current: number;
    average: number;
    history: MetricData[];
  };
  errorRate: {
    current: number;
    total: number;
    history: MetricData[];
  };
  lastUpdated: string;
}

interface Alert {
  id: string;
  serverId: string;
  serverName: string;
  type: 'cpu' | 'memory' | 'disk' | 'network' | 'error' | 'health';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  value?: number;
  threshold?: number;
  status: 'active' | 'resolved' | 'acknowledged';
  createdAt: string;
  resolvedAt?: string;
}

interface MonitoringDashboardProps {
  serverMetrics?: ServerMetrics[];
  alerts?: Alert[];
  isLoading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  onAcknowledgeAlert?: (alertId: string) => Promise<void>;
  onResolveAlert?: (alertId: string) => Promise<void>;
  className?: string;
}

type TimeRange = '1h' | '6h' | '24h' | '7d' | '30d';
type MetricType = 'cpu' | 'memory' | 'disk' | 'network' | 'responseTime' | 'errorRate';

/**
 * アラート重要度のスタイリング情報を取得
 */
function getAlertSeverityInfo(severity: string) {
  switch (severity) {
    case 'critical':
      return {
        badge: 'destructive',
        label: '緊急',
        icon: XCircle,
        iconColor: 'text-red-500',
        bgColor: 'bg-red-50 border-red-200'
      };
    case 'high':
      return {
        badge: 'destructive',
        label: '高',
        icon: AlertTriangle,
        iconColor: 'text-red-500',
        bgColor: 'bg-red-50 border-red-200'
      };
    case 'medium':
      return {
        badge: 'warning',
        label: '中',
        icon: AlertTriangle,
        iconColor: 'text-yellow-500',
        bgColor: 'bg-yellow-50 border-yellow-200'
      };
    case 'low':
      return {
        badge: 'secondary',
        label: '低',
        icon: AlertTriangle,
        iconColor: 'text-gray-500',
        bgColor: 'bg-gray-50 border-gray-200'
      };
    default:
      return {
        badge: 'outline',
        label: '不明',
        icon: AlertTriangle,
        iconColor: 'text-gray-400',
        bgColor: 'bg-gray-50 border-gray-200'
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
 * アップタイムをフォーマット
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}日 ${hours}時間 ${minutes}分`;
  if (hours > 0) return `${hours}時間 ${minutes}分`;
  return `${minutes}分`;
}

/**
 * 監視ダッシュボードコンポーネント
 */
export function MonitoringDashboard({
  serverMetrics = [],
  alerts = [],
  isLoading = false,
  error = null,
  onRefresh,
  onAcknowledgeAlert,
  onResolveAlert,
  className
}: MonitoringDashboardProps) {
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const [timeRange, setTimeRange] = useState<TimeRange>('1h');
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('cpu');
  const [alertFilter, setAlertFilter] = useState<'all' | 'active' | 'resolved'>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');

  // 権限チェック（開発環境では常に許可）
  const canViewMetrics = process.env.NODE_ENV === 'development' ? true : hasPermission('MONITORING_READ');
  const canManageAlerts = process.env.NODE_ENV === 'development' ? true : hasPermission('ALERTS_MANAGE');

  // 自動更新
  useEffect(() => {
    if (onRefresh) {
      const interval = setInterval(onRefresh, 30000); // 30秒ごと
      return () => clearInterval(interval);
    }
  }, [onRefresh]);

  // アラートのフィルタリング
  const filteredAlerts = alerts.filter(alert => {
    if (alertFilter !== 'all' && alert.status !== alertFilter) return false;
    if (severityFilter !== 'all' && alert.severity !== severityFilter) return false;
    return true;
  });

  // システム全体の統計
  const systemStats = {
    totalServers: serverMetrics.length,
    runningServers: serverMetrics.filter(m => m.status === 'running').length,
    healthyServers: serverMetrics.filter(m => m.healthStatus === 'healthy').length,
    activeAlerts: alerts.filter(a => a.status === 'active').length,
    criticalAlerts: alerts.filter(a => a.severity === 'critical' && a.status === 'active').length,
    avgCpuUsage: serverMetrics.length > 0
      ? serverMetrics.reduce((sum, m) => sum + m.cpu.current, 0) / serverMetrics.length
      : 0,
    avgMemoryUsage: serverMetrics.length > 0
      ? serverMetrics.reduce((sum, m) => sum + m.memory.percentage, 0) / serverMetrics.length
      : 0,
    avgResponseTime: serverMetrics.length > 0
      ? serverMetrics.reduce((sum, m) => sum + m.responseTime.current, 0) / serverMetrics.length
      : 0
  };

  if (!canViewMetrics) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          監視データを表示する権限がありません
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">システム監視</h1>
          <p className="text-sm text-gray-600">
            サーバーの状態とパフォーマンスを監視します
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh || (() => window.location.reload())}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            更新
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push('/monitoring/settings')}
          >
            <Settings className="h-4 w-4 mr-2" />
            設定
          </Button>
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* システム概要 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Server className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-2xl font-semibold">{systemStats.runningServers}/{systemStats.totalServers}</p>
                <p className="text-sm text-gray-600">実行中サーバー</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-semibold text-green-600">{systemStats.healthyServers}</p>
                <p className="text-sm text-gray-600">正常サーバー</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="text-2xl font-semibold text-yellow-600">{systemStats.activeAlerts}</p>
                <p className="text-sm text-gray-600">アクティブアラート</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <XCircle className="h-8 w-8 text-red-500" />
              <div>
                <p className="text-2xl font-semibold text-red-600">{systemStats.criticalAlerts}</p>
                <p className="text-sm text-gray-600">緊急アラート</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* パフォーマンス概要 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center space-x-2">
              <Cpu className="h-5 w-5 text-blue-500" />
              <span>CPU使用率</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl font-semibold">{systemStats.avgCpuUsage.toFixed(1)}%</span>
              <Badge variant={systemStats.avgCpuUsage > 80 ? 'destructive' : systemStats.avgCpuUsage > 60 ? 'warning' : 'success'}>
                {systemStats.avgCpuUsage > 80 ? '高' : systemStats.avgCpuUsage > 60 ? '中' : '低'}
              </Badge>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full"
                style={{ width: `${Math.min(systemStats.avgCpuUsage, 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center space-x-2">
              <MemoryStick className="h-5 w-5 text-green-500" />
              <span>メモリ使用率</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl font-semibold">{systemStats.avgMemoryUsage.toFixed(1)}%</span>
              <Badge variant={systemStats.avgMemoryUsage > 80 ? 'destructive' : systemStats.avgMemoryUsage > 60 ? 'warning' : 'success'}>
                {systemStats.avgMemoryUsage > 80 ? '高' : systemStats.avgMemoryUsage > 60 ? '中' : '低'}
              </Badge>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full"
                style={{ width: `${Math.min(systemStats.avgMemoryUsage, 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center space-x-2">
              <Zap className="h-5 w-5 text-orange-500" />
              <span>平均応答時間</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl font-semibold">{systemStats.avgResponseTime.toFixed(0)}ms</span>
              <Badge variant={systemStats.avgResponseTime > 1000 ? 'destructive' : systemStats.avgResponseTime > 500 ? 'warning' : 'success'}>
                {systemStats.avgResponseTime > 1000 ? '遅' : systemStats.avgResponseTime > 500 ? '中' : '良'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* サーバー詳細メトリクス */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>サーバー別メトリクス</CardTitle>

            <div className="flex items-center space-x-2">
              <select
                value={selectedMetric}
                onChange={(e) => setSelectedMetric(e.target.value as MetricType)}
                className="text-sm border rounded px-2 py-1"
              >
                <option value="cpu">CPU</option>
                <option value="memory">メモリ</option>
                <option value="disk">ディスク</option>
                <option value="network">ネットワーク</option>
                <option value="responseTime">応答時間</option>
                <option value="errorRate">エラー率</option>
              </select>

              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value as TimeRange)}
                className="text-sm border rounded px-2 py-1"
              >
                <option value="1h">1時間</option>
                <option value="6h">6時間</option>
                <option value="24h">24時間</option>
                <option value="7d">7日</option>
                <option value="30d">30日</option>
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : serverMetrics.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              監視データがありません
            </div>
          ) : (
            <div className="space-y-4">
              {serverMetrics.map((metrics) => (
                <Card key={metrics.serverId} className="border border-gray-200">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <Activity className={`h-5 w-5 ${metrics.healthStatus === 'healthy' ? 'text-green-500' :
                            metrics.healthStatus === 'unhealthy' ? 'text-red-500' :
                              'text-gray-400'
                          }`} />
                        <h4 className="font-medium">{metrics.serverName}</h4>
                        <Badge variant={
                          metrics.status === 'running' ? 'success' :
                            metrics.status === 'error' ? 'destructive' :
                              'secondary'
                        }>
                          {metrics.status === 'running' ? '実行中' :
                            metrics.status === 'error' ? 'エラー' :
                              metrics.status === 'stopped' ? '停止' :
                                metrics.status}
                        </Badge>
                      </div>

                      <div className="text-sm text-gray-500 flex items-center space-x-2">
                        <Clock className="h-4 w-4" />
                        <span>アップタイム: {formatUptime(metrics.uptime)}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                      <div className="flex items-center space-x-2">
                        <Cpu className="h-4 w-4 text-blue-500" />
                        <span>CPU: {metrics.cpu.current.toFixed(1)}%</span>
                      </div>

                      <div className="flex items-center space-x-2">
                        <MemoryStick className="h-4 w-4 text-green-500" />
                        <span>メモリ: {metrics.memory.percentage.toFixed(1)}%</span>
                      </div>

                      <div className="flex items-center space-x-2">
                        <HardDrive className="h-4 w-4 text-purple-500" />
                        <span>ディスク: {metrics.disk.percentage.toFixed(1)}%</span>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Network className="h-4 w-4 text-orange-500" />
                        <span>ネットワーク: {formatBytes(metrics.network.bytesIn + metrics.network.bytesOut)}</span>
                      </div>
                    </div>

                    <div className="mt-3 text-xs text-gray-500 flex items-center space-x-1">
                      <Clock className="h-3 w-3" />
                      <span>最終更新: {formatTimeAgo(metrics.lastUpdated)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* アラート管理 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>アラート管理</CardTitle>

            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4 text-gray-500" />

              <select
                value={alertFilter}
                onChange={(e) => setAlertFilter(e.target.value as any)}
                className="text-sm border rounded px-2 py-1"
              >
                <option value="all">全アラート</option>
                <option value="active">アクティブ</option>
                <option value="resolved">解決済み</option>
              </select>

              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value as any)}
                className="text-sm border rounded px-2 py-1"
              >
                <option value="all">全重要度</option>
                <option value="critical">緊急</option>
                <option value="high">高</option>
                <option value="medium">中</option>
                <option value="low">低</option>
              </select>

              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                エクスポート
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {filteredAlerts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              該当するアラートがありません
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAlerts.map((alert) => {
                const severityInfo = getAlertSeverityInfo(alert.severity);
                const SeverityIcon = severityInfo.icon;

                return (
                  <div
                    key={alert.id}
                    className={`p-4 rounded-lg border ${severityInfo.bgColor} ${alert.status === 'active' ? 'border-l-4' : ''
                      }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3">
                        <SeverityIcon className={`h-5 w-5 mt-0.5 ${severityInfo.iconColor}`} />
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-1">
                            <h4 className="font-medium">{alert.title}</h4>
                            <Badge variant={severityInfo.badge as any} className="text-xs">
                              {severityInfo.label}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {alert.serverName}
                            </Badge>
                          </div>

                          <p className="text-sm text-gray-600 mb-2">{alert.message}</p>

                          {alert.value !== undefined && alert.threshold !== undefined && (
                            <div className="text-sm">
                              <span className="text-gray-500">値: </span>
                              <span className="font-mono">{alert.value}</span>
                              <span className="text-gray-500"> / 閾値: </span>
                              <span className="font-mono">{alert.threshold}</span>
                            </div>
                          )}

                          <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                            <span>作成: {formatTimeAgo(alert.createdAt)}</span>
                            {alert.resolvedAt && (
                              <span>解決: {formatTimeAgo(alert.resolvedAt)}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {canManageAlerts && alert.status === 'active' && (
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onAcknowledgeAlert?.(alert.id)}
                          >
                            確認
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onResolveAlert?.(alert.id)}
                          >
                            解決
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
