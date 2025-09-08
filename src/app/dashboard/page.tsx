'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { ServerList } from '@/components/servers/server-list';
import { MonitoringDashboard } from '@/components/monitoring/monitoring-dashboard';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Server,
  Package,
  Activity,
  Plus,
  TrendingUp,
  Users,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';

// =============================================================================
// ダッシュボードページ - 新しいコンポーネントベース実装
// システム概要、サーバー管理、監視ダッシュボードを統合表示
// =============================================================================

interface DashboardStats {
  servers: {
    total: number;
    running: number;
    stopped: number;
    error: number;
  };
  users: {
    active: number;
    total: number;
  };
  activity: {
    todayActions: number;
    weeklyActions: number;
  };
  system: {
    uptime: number;
    cpuUsage: number;
    memoryUsage: number;
  };
}

export default function DashboardPage() {
  const [servers, setServers] = useState<any[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // データ取得
  const loadDashboardData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // サーバー情報の取得
      const serversRes = await fetch('/api/v1/servers');
      if (!serversRes.ok) throw new Error('サーバー情報の取得に失敗しました');
      
      const serversData = await serversRes.json();
      const serversList = serversData.success ? serversData.data : [];
      setServers(serversList);

      // 統計情報の集計
      const dashboardStats: DashboardStats = {
        servers: {
          total: serversList.length,
          running: serversList.filter((s: any) => s.status === 'running').length,
          stopped: serversList.filter((s: any) => s.status === 'stopped').length,
          error: serversList.filter((s: any) => s.status === 'error').length,
        },
        users: {
          active: 5, // 仮データ
          total: 12,
        },
        activity: {
          todayActions: 24,
          weeklyActions: 156,
        },
        system: {
          uptime: 2592000, // 30日間の秒数
          cpuUsage: 35.2,
          memoryUsage: 68.5,
        },
      };

      setStats(dashboardStats);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      setError(error instanceof Error ? error.message : 'データ読み込みエラー');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  // サーバー操作
  const handleServerStart = async (serverId: string) => {
    try {
      const response = await fetch(`/api/v1/servers/${serverId}/start`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('サーバー起動に失敗しました');
      
      // データを再読み込み
      await loadDashboardData();
    } catch (error) {
      console.error('Server start failed:', error);
      throw error;
    }
  };

  const handleServerStop = async (serverId: string) => {
    try {
      const response = await fetch(`/api/v1/servers/${serverId}/stop`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('サーバー停止に失敗しました');
      
      // データを再読み込み
      await loadDashboardData();
    } catch (error) {
      console.error('Server stop failed:', error);
      throw error;
    }
  };

  return (
    <ProtectedRoute requiredPermissions={['DASHBOARD_READ']}>
      <div className="space-y-6">
        {/* ヘッダー */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">ダッシュボード</h1>
            <p className="text-sm text-gray-600">
              Docker MCP環境の概要とシステム状況をご確認ください
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadDashboardData} disabled={isLoading}>
              <Activity className="h-4 w-4 mr-2" />
              更新
            </Button>
            <Button size="sm" asChild>
              <a href="/servers/new">
                <Plus className="h-4 w-4 mr-2" />
                サーバー追加
              </a>
            </Button>
          </div>
        </div>

        {/* システム概要カード */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Server className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-semibold">{stats?.servers.total || 0}</p>
                  <p className="text-sm text-gray-600">サーバー</p>
                </div>
              </div>
              <div className="mt-2 flex items-center space-x-4 text-sm">
                <div className="flex items-center space-x-1">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>{stats?.servers.running || 0}実行中</span>
                </div>
                <div className="flex items-center space-x-1">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <span>{stats?.servers.error || 0}エラー</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Users className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-2xl font-semibold">{stats?.users.active || 0}</p>
                  <p className="text-sm text-gray-600">アクティブユーザー</p>
                </div>
              </div>
              <div className="mt-2 text-sm text-gray-500">
                総数: {stats?.users.total || 0}人
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-8 w-8 text-purple-500" />
                <div>
                  <p className="text-2xl font-semibold">{stats?.activity.todayActions || 0}</p>
                  <p className="text-sm text-gray-600">本日のアクション</p>
                </div>
              </div>
              <div className="mt-2 text-sm text-gray-500">
                週間: {stats?.activity.weeklyActions || 0}件
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Activity className="h-8 w-8 text-orange-500" />
                <div>
                  <p className="text-2xl font-semibold">{stats?.system.cpuUsage.toFixed(1) || 0}%</p>
                  <p className="text-sm text-gray-600">CPU使用率</p>
                </div>
              </div>
              <div className="mt-2 text-sm text-gray-500">
                メモリ: {stats?.system.memoryUsage.toFixed(1) || 0}%
              </div>
            </CardContent>
          </Card>
        </div>

        {/* クイックアクション */}
        <Card>
          <CardHeader>
            <CardTitle>クイックアクション</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Button variant="outline" className="justify-start" asChild>
                <a href="/servers/new">
                  <Server className="h-4 w-4 mr-2" />
                  新しいサーバー
                </a>
              </Button>
              <Button variant="outline" className="justify-start" asChild>
                <a href="/catalog">
                  <Package className="h-4 w-4 mr-2" />
                  カタログ検索
                </a>
              </Button>
              <Button variant="outline" className="justify-start" asChild>
                <a href="/monitoring">
                  <Activity className="h-4 w-4 mr-2" />
                  監視ダッシュボード
                </a>
              </Button>
              <Button variant="outline" className="justify-start" asChild>
                <a href="/settings">
                  <TrendingUp className="h-4 w-4 mr-2" />
                  システム設定
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* サーバー一覧 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>サーバー管理</CardTitle>
              <Button variant="outline" size="sm" asChild>
                <a href="/servers">すべて表示</a>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ServerList
              servers={servers}
              isLoading={isLoading}
              error={error}
              onRefresh={loadDashboardData}
              onServerStart={handleServerStart}
              onServerStop={handleServerStop}
            />
          </CardContent>
        </Card>

        {/* 監視ダッシュボード（簡略版） */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>システム監視</CardTitle>
              <Button variant="outline" size="sm" asChild>
                <a href="/monitoring">詳細表示</a>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <MonitoringDashboard
              serverMetrics={servers.map(server => ({
                serverId: server.id,
                serverName: server.name,
                status: server.status,
                healthStatus: server.healthStatus || 'unknown',
                uptime: server.uptime || 0,
                cpu: {
                  current: server.resourceUsage?.cpu || 0,
                  average: server.resourceUsage?.cpu || 0,
                  peak: server.resourceUsage?.cpu || 0,
                  history: []
                },
                memory: {
                  used: server.resourceUsage?.memory || 0,
                  total: server.resourceUsage?.memoryLimit || 0,
                  percentage: server.resourceUsage 
                    ? (server.resourceUsage.memory / server.resourceUsage.memoryLimit) * 100 
                    : 0,
                  history: []
                },
                disk: {
                  used: 0,
                  total: 0,
                  percentage: 0,
                  history: []
                },
                network: {
                  bytesIn: 0,
                  bytesOut: 0,
                  packetsIn: 0,
                  packetsOut: 0,
                  history: []
                },
                responseTime: {
                  current: Math.random() * 100,
                  average: Math.random() * 100,
                  history: []
                },
                errorRate: {
                  current: Math.random() * 5,
                  total: Math.random() * 100,
                  history: []
                },
                lastUpdated: new Date().toISOString()
              }))}
              alerts={[]}
              isLoading={isLoading}
              error={error}
              onRefresh={loadDashboardData}
            />
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}