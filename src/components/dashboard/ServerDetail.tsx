/**
 * サーバー詳細コンポーネント
 * 
 * 機能要件：
 * - 詳細情報の表示
 * - リアルタイム状態更新
 * - ログ表示
 * - 設定編集
 * - 環境変数管理
 * - ボリューム管理
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Server, ServerStatus, ServerLog } from '@/types/server';
import { useAuth } from '@/components/auth/AuthProvider';

/**
 * サーバー詳細のプロパティ
 */
interface ServerDetailProps {
  serverId: string;
  onClose: () => void;
  className?: string;
}

/**
 * タブ定義
 */
type TabType = 'overview' | 'logs' | 'config' | 'environment' | 'volumes' | 'network' | 'monitoring';

interface Tab {
  id: TabType;
  label: string;
  icon: React.ReactNode;
}

const tabs: Tab[] = [
  {
    id: 'overview',
    label: '概要',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    id: 'logs',
    label: 'ログ',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    id: 'config',
    label: '設定',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    id: 'environment',
    label: '環境変数',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h2a4 4 0 004-4V5z" />
      </svg>
    ),
  },
  {
    id: 'volumes',
    label: 'ボリューム',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
      </svg>
    ),
  },
  {
    id: 'network',
    label: 'ネットワーク',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
      </svg>
    ),
  },
  {
    id: 'monitoring',
    label: 'モニタリング',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
];

/**
 * ローディングスピナー
 */
function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  };

  return (
    <div className="flex justify-center items-center p-4">
      <svg
        className={`animate-spin text-blue-600 ${sizeClasses[size]}`}
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    </div>
  );
}

/**
 * エラー表示
 */
function ErrorMessage({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center p-6 text-center">
      <div className="text-red-500 mb-4">
        <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">エラーが発生しました</h3>
      <p className="text-sm text-gray-600 mb-4">{error}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          再試行
        </button>
      )}
    </div>
  );
}

/**
 * サーバー詳細コンポーネント
 */
export default function ServerDetail({
  serverId,
  onClose,
  className = '',
}: ServerDetailProps) {
  const { hasPermission, hasRole } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [server, setServer] = useState<Server | null>(null);
  const [logs, setLogs] = useState<ServerLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 権限チェック
  const canViewServers = hasPermission('servers:view') || hasRole('admin' as any);
  const canManageServers = hasPermission('servers:manage') || hasRole('admin' as any);

  /**
   * サーバー詳細の取得
   */
  const fetchServerDetail = useCallback(async () => {
    if (!canViewServers) {
      setError('サーバー情報を表示する権限がありません');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`/api/v1/servers/${serverId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('サーバーが見つかりません');
        } else if (response.status === 403) {
          throw new Error('アクセス権限がありません');
        } else {
          throw new Error('サーバー詳細の取得に失敗しました');
        }
      }

      const result = await response.json();
      setServer(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '予期しないエラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  }, [serverId, canViewServers]);

  /**
   * ログの取得
   */
  const fetchLogs = useCallback(async () => {
    if (!canViewServers) return;

    try {
      const response = await fetch(`/api/v1/servers/${serverId}/logs?limit=100`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('ログの取得に失敗しました');
      }

      const result = await response.json();
      setLogs(result.data || []);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    }
  }, [serverId, canViewServers]);

  /**
   * 初期化
   */
  useEffect(() => {
    fetchServerDetail();
    if (activeTab === 'logs') {
      fetchLogs();
    }
  }, [fetchServerDetail, fetchLogs, activeTab]);

  /**
   * タブ変更ハンドラ
   */
  const handleTabChange = useCallback((tab: TabType) => {
    setActiveTab(tab);
    
    // タブごとの追加データ読み込み
    if (tab === 'logs') {
      fetchLogs();
    }
  }, [fetchLogs]);

  /**
   * 権限がない場合
   */
  if (!canViewServers) {
    return (
      <div className={`bg-white rounded-lg shadow-lg ${className}`}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">サーバー詳細</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <ErrorMessage error="サーバー情報を表示する権限がありません" />
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-lg flex flex-col ${className}`}>
      {/* ヘッダー */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <h2 className="text-lg font-semibold text-gray-900">
            {server ? `${server.name} - サーバー詳細` : 'サーバー詳細'}
          </h2>
          {server && (
            <div className="flex items-center space-x-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  server.status === ServerStatus.RUNNING
                    ? 'bg-green-500 animate-pulse'
                    : server.status === ServerStatus.STOPPED
                    ? 'bg-gray-500'
                    : server.status === ServerStatus.ERROR
                    ? 'bg-red-500 animate-bounce'
                    : 'bg-yellow-500 animate-pulse'
                }`}
              />
              <span
                className={`text-xs font-medium px-2 py-1 rounded-full ${
                  server.status === ServerStatus.RUNNING
                    ? 'text-green-800 bg-green-100'
                    : server.status === ServerStatus.STOPPED
                    ? 'text-gray-800 bg-gray-100'
                    : server.status === ServerStatus.ERROR
                    ? 'text-red-800 bg-red-100'
                    : 'text-yellow-800 bg-yellow-100'
                }`}
              >
                {server.status === ServerStatus.RUNNING
                  ? '稼働中'
                  : server.status === ServerStatus.STOPPED
                  ? '停止中'
                  : server.status === ServerStatus.ERROR
                  ? 'エラー'
                  : server.status === ServerStatus.STARTING
                  ? '開始中'
                  : server.status === ServerStatus.STOPPING
                  ? '停止中'
                  : '不明'}
              </span>
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md p-1"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* タブ */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8 px-4" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center space-x-2 py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <LoadingSpinner size="lg" />
        ) : error ? (
          <ErrorMessage error={error} onRetry={fetchServerDetail} />
        ) : server ? (
          <div className="h-full overflow-y-auto p-4">
            {activeTab === 'overview' && (
              <OverviewTab server={server} onRefresh={fetchServerDetail} />
            )}
            {activeTab === 'logs' && (
              <LogsTab 
                logs={logs} 
                serverId={serverId}
                onRefresh={fetchLogs}
                canManage={canManageServers}
              />
            )}
            {activeTab === 'config' && (
              <ConfigTab 
                server={server} 
                onUpdate={fetchServerDetail}
                canManage={canManageServers}
              />
            )}
            {activeTab === 'environment' && (
              <EnvironmentTab 
                server={server} 
                onUpdate={fetchServerDetail}
                canManage={canManageServers}
              />
            )}
            {activeTab === 'volumes' && (
              <VolumesTab 
                server={server} 
                onUpdate={fetchServerDetail}
                canManage={canManageServers}
              />
            )}
            {activeTab === 'network' && (
              <NetworkTab 
                server={server} 
                onUpdate={fetchServerDetail}
                canManage={canManageServers}
              />
            )}
            {activeTab === 'monitoring' && (
              <MonitoringTab 
                server={server} 
                serverId={serverId}
              />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * 概要タブ
 */
function OverviewTab({ 
  server, 
  onRefresh 
}: { 
  server: Server; 
  onRefresh: () => void; 
}) {
  return (
    <div className="space-y-6">
      {/* 基本情報 */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-lg font-medium text-gray-900 mb-4">基本情報</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700">サーバー名</label>
            <p className="mt-1 text-sm text-gray-900">{server.name}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">イメージ</label>
            <p className="mt-1 text-sm text-gray-900 break-all">{server.image}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">作成日時</label>
            <p className="mt-1 text-sm text-gray-900">
              {new Date(server.createdAt).toLocaleString('ja-JP')}
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">更新日時</label>
            <p className="mt-1 text-sm text-gray-900">
              {new Date(server.updatedAt).toLocaleString('ja-JP')}
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">所有者</label>
            <p className="mt-1 text-sm text-gray-900">{server.owner || 'N/A'}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">稼働時間</label>
            <p className="mt-1 text-sm text-gray-900">{server.uptime || 'N/A'}</p>
          </div>
        </div>
      </div>

      {/* リソース使用量 */}
      {server.stats && (
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">リソース使用量</h3>
            <button
              onClick={onRefresh}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              更新
            </button>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="text-sm font-medium text-gray-700">CPU使用率</label>
              <div className="mt-2">
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>{server.stats.cpu.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${
                      server.stats.cpu > 80 ? 'bg-red-500' : 
                      server.stats.cpu > 60 ? 'bg-yellow-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(server.stats.cpu, 100)}%` }}
                  />
                </div>
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-700">メモリ使用量</label>
              <div className="mt-2">
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>{server.stats.memory.toFixed(1)}MB</span>
                  {server.stats.memoryLimit && <span>/ {server.stats.memoryLimit.toFixed(1)}MB</span>}
                </div>
                {server.stats.memoryLimit && (
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        (server.stats.memory / server.stats.memoryLimit) > 0.8 ? 'bg-red-500' : 'bg-blue-500'
                      }`}
                      style={{ 
                        width: `${Math.min((server.stats.memory / server.stats.memoryLimit) * 100, 100)}%` 
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {server.stats.network && (
            <div className="mt-6 grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">ネットワーク送信</label>
                <p className="mt-1 text-sm text-gray-900">{server.stats.network.tx}MB</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">ネットワーク受信</label>
                <p className="mt-1 text-sm text-gray-900">{server.stats.network.rx}MB</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ポート情報 */}
      {server.ports && server.ports.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h3 className="text-lg font-medium text-gray-900 mb-4">公開ポート</h3>
          <div className="flex flex-wrap gap-2">
            {server.ports.map((port, index) => (
              <span
                key={index}
                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
              >
                {port}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// その他のタブコンポーネントは別ファイルに分離予定
function LogsTab({ logs, serverId, onRefresh, canManage }: any) {
  return (
    <div>
      <p className="text-sm text-gray-600 mb-4">ログタブの実装（別ファイルに分離予定）</p>
    </div>
  );
}

function ConfigTab({ server, onUpdate, canManage }: any) {
  return (
    <div>
      <p className="text-sm text-gray-600 mb-4">設定タブの実装（別ファイルに分離予定）</p>
    </div>
  );
}

function EnvironmentTab({ server, onUpdate, canManage }: any) {
  return (
    <div>
      <p className="text-sm text-gray-600 mb-4">環境変数タブの実装（別ファイルに分離予定）</p>
    </div>
  );
}

function VolumesTab({ server, onUpdate, canManage }: any) {
  return (
    <div>
      <p className="text-sm text-gray-600 mb-4">ボリュームタブの実装（別ファイルに分離予定）</p>
    </div>
  );
}

function NetworkTab({ server, onUpdate, canManage }: any) {
  return (
    <div>
      <p className="text-sm text-gray-600 mb-4">ネットワークタブの実装（別ファイルに分離予定）</p>
    </div>
  );
}

function MonitoringTab({ server, serverId }: any) {
  return (
    <div>
      <p className="text-sm text-gray-600 mb-4">モニタリングタブの実装（別ファイルに分離予定）</p>
    </div>
  );
}