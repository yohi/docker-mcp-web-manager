/**
 * サーバー一覧コンポーネント
 * 
 * 機能要件：
 * - リアルタイムサーバー状態更新
 * - フィルタリング・検索機能
 * - ページネーション対応
 * - ソート機能
 * - バルク操作（一括開始・停止）
 * - サーバーアクション（開始・停止・再起動）
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../auth/AuthProvider';
import ServerCard from './ServerCard';

/**
 * サーバー状態
 */
export enum ServerStatus {
  RUNNING = 'running',
  STOPPED = 'stopped',
  ERROR = 'error',
  STARTING = 'starting',
  STOPPING = 'stopping',
}

/**
 * サーバー情報
 */
export interface Server {
  id: string;
  name: string;
  description?: string;
  status: ServerStatus;
  image: string;
  command: string[];
  environment: Record<string, string>;
  ports: Array<{
    internal: number;
    external?: number;
    protocol: 'tcp' | 'udp';
  }>;
  volumes: Array<{
    source: string;
    target: string;
    type: 'bind' | 'volume';
  }>;
  networks: string[];
  labels: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  lastStartedAt?: string;
  lastStoppedAt?: string;
  restartCount: number;
  cpuUsage?: number;
  memoryUsage?: number;
  networkRx?: number;
  networkTx?: number;
  logs?: string[];
  tools?: Array<{
    name: string;
    description: string;
    enabled: boolean;
  }>;
}

/**
 * ソート設定
 */
interface SortConfig {
  key: keyof Server | 'none';
  direction: 'asc' | 'desc';
}

/**
 * フィルター設定
 */
interface FilterConfig {
  search: string;
  status: ServerStatus | 'all';
  image: string;
}

/**
 * サーバー一覧のプロパティ
 */
interface ServerListProps {
  className?: string;
  showFilters?: boolean;
  showBulkActions?: boolean;
  pageSize?: number;
}

/**
 * サーバー一覧コンポーネント
 */
export default function ServerList({
  className = '',
  showFilters = true,
  showBulkActions = true,
  pageSize = 12,
}: ServerListProps) {
  const { hasPermission, isAdmin } = useAuth();
  
  // 状態管理
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedServers, setSelectedServers] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  
  // フィルター・ソート状態
  const [filters, setFilters] = useState<FilterConfig>({
    search: '',
    status: 'all',
    image: '',
  });
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: 'name',
    direction: 'asc',
  });
  
  // ページネーション
  const [currentPage, setCurrentPage] = useState(1);

  /**
   * サーバーデータの取得
   */
  const fetchServers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: pageSize.toString(),
        ...(filters.search && { search: filters.search }),
        ...(filters.status !== 'all' && { status: filters.status }),
        ...(filters.image && { image: filters.image }),
        ...(sortConfig.key !== 'none' && { 
          sort_by: sortConfig.key,
          sort_order: sortConfig.direction,
        }),
      });

      const response = await fetch(`/api/v1/servers?${params}`);
      
      if (!response.ok) {
        throw new Error(`サーバー一覧の取得に失敗しました: ${response.statusText}`);
      }
      
      const data = await response.json();
      setServers(data.data || []);
    } catch (error) {
      console.error('Error fetching servers:', error);
      setError(error instanceof Error ? error.message : 'サーバーの取得中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, filters, sortConfig]);

  /**
   * 初回データ取得
   */
  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  /**
   * リアルタイム更新（30秒間隔）
   */
  useEffect(() => {
    const interval = setInterval(fetchServers, 30000);
    return () => clearInterval(interval);
  }, [fetchServers]);

  /**
   * フィルター変更ハンドラ
   */
  const handleFilterChange = useCallback(<K extends keyof FilterConfig>(
    key: K,
    value: FilterConfig[K]
  ) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(1); // フィルター変更時は最初のページに戻る
  }, []);

  /**
   * ソート変更ハンドラ
   */
  const handleSortChange = useCallback((key: keyof Server) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
    setCurrentPage(1);
  }, []);

  /**
   * サーバー選択ハンドラ
   */
  const handleServerSelect = useCallback((serverId: string, selected: boolean) => {
    setSelectedServers(prev => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(serverId);
      } else {
        newSet.delete(serverId);
      }
      return newSet;
    });
  }, []);

  /**
   * 全選択・全解除
   */
  const handleSelectAll = useCallback((selected: boolean) => {
    if (selected) {
      setSelectedServers(new Set(servers.map(s => s.id)));
    } else {
      setSelectedServers(new Set());
    }
  }, [servers]);

  /**
   * サーバーアクション実行
   */
  const handleServerAction = useCallback(async (
    serverId: string,
    action: 'start' | 'stop' | 'restart' | 'enable' | 'disable'
  ) => {
    try {
      const response = await fetch(`/api/v1/servers/${serverId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (!response.ok) {
        throw new Error(`アクション実行に失敗しました: ${response.statusText}`);
      }

      // リストを更新
      await fetchServers();
    } catch (error) {
      console.error('Server action error:', error);
      setError(error instanceof Error ? error.message : 'サーバーアクションの実行中にエラーが発生しました');
    }
  }, [fetchServers]);

  /**
   * バルクアクション実行
   */
  const handleBulkAction = useCallback(async (action: 'start' | 'stop') => {
    if (selectedServers.size === 0) return;

    try {
      setBulkActionLoading(true);
      
      const promises = Array.from(selectedServers).map(serverId =>
        fetch(`/api/v1/servers/${serverId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        })
      );

      await Promise.all(promises);
      
      // 選択をクリア
      setSelectedServers(new Set());
      
      // リストを更新
      await fetchServers();
    } catch (error) {
      console.error('Bulk action error:', error);
      setError('一括操作の実行中にエラーが発生しました');
    } finally {
      setBulkActionLoading(false);
    }
  }, [selectedServers, fetchServers]);

  /**
   * フィルタリングされたサーバーリスト
   */
  const filteredServers = useMemo(() => {
    return servers.filter(server => {
      // 検索フィルター
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        if (!server.name.toLowerCase().includes(searchLower) && 
            !server.description?.toLowerCase().includes(searchLower)) {
          return false;
        }
      }
      
      // ステータスフィルター
      if (filters.status !== 'all' && server.status !== filters.status) {
        return false;
      }
      
      // イメージフィルター
      if (filters.image && !server.image.toLowerCase().includes(filters.image.toLowerCase())) {
        return false;
      }
      
      return true;
    });
  }, [servers, filters]);

  /**
   * エラー表示コンポーネント
   */
  const ErrorDisplay = () => (
    <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
      <div className="flex">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-red-800">エラー</h3>
          <p className="mt-1 text-sm text-red-700">{error}</p>
          <div className="mt-4">
            <button
              onClick={() => {
                setError(null);
                fetchServers();
              }}
              className="text-sm bg-red-100 text-red-800 rounded-md px-3 py-1 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              再試行
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`space-y-6 ${className}`}>
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">サーバー管理</h2>
          <p className="mt-1 text-sm text-gray-600">
            MCPサーバーの状態を監視・管理できます
          </p>
        </div>
        
        <div className="mt-4 sm:mt-0 flex space-x-2">
          <button
            onClick={fetchServers}
            disabled={loading}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            <svg className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            更新
          </button>
          
          {hasPermission('server:create') && (
            <button
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <svg className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              新規サーバー
            </button>
          )}
        </div>
      </div>

      {/* エラー表示 */}
      {error && <ErrorDisplay />}

      {/* フィルターバー */}
      {showFilters && (
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 検索 */}
            <div>
              <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
                検索
              </label>
              <input
                id="search"
                type="text"
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                placeholder="サーバー名、説明で検索..."
                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>

            {/* ステータスフィルター */}
            <div>
              <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
                ステータス
              </label>
              <select
                id="status"
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value as ServerStatus | 'all')}
                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="all">すべて</option>
                <option value={ServerStatus.RUNNING}>実行中</option>
                <option value={ServerStatus.STOPPED}>停止中</option>
                <option value={ServerStatus.ERROR}>エラー</option>
                <option value={ServerStatus.STARTING}>開始中</option>
                <option value={ServerStatus.STOPPING}>停止中</option>
              </select>
            </div>

            {/* イメージフィルター */}
            <div>
              <label htmlFor="image" className="block text-sm font-medium text-gray-700 mb-1">
                イメージ
              </label>
              <input
                id="image"
                type="text"
                value={filters.image}
                onChange={(e) => handleFilterChange('image', e.target.value)}
                placeholder="Dockerイメージで検索..."
                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* バルクアクション */}
      {showBulkActions && selectedServers.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <span className="text-sm text-blue-700">
                {selectedServers.size}台のサーバーが選択されています
              </span>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => handleBulkAction('start')}
                disabled={bulkActionLoading}
                className="inline-flex items-center px-3 py-2 border border-transparent text-xs font-medium rounded text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
              >
                一括開始
              </button>
              <button
                onClick={() => handleBulkAction('stop')}
                disabled={bulkActionLoading}
                className="inline-flex items-center px-3 py-2 border border-transparent text-xs font-medium rounded text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
              >
                一括停止
              </button>
              <button
                onClick={() => setSelectedServers(new Set())}
                className="inline-flex items-center px-3 py-2 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                選択解除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* サーバーリスト */}
      <div className="space-y-4">
        {/* 全選択チェックボックス */}
        {showBulkActions && servers.length > 0 && (
          <div className="flex items-center py-2">
            <input
              type="checkbox"
              checked={selectedServers.size === servers.length && servers.length > 0}
              onChange={(e) => handleSelectAll(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label className="ml-2 text-sm text-gray-700">
              全選択
            </label>
          </div>
        )}

        {/* ローディング状態 */}
        {loading && servers.length === 0 && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-500">サーバー情報を読み込み中...</p>
          </div>
        )}

        {/* 空状態 */}
        {!loading && filteredServers.length === 0 && (
          <div className="text-center py-12">
            <svg className="h-12 w-12 text-gray-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
            <p className="text-gray-500">
              {servers.length === 0 ? 'サーバーが見つかりません' : 'フィルター条件に一致するサーバーが見つかりません'}
            </p>
          </div>
        )}

        {/* サーバーカード */}
        {filteredServers.map((server) => (
          <ServerCard
            key={server.id}
            server={server}
            selected={selectedServers.has(server.id)}
            onSelect={(selected) => handleServerSelect(server.id, selected)}
            onAction={(action) => handleServerAction(server.id, action)}
            showCheckbox={showBulkActions}
          />
        ))}
      </div>

      {/* ページネーション */}
      {/* TODO: 実際のページネーション実装 */}
    </div>
  );
}