'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import MainLayout from '@/components/layout/MainLayout';
import PageHeader from '@/components/layout/PageHeader';
import { CardLoading } from '@/components/common/LoadingSpinner';
import {
  ServerIcon,
  CatalogIcon,
  KeyIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  CpuChipIcon,
} from '@heroicons/react/24/outline';

// =============================================================================
// ダッシュボードページ
// システム概要と主要メトリクスの表示
// =============================================================================

interface DashboardStats {
  servers: {
    total: number;
    running: number;
    stopped: number;
    error: number;
  };
  secrets: {
    total: number;
    expiringSoon: number;
  };
  catalog: {
    availableItems: number;
    installedItems: number;
  };
  jobs: {
    running: number;
    completed: number;
    failed: number;
  };
}

interface RecentActivity {
  id: string;
  type: 'server' | 'catalog' | 'secret' | 'job';
  action: string;
  resource: string;
  status: 'success' | 'warning' | 'error';
  timestamp: string;
  user?: string;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // 統計データの取得（並列実行）
      const [serversRes, secretsRes, catalogRes, jobsRes, activityRes] = await Promise.all([
        fetch('/api/v1/servers?limit=1000'),
        fetch('/api/v1/secrets?limit=1000'),
        fetch('/api/v1/catalog?limit=1000'),
        fetch('/api/v1/jobs?limit=100'),
        fetch('/api/v1/audit/recent?limit=10'),
      ]);

      // サーバー統計
      const serversData = await serversRes.json();
      const servers = serversData.success ? serversData.data : [];
      
      // シークレット統計
      const secretsData = await secretsRes.json();
      const secrets = secretsData.success ? secretsData.data : [];
      
      // カタログ統計
      const catalogData = await catalogRes.json();
      const catalog = catalogData.success ? catalogData.data : [];
      
      // ジョブ統計
      const jobsData = await jobsRes.json();
      const jobs = jobsData.success ? jobsData.data : [];
      
      // アクティビティ履歴
      const activityData = await activityRes.json();
      const activities = activityData.success ? activityData.data : [];

      // 統計データの集計
      const dashboardStats: DashboardStats = {
        servers: {
          total: servers.length,
          running: servers.filter((s: any) => s.status === 'running').length,
          stopped: servers.filter((s: any) => s.status === 'stopped').length,
          error: servers.filter((s: any) => s.status === 'error').length,
        },
        secrets: {
          total: secrets.length,
          expiringSoon: secrets.filter((s: any) => {
            if (!s.expiresAt) return false;
            const expiryDate = new Date(s.expiresAt);
            const thirtyDaysFromNow = new Date();
            thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
            return expiryDate <= thirtyDaysFromNow;
          }).length,
        },
        catalog: {
          availableItems: catalog.length,
          installedItems: servers.length, // インストール済みサーバー数
        },
        jobs: {
          running: jobs.filter((j: any) => j.status === 'running').length,
          completed: jobs.filter((j: any) => j.status === 'completed').length,
          failed: jobs.filter((j: any) => j.status === 'failed').length,
        },
      };

      setStats(dashboardStats);
      setRecentActivity(activities);

    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="px-4 sm:px-6 lg:px-8">
          <CardLoading text="ダッシュボードを読み込み中..." />
        </div>
      </MainLayout>
    );
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 60) {
      return `${diffMinutes}分前`;
    } else if (diffHours < 24) {
      return `${diffHours}時間前`;
    } else {
      return `${diffDays}日前`;
    }
  };

  const getActivityIcon = (type: string, status: string) => {
    const iconClass = status === 'success' ? 'text-green-500' : 
                     status === 'warning' ? 'text-yellow-500' : 'text-red-500';
    
    switch (type) {
      case 'server':
        return <ServerIcon className={`h-5 w-5 ${iconClass}`} />;
      case 'catalog':
        return <CatalogIcon className={`h-5 w-5 ${iconClass}`} />;
      case 'secret':
        return <KeyIcon className={`h-5 w-5 ${iconClass}`} />;
      case 'job':
        return <ChartBarIcon className={`h-5 w-5 ${iconClass}`} />;
      default:
        return <ChartBarIcon className={`h-5 w-5 ${iconClass}`} />;
    }
  };

  return (
    <MainLayout>
      <PageHeader
        title={`おはようございます、${session?.user?.name || 'ユーザー'}さん`}
        description="Docker MCP環境の概要とシステム状況をご確認ください。"
      />

      <div className="px-4 sm:px-6 lg:px-8">
        {/* Statistics cards */}
        <div className="mt-8">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {/* Servers card */}
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <ServerIcon className="h-6 w-6 text-blue-600" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        サーバー
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {stats?.servers.total || 0}
                      </dd>
                    </dl>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex text-sm text-gray-600">
                    <span className="flex items-center">
                      <CheckCircleIcon className="h-4 w-4 text-green-500 mr-1" />
                      {stats?.servers.running || 0} 実行中
                    </span>
                    <span className="flex items-center ml-3">
                      <ClockIcon className="h-4 w-4 text-gray-400 mr-1" />
                      {stats?.servers.stopped || 0} 停止中
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Secrets card */}
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <KeyIcon className="h-6 w-6 text-yellow-600" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        シークレット
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {stats?.secrets.total || 0}
                      </dd>
                    </dl>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex text-sm text-gray-600">
                    {(stats?.secrets.expiringSoon || 0) > 0 ? (
                      <span className="flex items-center text-yellow-600">
                        <ExclamationTriangleIcon className="h-4 w-4 mr-1" />
                        {stats?.secrets.expiringSoon} 期限間近
                      </span>
                    ) : (
                      <span className="flex items-center text-green-600">
                        <CheckCircleIcon className="h-4 w-4 mr-1" />
                        すべて有効
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Catalog card */}
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <CatalogIcon className="h-6 w-6 text-purple-600" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        カタログ
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {stats?.catalog.availableItems || 0}
                      </dd>
                    </dl>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex text-sm text-gray-600">
                    <span>
                      {stats?.catalog.installedItems || 0} インストール済み
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Jobs card */}
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <CpuChipIcon className="h-6 w-6 text-green-600" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        ジョブ
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {(stats?.jobs.running || 0) + (stats?.jobs.completed || 0) + (stats?.jobs.failed || 0)}
                      </dd>
                    </dl>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex text-sm text-gray-600">
                    <span className="flex items-center">
                      <div className="h-2 w-2 bg-blue-400 rounded-full mr-1" />
                      {stats?.jobs.running || 0} 実行中
                    </span>
                    <span className="flex items-center ml-3">
                      <div className="h-2 w-2 bg-green-400 rounded-full mr-1" />
                      {stats?.jobs.completed || 0} 完了
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent activity */}
        <div className="mt-8">
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                最近のアクティビティ
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                システムの最新の変更とイベント
              </p>
            </div>
            <ul className="divide-y divide-gray-200">
              {recentActivity.length > 0 ? (
                recentActivity.map((activity) => (
                  <li key={activity.id} className="px-4 py-4 hover:bg-gray-50">
                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0">
                        {getActivityIcon(activity.type, activity.status)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <p className="text-sm font-medium text-gray-900">
                            {activity.action}
                          </p>
                          <span className="text-sm text-gray-500">
                            {activity.resource}
                          </span>
                        </div>
                        <div className="flex items-center mt-1 space-x-2">
                          <p className="text-xs text-gray-500">
                            {formatTimestamp(activity.timestamp)}
                          </p>
                          {activity.user && (
                            <p className="text-xs text-gray-400">
                              by {activity.user}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          activity.status === 'success' 
                            ? 'bg-green-100 text-green-800'
                            : activity.status === 'warning'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {activity.status === 'success' ? '成功' : 
                           activity.status === 'warning' ? '警告' : 'エラー'}
                        </span>
                      </div>
                    </div>
                  </li>
                ))
              ) : (
                <li className="px-4 py-12 text-center">
                  <p className="text-sm text-gray-500">
                    最近のアクティビティはありません
                  </p>
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* Quick actions */}
        <div className="mt-8 mb-8">
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                クイックアクション
              </h3>
            </div>
            <div className="px-4 py-5 sm:px-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <a
                  href="/servers/new"
                  className="relative block p-4 border border-gray-300 rounded-lg hover:border-blue-500 hover:shadow-md transition-all duration-200"
                >
                  <div className="flex items-center">
                    <ServerIcon className="h-6 w-6 text-blue-600" />
                    <span className="ml-3 text-sm font-medium text-gray-900">
                      新しいサーバー
                    </span>
                  </div>
                </a>
                
                <a
                  href="/catalog"
                  className="relative block p-4 border border-gray-300 rounded-lg hover:border-purple-500 hover:shadow-md transition-all duration-200"
                >
                  <div className="flex items-center">
                    <CatalogIcon className="h-6 w-6 text-purple-600" />
                    <span className="ml-3 text-sm font-medium text-gray-900">
                      カタログを探す
                    </span>
                  </div>
                </a>
                
                <a
                  href="/secrets/new"
                  className="relative block p-4 border border-gray-300 rounded-lg hover:border-yellow-500 hover:shadow-md transition-all duration-200"
                >
                  <div className="flex items-center">
                    <KeyIcon className="h-6 w-6 text-yellow-600" />
                    <span className="ml-3 text-sm font-medium text-gray-900">
                      シークレット追加
                    </span>
                  </div>
                </a>
                
                <a
                  href="/logs/realtime"
                  className="relative block p-4 border border-gray-300 rounded-lg hover:border-green-500 hover:shadow-md transition-all duration-200"
                >
                  <div className="flex items-center">
                    <ChartBarIcon className="h-6 w-6 text-green-600" />
                    <span className="ml-3 text-sm font-medium text-gray-900">
                      リアルタイム監視
                    </span>
                  </div>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}