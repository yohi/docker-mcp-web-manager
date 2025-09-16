'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Search,
  Filter,
  Star,
  Download,
  ExternalLink,
  Package,
  Tag,
  Users,
  Calendar,
  CheckCircle,
  Clock,
  AlertTriangle,
  Loader2,
  Grid3X3,
  List,
  SortAsc,
  SortDesc,
  RefreshCw
} from 'lucide-react';
import { formatTimeAgo } from '@/lib/utils';
import { usePermissions } from '@/components/auth/auth-provider';

// =============================================================================
// CatalogBrowser - MCPサーバーカタログブラウザーコンポーネント
// カタログからのサーバー検索、詳細表示、インストール機能を提供
// =============================================================================

interface CatalogEntry {
  id: string;
  name: string;
  displayName?: string;
  description: string;
  longDescription?: string;
  version: string;
  author?: string;
  authorUrl?: string;
  category?: string;
  tags: string[];
  imageUrl?: string;
  homepage?: string;
  repository?: string;
  sourceUrl?: string;
  documentationUrl?: string;
  downloadCount?: number;
  rating?: number;
  ratingCount?: number;
  size?: number; // bytes
  lastUpdated?: string;
  createdAt?: string;
  verified?: boolean;
  featured?: boolean;
  icon?: string;
  // MCP固有フィールド
  installType?: 'docker' | 'npm' | 'github' | 'existing';
  dockerImage?: string;
  githubRepo?: string;
  capabilities?: string[];
  requirements?: {
    memory?: string;
    cpu?: string;
    disk?: string;
    network?: boolean;
  };
  screenshots?: string[];
  dependencies?: Array<{
    name: string;
    version: string;
    required: boolean;
  }>;
  configuration?: {
    environment?: Array<{
      name: string;
      description: string;
      required: boolean;
      default?: string;
    }>;
    volumes?: Array<{
      source: string;
      target: string;
      description: string;
      required: boolean;
    }>;
    ports?: Array<{
      port: number;
      protocol: 'tcp' | 'udp';
      description: string;
    }>;
  };
  installationStatus?: 'not_installed' | 'installing' | 'installed' | 'failed';
}

interface CatalogBrowserProps {
  catalogEntries?: CatalogEntry[];
  categories?: string[];
  isLoading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  onInstall?: (entryId: string) => Promise<void>;
  onUninstall?: (entryId: string) => Promise<void>;
  className?: string;
  // ページネーション機能
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  onSearch?: (searchQuery: string, category?: string, sortBy?: string, sortOrder?: string) => void;
}

type SortField = 'name' | 'rating' | 'downloadCount' | 'lastUpdated' | 'size';
type SortOrder = 'asc' | 'desc';
type ViewMode = 'grid' | 'list';
type CategoryFilter = string | 'all';

/**
 * インストール状態のスタイリング情報を取得
 */
function getInstallStatusInfo(status?: string) {
  switch (status) {
    case 'installed':
      return {
        badge: 'success',
        label: 'インストール済み',
        icon: CheckCircle,
        iconColor: 'text-green-500'
      };
    case 'installing':
      return {
        badge: 'info',
        label: 'インストール中',
        icon: Loader2,
        iconColor: 'text-blue-500 animate-spin'
      };
    case 'failed':
      return {
        badge: 'destructive',
        label: 'インストール失敗',
        icon: AlertTriangle,
        iconColor: 'text-red-500'
      };
    default:
      return {
        badge: 'outline',
        label: '未インストール',
        icon: Package,
        iconColor: 'text-gray-400'
      };
  }
}

/**
 * ファイルサイズをフォーマット
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 評価を星で表示
 */
function StarRating({ rating, count }: { rating: number; count: number }) {
  return (
    <div className="flex items-center space-x-1">
      <div className="flex">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${
              star <= rating ? 'text-yellow-400 fill-current' : 'text-gray-300'
            }`}
          />
        ))}
      </div>
      <span className="text-sm text-gray-600">({count})</span>
    </div>
  );
}

/**
 * カタログブラウザーコンポーネント
 */
export function CatalogBrowser({
  catalogEntries = [],
  categories = [],
  isLoading = false,
  error = null,
  onRefresh,
  onInstall,
  onUninstall,
  className,
  pagination,
  onPageChange,
  onPageSizeChange,
  onSearch
}: CatalogBrowserProps) {
  const { hasPermission } = usePermissions();
  
  // UI状態管理
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [sortField, setSortField] = useState<SortField>('rating');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showVerifiedOnly, setShowVerifiedOnly] = useState(false);
  const [showFeaturedOnly, setShowFeaturedOnly] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<CatalogEntry | null>(null);
  const [pageSize, setPageSize] = useState(20);
  
  // 検索debounce用のref
  const searchTimeoutRef = useRef<NodeJS.Timeout>();
  
  // 権限チェック
  const canInstallServers = hasPermission('SERVERS_CREATE');

  // 検索入力のデバウンス処理
  useEffect(() => {
    // 既存のタイマーをクリア
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // 新しいタイマーを設定（500ms後に検索実行）
    searchTimeoutRef.current = setTimeout(() => {
      if (onSearch) {
        onSearch(
          searchQuery,
          categoryFilter !== 'all' ? categoryFilter : undefined,
          `${sortField}-${sortOrder}`.split('-')[0],
          `${sortField}-${sortOrder}`.split('-')[1]
        );
      }
    }, 500);

    // クリーンアップ
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, categoryFilter, sortField, sortOrder, onSearch]);

  // 利用可能なタグの抽出
  const availableTags = useMemo(() => {
    const allTags = catalogEntries.flatMap(entry => entry.tags || []);
    return [...new Set(allTags)].sort();
  }, [catalogEntries]);

  // サーバーサイドでフィルタリング・ソート済みのエントリをそのまま使用
  const filteredAndSortedEntries = catalogEntries;

  // ソート切り替え
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
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

  // インストール処理
  const handleInstall = async (entry: CatalogEntry) => {
    if (!onInstall || !canInstallServers) return;
    
    try {
      await onInstall(entry.id);
    } catch (error) {
      console.error('[CATALOG_BROWSER] Install failed:', error);
    }
  };

  // アンインストール処理
  const handleUninstall = async (entry: CatalogEntry) => {
    if (!onUninstall) return;
    
    try {
      await onUninstall(entry.id);
    } catch (error) {
      console.error('[CATALOG_BROWSER] Uninstall failed:', error);
    }
  };

  // ページサイズ変更処理
  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    if (onPageSizeChange) {
      onPageSizeChange(newPageSize);
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">サーバーカタログ</h1>
          <p className="text-sm text-gray-600">
            利用可能なMCPサーバーを検索・インストールできます
            {pagination && (
              <span className="ml-2 font-medium">
                (全 {pagination.total} 件中 {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} 件を表示)
              </span>
            )}
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
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* 統計情報 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Package className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-2xl font-semibold">{pagination?.total || catalogEntries.length}</p>
                <p className="text-sm text-gray-600">利用可能</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-semibold">
                  {catalogEntries.filter(e => e.installationStatus === 'installed').length}
                </p>
                <p className="text-sm text-gray-600">インストール済み</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Star className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="text-2xl font-semibold">
                  {catalogEntries.filter(e => e.verified).length}
                </p>
                <p className="text-sm text-gray-600">検証済み</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Tag className="h-8 w-8 text-purple-500" />
              <div>
                <p className="text-2xl font-semibold">{categories.length}</p>
                <p className="text-sm text-gray-600">カテゴリ</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 検索とフィルター */}
      <Card>
        <CardContent className="p-4 space-y-4">
          {/* 検索バー */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="サーバー名、説明、作者で検索..."
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
            
            {/* カテゴリフィルター */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="text-sm border rounded px-2 py-1"
            >
              <option value="all">全カテゴリ</option>
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
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
              <option value="rating-desc">評価順 (高→低)</option>
              <option value="rating-asc">評価順 (低→高)</option>
              <option value="downloadCount-desc">ダウンロード数順 (多→少)</option>
              <option value="downloadCount-asc">ダウンロード数順 (少→多)</option>
              <option value="name-asc">名前順 (昇順)</option>
              <option value="name-desc">名前順 (降順)</option>
              <option value="lastUpdated-desc">更新日順 (新→古)</option>
              <option value="lastUpdated-asc">更新日順 (古→新)</option>
              <option value="size-asc">サイズ順 (小→大)</option>
              <option value="size-desc">サイズ順 (大→小)</option>
            </select>

            {/* 特殊フィルター */}
            <label className="flex items-center space-x-1 text-sm">
              <input
                type="checkbox"
                checked={showVerifiedOnly}
                onChange={(e) => setShowVerifiedOnly(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span>検証済みのみ</span>
            </label>

            <label className="flex items-center space-x-1 text-sm">
              <input
                type="checkbox"
                checked={showFeaturedOnly}
                onChange={(e) => setShowFeaturedOnly(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span>注目のみ</span>
            </label>

            {/* ページサイズ選択 */}
            <div className="flex items-center space-x-2 text-sm">
              <span>表示件数:</span>
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="text-sm border rounded px-2 py-1"
              >
                <option value={10}>10件</option>
                <option value={20}>20件</option>
                <option value={50}>50件</option>
                <option value={100}>100件</option>
              </select>
            </div>
          </div>

          {/* タグフィルター */}
          {availableTags.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500 mr-2">タグ:</span>
              <div className="flex flex-wrap gap-1">
                {availableTags.slice(0, 20).map(tag => (
                  <Badge
                    key={tag}
                    variant={selectedTags.includes(tag) ? 'default' : 'outline'}
                    className="text-xs cursor-pointer"
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                  </Badge>
                ))}
                {availableTags.length > 20 && (
                  <span className="text-xs text-gray-500">+{availableTags.length - 20}個</span>
                )}
              </div>
            </div>
          )}

          {/* アクティブフィルターの表示 */}
          {(searchQuery || categoryFilter !== 'all' || selectedTags.length > 0 || showVerifiedOnly || showFeaturedOnly) && (
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
              
              {categoryFilter !== 'all' && (
                <Badge variant="outline" className="text-xs">
                  カテゴリ: {categoryFilter}
                  <button
                    onClick={() => setCategoryFilter('all')}
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
              
              {showVerifiedOnly && (
                <Badge variant="outline" className="text-xs">
                  検証済みのみ
                  <button
                    onClick={() => setShowVerifiedOnly(false)}
                    className="ml-1 hover:text-gray-600"
                  >
                    ×
                  </button>
                </Badge>
              )}
              
              {showFeaturedOnly && (
                <Badge variant="outline" className="text-xs">
                  注目のみ
                  <button
                    onClick={() => setShowFeaturedOnly(false)}
                    className="ml-1 hover:text-gray-600"
                  >
                    ×
                  </button>
                </Badge>
              )}
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setCategoryFilter('all');
                  setSelectedTags([]);
                  setShowVerifiedOnly(false);
                  setShowFeaturedOnly(false);
                }}
                className="text-xs h-6"
              >
                すべてクリア
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* カタログエントリ一覧 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto" />
            <p className="text-sm text-gray-500">カタログを読み込み中...</p>
          </div>
        </div>
      ) : filteredAndSortedEntries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              該当するサーバーがありません
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              フィルター条件を変更してお試しください。
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className={
          viewMode === 'grid' 
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
            : 'space-y-4'
        }>
          {filteredAndSortedEntries.map((entry) => {
            const statusInfo = getInstallStatusInfo(entry.installationStatus);
            const StatusIcon = statusInfo.icon;

            return (
              <Card key={entry.id} className="hover:shadow-md transition-shadow h-full flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      {(entry.icon || entry.imageUrl) ? (
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white border border-gray-200 overflow-hidden">
                          <img 
                            src={entry.icon || entry.imageUrl} 
                            alt={`${entry.displayName || entry.name} icon`}
                            className="h-8 w-8 object-contain"
                            onError={(e) => {
                              // アイコン読み込み失敗時のフォールバック
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              const parent = target.parentElement;
                              if (parent) {
                                parent.className = "flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600";
                                const packageIcon = document.createElement('div');
                                packageIcon.innerHTML = '<svg class="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>';
                                parent.appendChild(packageIcon);
                              }
                            }}
                          />
                        </div>
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
                          <Package className="h-5 w-5 text-white" />
                        </div>
                      )}
                      <div className="flex-1">
                        <CardTitle className="text-lg flex items-center space-x-2">
                          <button
                            onClick={() => window.open(`/catalog/${encodeURIComponent(entry.id)}`, '_blank')}
                            className="truncate hover:text-blue-600 transition-colors text-left"
                          >
                            {entry.displayName || entry.name}
                          </button>
                          {entry.verified && (
                            <CheckCircle className="h-4 w-4 text-blue-500" />
                          )}
                          {entry.featured && (
                            <Star className="h-4 w-4 text-yellow-500 fill-current" />
                          )}
                        </CardTitle>
                        <div className="flex items-center space-x-2 mt-1">
                          <StatusIcon className={`h-4 w-4 ${statusInfo.iconColor}`} />
                          <Badge variant={statusInfo.badge as any} className="text-xs">
                            {statusInfo.label}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {entry.category}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>

                  <CardDescription className="mt-2 line-clamp-3 text-sm">
                    {entry.description}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4 flex-1">
                  {/* 基本情報 */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">作者:</span>
                      <span className="ml-1">{entry.author || '不明'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">バージョン:</span>
                      <span className="ml-1 font-mono">{entry.version}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">ダウンロード:</span>
                      <span className="ml-1">{(entry.downloadCount || 0).toLocaleString()}</span>
                    </div>
                  </div>

                  {/* 評価 */}
                  <div className="flex items-center justify-between">
                    <StarRating rating={entry.rating || 0} count={entry.ratingCount || 0} />
                    <div className="text-xs text-gray-500">
                      更新: {entry.lastUpdated ? formatTimeAgo(entry.lastUpdated) : '不明'}
                    </div>
                  </div>

                  {/* タグ */}
                  {(entry.tags?.length || 0) > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {(entry.tags || []).slice(0, 5).map(tag => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                      {entry.tags.length > 5 && (
                        <Badge variant="outline" className="text-xs">
                          +{entry.tags.length - 5}
                        </Badge>
                      )}
                    </div>
                  )}
                </CardContent>

                <CardFooter className="pt-0 mt-auto">
                  <div className="flex items-center justify-between w-full">
                    <div className="flex space-x-2">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => window.open(`/catalog/${encodeURIComponent(entry.id)}`, '_blank')}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {entry.sourceUrl && (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      {entry.documentationUrl && (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={entry.documentationUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                    </div>

                    {canInstallServers && (
                      <div>
                        {entry.installationStatus === 'installed' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleUninstall(entry)}
                            disabled={false}
                          >
                            アンインストール
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleInstall(entry)}
                            disabled={entry.installationStatus === 'installing'}
                          >
                            {entry.installationStatus === 'installing' ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="mr-2 h-4 w-4" />
                            )}
                            {entry.installationStatus === 'installing' ? 'インストール中' : 'インストール'}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {/* ページネーション */}
      {pagination && pagination.totalPages > 1 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">
                  ページ {pagination.page} / {pagination.totalPages} 
                  (全 {pagination.total} 件)
                </span>
              </div>
              
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange && onPageChange(1)}
                  disabled={!pagination.hasPrev}
                >
                  最初
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange && onPageChange(pagination.page - 1)}
                  disabled={!pagination.hasPrev}
                >
                  前へ
                </Button>
                
                <div className="flex items-center space-x-1">
                  {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                    let pageNum;
                    if (pagination.totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (pagination.page <= 3) {
                      pageNum = i + 1;
                    } else if (pagination.page >= pagination.totalPages - 2) {
                      pageNum = pagination.totalPages - 4 + i;
                    } else {
                      pageNum = pagination.page - 2 + i;
                    }
                    
                    return (
                      <Button
                        key={pageNum}
                        variant={pageNum === pagination.page ? "default" : "outline"}
                        size="sm"
                        onClick={() => onPageChange && onPageChange(pageNum)}
                        className="w-8 h-8 p-0"
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange && onPageChange(pagination.page + 1)}
                  disabled={!pagination.hasNext}
                >
                  次へ
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPageChange && onPageChange(pagination.totalPages)}
                  disabled={!pagination.hasNext}
                >
                  最後
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}