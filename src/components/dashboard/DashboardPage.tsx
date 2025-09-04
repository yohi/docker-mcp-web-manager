/**
 * ダッシュボードページコンポーネント
 * 
 * 機能要件：
 * - サーバー一覧の表示と管理
 * - リアルタイム状態監視
 * - サーバー作成・詳細表示
 * - 統計情報とメトリクス表示
 * - 通知とアラート管理
 */

'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Server, ServerStatus } from '@/types/server';
import { useAuth } from '@/components/auth/AuthProvider';
import ServerList from './ServerList';
import ServerDetail from './ServerDetail';
import ServerCreateForm from './ServerCreateForm';

/**
 * ビューモード
 */
type ViewMode = 'dashboard' | 'list' | 'create' | 'detail';

/**
 * 統計情報
 */
interface DashboardStats {
  total: number;
  running: number;
  stopped: number;
  error: number;
  starting: number;
  stopping: number;
}

/**
 * ダッシュボードページコンポーネント
 */
export default function DashboardPage() {
  const { user, hasPermission, hasRole } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [servers, setServers] = useState<Server[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null);

  // 権限チェック
  const canViewServers = hasPermission('servers:view') || hasRole('admin' as any);
  const canCreateServers = hasPermission('servers:create') || hasRole('admin' as any);
  const canManageServers = hasPermission('servers:manage') || hasRole('admin' as any);

  /**
   * 統計情報の計算
   */
  const stats = useMemo((): DashboardStats => {
    return servers.reduce(
      (acc, server) => {
        acc.total += 1;
        switch (server.status) {
          case ServerStatus.RUNNING:
            acc.running += 1;
            break;
          case ServerStatus.STOPPED:
            acc.stopped += 1;
            break;
          case ServerStatus.ERROR:
            acc.error += 1;
            break;
          case ServerStatus.STARTING:
            acc.starting += 1;
            break;
          case ServerStatus.STOPPING:
            acc.stopping += 1;
            break;
        }
        return acc;
      },
      {
        total: 0,
        running: 0,
        stopped: 0,
        error: 0,
        starting: 0,
        stopping: 0,
      }
    );
  }, [servers]);

  /**
   * サーバーリストの取得
   */
  const fetchServers = useCallback(async () => {
    if (!canViewServers) return;

    try {
      setError(null);
      const response = await fetch('/api/v1/servers', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('サーバー情報を表示する権限がありません');
        }
        throw new Error('サーバーリストの取得に失敗しました');
      }

      const result = await response.json();
      setServers(result.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '予期しないエラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  }, [canViewServers]);

  /**
   * サーバーアクション
   */
  const handleServerStart = useCallback(async (serverId: string) => {
    const response = await fetch(`/api/v1/servers/${serverId}/start`, {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error('サーバーの開始に失敗しました');
    }
    await fetchServers(); // リストを更新
  }, [fetchServers]);

  const handleServerStop = useCallback(async (serverId: string) => {
    const response = await fetch(`/api/v1/servers/${serverId}/stop`, {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error('サーバーの停止に失敗しました');
    }
    await fetchServers(); // リストを更新
  }, [fetchServers]);

  const handleServerRestart = useCallback(async (serverId: string) => {
    const response = await fetch(`/api/v1/servers/${serverId}/restart`, {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error('サーバーの再起動に失敗しました');
    }
    await fetchServers(); // リストを更新
  }, [fetchServers]);

  const handleServerDelete = useCallback(async (serverId: string) => {
    if (!confirm('本当にこのサーバーを削除しますか？この操作は元に戻せません。')) {
      return;
    }

    const response = await fetch(`/api/v1/servers/${serverId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error('サーバーの削除に失敗しました');
    }
    await fetchServers(); // リストを更新
  }, [fetchServers]);

  /**
   * ビュー変更ハンドラ
   */
  const handleViewDetails = useCallback((serverId: string) => {
    setSelectedServerId(serverId);
    setViewMode('detail');
  }, []);

  const handleCreateServer = useCallback(() => {
    setViewMode('create');
  }, []);

  const handleServerCreated = useCallback((serverId: string) => {
    fetchServers(); // リストを更新
    setSelectedServerId(serverId);
    setViewMode('detail');
  }, [fetchServers]);

  const handleCloseModal = useCallback(() => {
    setSelectedServerId(null);
    setViewMode('dashboard');
  }, []);

  /**
   * 自動更新の設定
   */
  useEffect(() => {
    if (canViewServers) {
      fetchServers();
      
      // 5秒ごとに自動更新
      const interval = setInterval(fetchServers, 5000);
      setRefreshInterval(interval);

      return () => {
        if (interval) clearInterval(interval);
      };
    }
  }, [fetchServers, canViewServers]);

  /**
   * クリーンアップ
   */
  useEffect(() => {
    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [refreshInterval]);

  /**
   * 権限がない場合
   */
  if (!canViewServers) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
          <div className="text-center">
            <div className="text-red-500 mb-4">
              <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">アクセス権限がありません</h3>
            <p className="text-sm text-gray-600">ダッシュボードを表示する権限がありません。管理者にお問い合わせください。</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-gray-900">Docker MCP Manager</h1>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-gray-600">
                  {user?.name || user?.email} としてログイン中
                </span>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* ビューモード切り替え */}
              <div className="flex border rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode('dashboard')}
                  className={`px-3 py-2 text-sm font-medium ${
                    viewMode === 'dashboard'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <svg className="w-4 h-4 mr-2 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  ダッシュボード
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-2 text-sm font-medium ${
                    viewMode === 'list'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <svg className="w-4 h-4 mr-2 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                  リスト表示
                </button>
              </div>

              {/* サーバー作成ボタン */}
              {canCreateServers && (
                <button
                  onClick={handleCreateServer}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  サーバーを作成
                </button>
              )}

              {/* 更新ボタン */}
              <button
                onClick={fetchServers}
                disabled={isLoading}
                className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="ml-2">更新</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 統計カード */}
        {(viewMode === 'dashboard' || viewMode === 'list') && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
            <StatCard
              title="総サーバー数"
              value={stats.total}
              icon="servers"
              color="blue"
            />
            <StatCard
              title="稼働中"
              value={stats.running}
              icon="running"
              color="green"
            />
            <StatCard
              title="停止中"
              value={stats.stopped}
              icon="stopped"
              color="gray"
            />
            <StatCard
              title="エラー"
              value={stats.error}
              icon="error"
              color="red"
            />
            <StatCard
              title="処理中"
              value={stats.starting + stats.stopping}
              icon="loading"
              color="yellow"
            />
          </div>
        )}

        {/* エラー表示 */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">エラーが発生しました</h3>
                <div className="mt-2 text-sm text-red-700">{error}</div>
              </div>
            </div>
          </div>
        )}

        {/* コンテンツエリア */}
        {viewMode === 'create' ? (
          <ServerCreateForm
            onSuccess={handleServerCreated}
            onCancel={handleCloseModal}
            className="max-w-4xl mx-auto"
          />
        ) : viewMode === 'detail' && selectedServerId ? (
          <ServerDetail
            serverId={selectedServerId}
            onClose={handleCloseModal}
            className="max-w-6xl mx-auto h-[calc(100vh-12rem)]"
          />
        ) : (
          <ServerList
            servers={servers}
            isLoading={isLoading}
            onStart={handleServerStart}
            onStop={handleServerStop}
            onRestart={handleServerRestart}
            onDelete={handleServerDelete}
            onViewDetails={handleViewDetails}
            viewMode={viewMode === 'dashboard' ? 'grid' : 'table'}
            className="bg-white rounded-lg shadow"
          />
        )}
      </div>
    </div>
  );
}

/**
 * 統計カードコンポーネント
 */
function StatCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: number;
  icon: string;
  color: 'blue' | 'green' | 'gray' | 'red' | 'yellow';
}) {
  const colorClasses = {
    blue: 'text-blue-600 bg-blue-100',
    green: 'text-green-600 bg-green-100',
    gray: 'text-gray-600 bg-gray-100',
    red: 'text-red-600 bg-red-100',
    yellow: 'text-yellow-600 bg-yellow-100',
  };

  const getIcon = (iconType: string) => {
    switch (iconType) {
      case 'servers':
        return (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
        );
      case 'running':
        return (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        );
      case 'stopped':
        return (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        );
      case 'error':
        return (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        );
      case 'loading':
        return (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-white overflow-hidden shadow rounded-lg">
      <div className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className={`inline-flex items-center justify-center p-3 rounded-md ${colorClasses[color]}`}>
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {getIcon(icon)}
              </svg>
            </div>
          </div>
          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-gray-500 truncate">{title}</dt>
              <dd className="text-lg font-medium text-gray-900">{value.toLocaleString()}</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}