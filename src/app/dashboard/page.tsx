'use client';

import { useState, useEffect, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { ProtectedRoute } from '@/components/auth/protected-route';
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
  CheckCircle,
  Loader2
} from 'lucide-react';

// コード分割：重いコンポーネントを遅延読み込み
const ServerList = dynamic(() => import('@/components/servers/server-list').then(mod => ({ default: mod.ServerList })), {
  loading: () => (
    <div className="flex items-center justify-center p-8">
      <Loader2 className="h-8 w-8 animate-spin" />
      <span className="ml-2">サーバーリストを読み込み中...</span>
    </div>
  ),
  ssr: false
});

const MonitoringDashboard = dynamic(() => import('@/components/monitoring/monitoring-dashboard').then(mod => ({ default: mod.MonitoringDashboard })), {
  loading: () => (
    <div className="flex items-center justify-center p-8">
      <Loader2 className="h-8 w-8 animate-spin" />
      <span className="ml-2">監視ダッシュボードを読み込み中...</span>
    </div>
  ),
  ssr: false
});

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
  catalog: {
    available: number;
    installed: number;
  };
  system: {
    uptime: string;
    version: string;
    lastUpdated: string;
  };
  resources: {
    cpu: number;
    memory: number;
    disk: number;
  };
}

// デフォルト統計データ（ハイドレーション問題回避のため）
const defaultStats: DashboardStats = {
  servers: { total: 0, running: 0, stopped: 0, error: 0 },
  catalog: { available: 0, installed: 0 },
  system: { uptime: 'Loading...', version: '2.0.0', lastUpdated: new Date().toISOString() },
  resources: { cpu: 0, memory: 0, disk: 0 },
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>(defaultStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      console.log('🚀 Fetching dashboard stats...');
      setLoading(true);
      setError(null);

      // 新しい統一されたダッシュボード統計APIから取得
      const response = await fetch('/api/v1/dashboard/stats');
      console.log('📡 API Response:', response.status, response.statusText);

      if (!response.ok) {
        throw new Error(`Failed to fetch dashboard stats: ${response.status}`);
      }

      const result = await response.json();
      console.log('📊 API Data:', result);
      const statsData = result.data || result;

      console.log('✅ Setting stats:', statsData);
      setStats(statsData);
    } catch (error) {
      console.error('Failed to fetch dashboard stats:', error);
      setError('Failed to load dashboard statistics');

      // フォールバックデータを設定
      setStats({
        servers: { total: 0, running: 0, stopped: 0, error: 0 },
        catalog: { available: 0, installed: 0 },
        system: { uptime: 'N/A', version: '2.0.0', lastUpdated: new Date().toISOString() },
        resources: { cpu: 0, memory: 0, disk: 0 },
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (value: number): string => {
    if (value < 50) return 'text-green-600';
    if (value < 80) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getStatusBadgeVariant = (status: string): "default" | "secondary" | "destructive" => {
    switch (status) {
      case 'healthy':
        return 'default';
      case 'warning':
        return 'secondary';
      case 'error':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  if (loading) {
    return (
      <ProtectedRoute requiredPermissions={['DASHBOARD_READ']}>
        <div className="container mx-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="pt-6">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (error) {
    return (
      <ProtectedRoute requiredPermissions={['DASHBOARD_READ']}>
        <div className="container mx-auto p-6">
          <Card className="border-red-200">
            <CardContent className="pt-6">
              <div className="flex items-center space-x-2 text-red-600">
                <AlertTriangle className="h-5 w-5" />
                <span>{error}</span>
              </div>
              <Button
                onClick={fetchDashboardStats}
                className="mt-4"
                variant="outline"
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute requiredPermissions={['DASHBOARD_READ']}>
      <div className="container mx-auto p-6 space-y-6">
        {/* ヘッダー */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground">
              Docker MCP Web Manager overview and system status
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Button className="flex items-center space-x-2">
              <Plus className="h-4 w-4" />
              <span>Add Server</span>
            </Button>
          </div>
        </div>

        {/* 統計カード */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Servers</CardTitle>
              <Server className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.servers.total}</div>
              <div className="flex items-center space-x-2 text-xs text-muted-foreground mt-2">
                <CheckCircle className="h-3 w-3 text-green-500" />
                <span>{stats.servers.running} running</span>
                {stats.servers.error > 0 && (
                  <>
                    <AlertTriangle className="h-3 w-3 text-red-500" />
                    <span>{stats.servers.error} errors</span>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Catalog Entries</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.catalog.available}</div>
              <p className="text-xs text-muted-foreground">
                {stats.catalog.installed} installed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">System Resources</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>CPU:</span>
                  <span className={getStatusColor(stats.resources.cpu)}>
                    {stats.resources.cpu}%
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Memory:</span>
                  <span className={getStatusColor(stats.resources.memory)}>
                    {stats.resources.memory}%
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">System Status</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <Badge variant={getStatusBadgeVariant('healthy')}>
                  Operational
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Uptime: {stats.system.uptime}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* メインコンテンツ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* サーバーリスト */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Server className="h-5 w-5" />
                  <span>Recent Servers</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ServerList
                  className="border-0 shadow-none"
                />
              </CardContent>
            </Card>
          </div>

          {/* 監視ダッシュボード */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Activity className="h-5 w-5" />
                  <span>System Monitoring</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <MonitoringDashboard
                  className="border-0 shadow-none"
                />
              </CardContent>
            </Card>
          </div>
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
            <Suspense fallback={
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin" />
                <span className="ml-2">サーバーリストを読み込み中...</span>
              </div>
            }>
              <ServerList />
            </Suspense>
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
            <Suspense fallback={
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin" />
                <span className="ml-2">監視ダッシュボードを読み込み中...</span>
              </div>
            }>
              <MonitoringDashboard />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}
