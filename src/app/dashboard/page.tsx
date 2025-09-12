'use client';

import { useState, useEffect, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
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
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [stats, setStats] = useState<DashboardStats>(defaultStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 認証状態のチェック（簡素化 + 開発環境バイパス）
  useEffect(() => {
    console.log('[DASHBOARD] Session status:', sessionStatus);
    console.log('[DASHBOARD] Session data:', session);
    
    // 開発環境での認証バイパス
    if (process.env.NODE_ENV === 'development') {
      console.log('[DASHBOARD] Development mode - skipping authentication, fetching stats...');
      fetchDashboardStats();
      return;
    }
    
    if (sessionStatus === 'loading') {
      console.log('[DASHBOARD] Session loading, waiting...');
      return;
    }
    
    if (sessionStatus === 'unauthenticated' || !session) {
      console.log('[DASHBOARD] Not authenticated, redirecting to signin');
      router.push('/auth/signin');
      return;
    }
    
    if (sessionStatus === 'authenticated' && session) {
      console.log('[DASHBOARD] Authenticated, fetching stats...');
      fetchDashboardStats();
    }
  }, [session, sessionStatus, router]);

  const fetchDashboardStats = async () => {
    try {
      console.log('[DASHBOARD] 🚀 Starting to fetch dashboard stats...');
      setLoading(true);
      setError(null);

      // 新しい統一されたダッシュボード統計APIから取得
      const response = await fetch('/api/v1/dashboard/stats');
      console.log('[DASHBOARD] 📡 API Response status:', response.status, response.statusText);

      if (!response.ok) {
        throw new Error(`API returned ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('[DASHBOARD] 📊 Raw API Data:', result);
      
      const statsData = result.data || result;
      console.log('[DASHBOARD] ✅ Processed stats data:', statsData);
      
      setStats(statsData);
      console.log('[DASHBOARD] ✅ Stats successfully set, loading complete');
    } catch (error) {
      console.error('[DASHBOARD] ❌ Failed to fetch dashboard stats:', error);
      setError(`統計情報の読み込みに失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);

      // フォールバックデータを設定
      const fallbackStats = {
        servers: { total: 0, running: 0, stopped: 0, error: 0 },
        catalog: { available: 0, installed: 0 },
        system: { uptime: 'N/A', version: '2.0.0', lastUpdated: new Date().toISOString() },
        resources: { cpu: 0, memory: 0, disk: 0 },
      };
      
      console.log('[DASHBOARD] 🔄 Setting fallback stats:', fallbackStats);
      setStats(fallbackStats);
    } finally {
      console.log('[DASHBOARD] 🏁 Setting loading to false');
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

  // 開発環境以外での認証状態チェック
  if (process.env.NODE_ENV !== 'development') {
    // 認証ローディング中または未認証の場合の表示
    if (sessionStatus === 'loading') {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
            <p className="mt-2 text-gray-600">認証状態を確認中...</p>
          </div>
        </div>
      );
    }

    if (!session) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
            <p className="mt-2 text-gray-600">サインインページにリダイレクト中...</p>
          </div>
        </div>
      ); // リダイレクトが実行されるまで何も表示しない
    }
  }

  // ローディング表示用のコンポーネント（開発環境対応）
  const LoadingContent = () => (
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
  );

  if (loading) {
    // 開発環境ではProtectedRouteを無効化
    if (process.env.NODE_ENV === 'development') {
      return <LoadingContent />;
    } else {
      return (
        <ProtectedRoute>
          <LoadingContent />
        </ProtectedRoute>
      );
    }
  }

  // エラー表示用のコンポーネント（開発環境対応）
  const ErrorContent = () => (
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
  );

  if (error) {
    // 開発環境ではProtectedRouteを無効化
    if (process.env.NODE_ENV === 'development') {
      return <ErrorContent />;
    } else {
      return (
        <ProtectedRoute>
          <ErrorContent />
        </ProtectedRoute>
      );
    }
  }

  // メインダッシュボードコンテンツ
  const DashboardContent = () => (
      <div className="container mx-auto p-6 space-y-6">
        {/* ヘッダー */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard - UPDATED 🔄</h1>
            <p className="text-muted-foreground">
              Docker MCP Web Manager overview and system status - Version Test 🧪
            </p>
            <div style={{
              backgroundColor: 'yellow', 
              padding: '10px', 
              margin: '10px 0',
              border: '2px solid red',
              fontSize: '18px',
              fontWeight: 'bold'
            }}>
              ⚠️ TEST: If you see this yellow box, the page is updating correctly!
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {/* 基本的なHTML buttonでテスト */}
            <button
              onClick={() => {
                console.log('[DASHBOARD] HTML button clicked!');
                console.log('[DASHBOARD] Router object:', router);
                alert('HTML button works!');
                try {
                  router.push('/servers/new');
                  console.log('[DASHBOARD] Router.push called successfully');
                } catch (error) {
                  console.error('[DASHBOARD] Router.push failed:', error);
                }
              }}
              style={{
                backgroundColor: '#007bff',
                color: 'white',
                padding: '8px 16px',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              🚀 HTML Test
            </button>
            
            <a href="/servers/new" style={{ textDecoration: 'none' }}>
              <button
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
                onMouseOver={(e) => e.target.style.backgroundColor = '#0056b3'}
                onMouseOut={(e) => e.target.style.backgroundColor = '#007bff'}
              >
                <Plus className="h-4 w-4" />
                <span>Add Server</span>
              </button>
            </a>
            
            {/* デバッグ用テストボタン */}
            <Button
              onClick={() => {
                alert('Test button clicked!');
                console.log('[DASHBOARD] Test button clicked!');
              }}
              variant="outline"
              size="sm"
            >
              🧪 Test
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

        {/* メインコンテンツ - デスクトップ用サイドバー表示 */}
        <div className="hidden lg:grid grid-cols-1 lg:grid-cols-3 gap-6">
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

        {/* サーバー一覧 - モバイル/タブレット用 */}
        <Card className="block lg:hidden">
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

        {/* 監視ダッシュボード（簡略版） - モバイル/タブレット用 */}
        <Card className="block lg:hidden">
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
  );

  // 開発環境ではProtectedRouteを無効化
  if (process.env.NODE_ENV === 'development') {
    return <DashboardContent />;
  } else {
    return (
      <ProtectedRoute>
        <DashboardContent />
      </ProtectedRoute>
    );
  }
}
