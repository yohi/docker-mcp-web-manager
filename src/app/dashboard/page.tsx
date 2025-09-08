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

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      setLoading(true);
      setError(null);

      // 複数のAPIエンドポイントから統計を取得
      const [serversRes, catalogRes, systemRes] = await Promise.allSettled([
        fetch('/api/v1/servers'),
        fetch('/api/v1/catalog'),
        fetch('/api/v1/system/status'),
      ]);

      // レスポンスを処理
      const servers = serversRes.status === 'fulfilled' 
        ? await serversRes.value.json()
        : { data: [] };
      
      const catalog = catalogRes.status === 'fulfilled'
        ? await catalogRes.value.json()
        : { data: [] };
      
      const system = systemRes.status === 'fulfilled'
        ? await systemRes.value.json()
        : { data: { uptime: 'N/A', version: 'N/A', lastUpdated: 'N/A' } };

      // 統計を計算
      const serverData = servers.data || [];
      const serverStats = {
        total: serverData.length,
        running: serverData.filter((s: any) => s.status === 'running').length,
        stopped: serverData.filter((s: any) => s.status === 'stopped').length,
        error: serverData.filter((s: any) => s.status === 'error').length,
      };

      const catalogData = catalog.data || [];
      const catalogStats = {
        available: catalogData.length,
        installed: serverData.length,
      };

      setStats({
        servers: serverStats,
        catalog: catalogStats,
        system: system.data || { uptime: 'N/A', version: 'N/A', lastUpdated: 'N/A' },
        resources: {
          cpu: Math.round(Math.random() * 100), // Mock data - 実際の実装では監視APIから取得
          memory: Math.round(Math.random() * 100),
          disk: Math.round(Math.random() * 100),
        },
      });
    } catch (error) {
      console.error('Failed to fetch dashboard stats:', error);
      setError('Failed to load dashboard statistics');
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
          <Button className="flex items-center space-x-2">
            <Plus className="h-4 w-4" />
            <span>Add Server</span>
          </Button>
        </div>

        {/* 統計カード */}
        {stats && (
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
        )}

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
                  limit={5}
                  showActions={false}
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
                  compact={true}
                  className="border-0 shadow-none"
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}