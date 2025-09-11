'use client';

import { useState, useEffect, useCallback } from 'react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { MonitoringDashboard } from '@/components/monitoring/monitoring-dashboard';
import { SystemHealthDashboard } from '@/components/health/SystemHealthDashboard';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Activity,
  Server,
  AlertTriangle,
  RefreshCw,
  Settings,
  Download,
  TrendingUp
} from 'lucide-react';

// =============================================================================
// 監視ページ - 新しいコンポーネントベース実装
// システム全体の監視とアラート管理を提供
// =============================================================================

interface ServerMetrics {
  serverId: string;
  serverName: string;
  status: 'running' | 'stopped' | 'error' | 'starting' | 'stopping';
  healthStatus: 'healthy' | 'unhealthy' | 'unknown';
  uptime: number;
  cpu: {
    current: number;
    average: number;
    peak: number;
    history: Array<{
      timestamp: string;
      value: number;
      unit: string;
    }>;
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
    history: Array<{
      timestamp: string;
      value: number;
      unit: string;
    }>;
  };
  disk: {
    used: number;
    total: number;
    percentage: number;
    history: Array<{
      timestamp: string;
      value: number;
      unit: string;
    }>;
  };
  network: {
    bytesIn: number;
    bytesOut: number;
    packetsIn: number;
    packetsOut: number;
    history: Array<{
      timestamp: string;
      value: number;
      unit: string;
    }>;
  };
  responseTime: {
    current: number;
    average: number;
    history: Array<{
      timestamp: string;
      value: number;
      unit: string;
    }>;
  };
  errorRate: {
    current: number;
    total: number;
    history: Array<{
      timestamp: string;
      value: number;
      unit: string;
    }>;
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

export default function MonitoringPage() {
  const [serverMetrics, setServerMetrics] = useState<ServerMetrics[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // データ取得
  const loadMonitoringData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // サーバー情報の取得
      const serversRes = await fetch('/api/v1/servers');
      if (!serversRes.ok) throw new Error('サーバー情報の取得に失敗しました');

      const serversData = await serversRes.json();
      const servers = serversData.success ? serversData.data : [];

      // メトリクスデータの生成（本来はAPIから取得）
      const mockMetrics: ServerMetrics[] = servers.map((server: any) => ({
        serverId: server.id,
        serverName: server.name,
        status: server.status,
        healthStatus: server.status === 'running' ? 'healthy' :
          server.status === 'error' ? 'unhealthy' : 'unknown',
        uptime: server.uptime || Math.random() * 86400, // 24時間以内のランダム値
        cpu: {
          current: Math.random() * 100,
          average: Math.random() * 80,
          peak: Math.random() * 100,
          history: generateMockHistory('cpu')
        },
        memory: {
          used: Math.random() * 8000000000, // 8GB以内のランダム値
          total: 8000000000, // 8GB
          percentage: Math.random() * 100,
          history: generateMockHistory('memory')
        },
        disk: {
          used: Math.random() * 500000000000, // 500GB以内のランダム値
          total: 500000000000, // 500GB
          percentage: Math.random() * 100,
          history: generateMockHistory('disk')
        },
        network: {
          bytesIn: Math.random() * 1000000,
          bytesOut: Math.random() * 1000000,
          packetsIn: Math.random() * 1000,
          packetsOut: Math.random() * 1000,
          history: generateMockHistory('network')
        },
        responseTime: {
          current: Math.random() * 1000,
          average: Math.random() * 500,
          history: generateMockHistory('response')
        },
        errorRate: {
          current: Math.random() * 5,
          total: Math.random() * 100,
          history: generateMockHistory('error')
        },
        lastUpdated: new Date().toISOString()
      }));

      // アラートデータの取得（本来はAPIから取得）
      const mockAlerts: Alert[] = [
        {
          id: '1',
          serverId: servers[0]?.id || 'server-1',
          serverName: servers[0]?.name || 'test-server',
          type: 'cpu',
          severity: 'high',
          title: 'CPU使用率が高い',
          message: 'CPU使用率が85%を超えています',
          value: 87.5,
          threshold: 85,
          status: 'active',
          createdAt: new Date(Date.now() - 3600000).toISOString() // 1時間前
        },
        {
          id: '2',
          serverId: servers[1]?.id || 'server-2',
          serverName: servers[1]?.name || 'test-server-2',
          type: 'memory',
          severity: 'medium',
          title: 'メモリ使用率が高い',
          message: 'メモリ使用率が75%を超えています',
          value: 78.2,
          threshold: 75,
          status: 'active',
          createdAt: new Date(Date.now() - 1800000).toISOString() // 30分前
        }
      ];

      setServerMetrics(mockMetrics);
      setAlerts(mockAlerts);
      setLastUpdated(new Date());

    } catch (error) {
      console.error('Failed to load monitoring data:', error);
      setError(error instanceof Error ? error.message : '監視データ読み込みエラー');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMonitoringData();
  }, [loadMonitoringData]);

  // モックデータ生成用のヘルパー関数
  const generateMockHistory = (type: string) => {
    const points = 24; // 過去24時間
    const history = [];

    for (let i = points; i >= 0; i--) {
      const timestamp = new Date(Date.now() - i * 60 * 60 * 1000); // 1時間間隔
      let value = Math.random() * 100;

      if (type === 'memory') value = Math.random() * 8000000000;
      if (type === 'network') value = Math.random() * 1000000;
      if (type === 'response') value = Math.random() * 1000;
      if (type === 'error') value = Math.random() * 10;

      history.push({
        timestamp: timestamp.toISOString(),
        value,
        unit: type === 'memory' ? 'bytes' :
          type === 'network' ? 'bytes/s' :
            type === 'response' ? 'ms' :
              type === 'error' ? 'count' : '%'
      });
    }

    return history;
  };

  // アラート操作
  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      // 本来はAPIを呼び出し
      setAlerts(prev => prev.map(alert =>
        alert.id === alertId
          ? { ...alert, status: 'acknowledged' }
          : alert
      ));
    } catch (error) {
      console.error('Failed to acknowledge alert:', error);
    }
  };

  const handleResolveAlert = async (alertId: string) => {
    try {
      // 本来はAPIを呼び出し
      setAlerts(prev => prev.map(alert =>
        alert.id === alertId
          ? { ...alert, status: 'resolved', resolvedAt: new Date().toISOString() }
          : alert
      ));
    } catch (error) {
      console.error('Failed to resolve alert:', error);
    }
  };

  return (
    <ProtectedRoute requiredPermissions={['MONITORING_READ']}>
      <div className="space-y-6">
        {/* ヘッダー */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">システム監視</h1>
            <p className="text-sm text-gray-600">
              サーバーの状態とパフォーマンスを包括的に監視します
            </p>
            {lastUpdated && (
              <p className="text-xs text-gray-500 mt-1">
                最終更新: {lastUpdated.toLocaleString('ja-JP')}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadMonitoringData} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              更新
            </Button>
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              設定
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              エクスポート
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

        {/* クイック統計 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Server className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-semibold">
                    {serverMetrics.filter(m => m.status === 'running').length}/{serverMetrics.length}
                  </p>
                  <p className="text-sm text-gray-600">実行中サーバー</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Activity className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-2xl font-semibold text-green-600">
                    {serverMetrics.filter(m => m.healthStatus === 'healthy').length}
                  </p>
                  <p className="text-sm text-gray-600">健全サーバー</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-8 w-8 text-yellow-500" />
                <div>
                  <p className="text-2xl font-semibold text-yellow-600">
                    {alerts.filter(a => a.status === 'active').length}
                  </p>
                  <p className="text-sm text-gray-600">アクティブアラート</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-8 w-8 text-purple-500" />
                <div>
                  <p className="text-2xl font-semibold">
                    {serverMetrics.length > 0
                      ? (serverMetrics.reduce((sum, m) => sum + m.cpu.current, 0) / serverMetrics.length).toFixed(1)
                      : 0}%
                  </p>
                  <p className="text-sm text-gray-600">平均CPU使用率</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* システムヘルス監視 */}
        <SystemHealthDashboard />
        
        {/* メイン監視ダッシュボード */}
        <MonitoringDashboard
          serverMetrics={serverMetrics}
          alerts={alerts}
          isLoading={isLoading}
          error={error}
          onRefresh={loadMonitoringData}
          onAcknowledgeAlert={handleAcknowledgeAlert}
          onResolveAlert={handleResolveAlert}
        />
      </div>
    </ProtectedRoute>
  );
}
