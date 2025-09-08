'use client';

import { useState, useMemo, useEffect } from 'react';
import { ServerCard } from './server-card';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Search,
  Filter,
  RefreshCw,
  Plus,
  Server,
  AlertCircle,
  Grid3X3,
  List,
  SortAsc,
  SortDesc
} from 'lucide-react';
import { usePermissions } from '@/components/auth/auth-provider';

// =============================================================================
// ServerList - MCPサーバーリスト表示コンポーネント
// サーバーの一覧表示、検索、フィルタリング、ソート機能を提供
// =============================================================================

interface Server {
  id: string;
  name: string;
  description?: string;
  status: 'running' | 'stopped' | 'error' | 'starting' | 'stopping';
  imageUrl: string;
  version?: string;
  port?: number;
  createdAt: string;
  updatedAt: string;
  lastStartedAt?: string;
  resourceUsage?: {
    cpu: number;
    memory: number;
    memoryLimit: number;
  };
  healthStatus?: 'healthy' | 'unhealthy' | 'unknown';
  toolsCount?: number;
  configurationsCount?: number;
  tags?: string[];
}

interface ServerListProps {
  servers?: Server[];
  isLoading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  onServerStart?: (serverId: string) => Promise<void>;
  onServerStop?: (serverId: string) => Promise<void>;
  className?: string;
}

type SortField = 'name' | 'status' | 'created' | 'updated' | 'lastStarted';
type SortOrder = 'asc' | 'desc';
type ViewMode = 'grid' | 'list';
type StatusFilter = 'all' | 'running' | 'stopped' | 'error' | 'starting' | 'stopping';

/**
 * サーバー一覧コンポーネント
 */
export function ServerList({
  servers = [],
  isLoading = false,
  error = null,
  onRefresh,
  onServerStart,
  onServerStop,
  className
}: ServerListProps) {
  const { hasPermission } = usePermissions();
  
  // UI状態管理
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  
  // 権限チェック
  const canManageServers = hasPermission('SERVERS_MANAGE');
  const canCreateServers = hasPermission('SERVERS_CREATE');

  // 利用可能なタグの抽出
  const availableTags = useMemo(() => {
    const allTags = servers.flatMap(server => server.tags || []);
    return [...new Set(allTags)].sort();
  }, [servers]);

  // フィルタリングとソート
  const filteredAndSortedServers = useMemo(() => {
    let filtered = servers;

    // 検索フィルター
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(server =>
        server.name.toLowerCase().includes(query) ||
        server.description?.toLowerCase().includes(query) ||
        server.imageUrl.toLowerCase().includes(query)
      );
    }

    // ステータスフィルター
    if (statusFilter !== 'all') {
      filtered = filtered.filter(server => server.status === statusFilter);
    }

    // タグフィルター
    if (selectedTags.length > 0) {
      filtered = filtered.filter(server =>
        selectedTags.some(tag => server.tags?.includes(tag))
      );
    }

    // ソート
    filtered.sort((a, b) => {
      let valueA: any;
      let valueB: any;

      switch (sortField) {
        case 'name':
          valueA = a.name.toLowerCase();
          valueB = b.name.toLowerCase();
          break;
        case 'status':
          valueA = a.status;
          valueB = b.status;
          break;
        case 'created':
          valueA = new Date(a.createdAt);
          valueB = new Date(b.createdAt);
          break;
        case 'updated':
          valueA = new Date(a.updatedAt);
          valueB = new Date(b.updatedAt);
          break;
        case 'lastStarted':
          valueA = a.lastStartedAt ? new Date(a.lastStartedAt) : new Date(0);
          valueB = b.lastStartedAt ? new Date(b.lastStartedAt) : new Date(0);
          break;
        default:
          valueA = a.name.toLowerCase();
          valueB = b.name.toLowerCase();
      }

      if (valueA < valueB) return sortOrder === 'asc' ? -1 : 1;
      if (valueA > valueB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [servers, searchQuery, statusFilter, selectedTags, sortField, sortOrder]);

  // ソート切り替え
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // タグ選択切り替え
  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  // ステータス統計の計算
  const statusCounts = useMemo(() => {
    return servers.reduce((acc, server) => {
      acc[server.status] = (acc[server.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [servers]);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">サーバー管理</h1>
          <p className="text-sm text-gray-600">
            MCPサーバーの状態確認と管理を行います
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              更新
            </Button>
          )}
          
          {canCreateServers && (
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              サーバー追加
            </Button>
          )}
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* 統計情報 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Server className="h-5 w-5 text-gray-500" />
                <span className="text-sm font-medium">
                  総計: {servers.length}個のサーバー
                </span>
              </div>
              
              <div className="flex items-center space-x-2">
                <Badge variant="success" className="text-xs">
                  実行中: {statusCounts.running || 0}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  停止中: {statusCounts.stopped || 0}
                </Badge>
                {statusCounts.error > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    エラー: {statusCounts.error}
                  </Badge>
                )}
              </div>
            </div>
            
            <div className="text-sm text-gray-500">
              表示中: {filteredAndSortedServers.length}個
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 検索とフィルター */}
      <Card>
        <CardContent className="p-4 space-y-4">
          {/* 検索バー */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="サーバー名、説明、イメージで検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('grid')}
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* フィルターとソート */}
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-gray-500" />
            
            {/* ステータスフィルター */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="text-sm border rounded px-2 py-1"
            >
              <option value="all">すべてのステータス</option>
              <option value="running">実行中</option>
              <option value="stopped">停止中</option>
              <option value="error">エラー</option>
              <option value="starting">起動中</option>
              <option value="stopping">停止処理中</option>
            </select>

            {/* ソート */}
            <select
              value={`${sortField}-${sortOrder}`}
              onChange={(e) => {
                const [field, order] = e.target.value.split('-');
                setSortField(field as SortField);
                setSortOrder(order as SortOrder);
              }}
              className="text-sm border rounded px-2 py-1"
            >
              <option value="name-asc">名前 (昇順)</option>
              <option value="name-desc">名前 (降順)</option>
              <option value="status-asc">ステータス (昇順)</option>
              <option value="status-desc">ステータス (降順)</option>
              <option value="created-asc">作成日 (古い順)</option>
              <option value="created-desc">作成日 (新しい順)</option>
              <option value="updated-asc">更新日 (古い順)</option>
              <option value="updated-desc">更新日 (新しい順)</option>
              <option value="lastStarted-desc">最終起動 (新しい順)</option>
            </select>

            {/* タグフィルター */}
            {availableTags.length > 0 && (
              <div className="flex items-center gap-1 ml-4">
                <span className="text-xs text-gray-500">タグ:</span>
                {availableTags.map(tag => (
                  <Badge
                    key={tag}
                    variant={selectedTags.includes(tag) ? 'default' : 'outline'}
                    className="text-xs cursor-pointer"
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* アクティブフィルターの表示 */}
          {(searchQuery || statusFilter !== 'all' || selectedTags.length > 0) && (
            <div className="flex items-center gap-2 pt-2 border-t">
              <span className="text-xs text-gray-500">アクティブフィルター:</span>
              
              {searchQuery && (
                <Badge variant="outline" className="text-xs">
                  検索: "{searchQuery}"
                  <button
                    onClick={() => setSearchQuery('')}
                    className="ml-1 hover:text-gray-600"
                  >
                    ×
                  </button>
                </Badge>
              )}
              
              {statusFilter !== 'all' && (
                <Badge variant="outline" className="text-xs">
                  ステータス: {statusFilter}
                  <button
                    onClick={() => setStatusFilter('all')}
                    className="ml-1 hover:text-gray-600"
                  >
                    ×
                  </button>
                </Badge>
              )}
              
              {selectedTags.map(tag => (
                <Badge key={tag} variant="outline" className="text-xs">
                  タグ: {tag}
                  <button
                    onClick={() => toggleTag(tag)}
                    className="ml-1 hover:text-gray-600"
                  >
                    ×
                  </button>
                </Badge>
              ))}
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                  setSelectedTags([]);
                }}
                className="text-xs h-6"
              >
                すべてクリア
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* サーバーリスト */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center space-y-4">
            <RefreshCw className="h-8 w-8 animate-spin text-gray-400 mx-auto" />
            <p className="text-sm text-gray-500">サーバー情報を読み込み中...</p>
          </div>
        </div>
      ) : filteredAndSortedServers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Server className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {servers.length === 0 ? 'サーバーがありません' : '該当するサーバーがありません'}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {servers.length === 0 
                ? 'MCPサーバーを追加して管理を開始してください。'
                : 'フィルター条件を変更してお試しください。'
              }
            </p>
            {servers.length === 0 && canCreateServers && (
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                最初のサーバーを追加
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className={
          viewMode === 'grid' 
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
            : 'space-y-4'
        }>
          {filteredAndSortedServers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              onStart={onServerStart}
              onStop={onServerStop}
              className={viewMode === 'list' ? 'w-full' : ''}
            />
          ))}
        </div>
      )}
    </div>
  );
}