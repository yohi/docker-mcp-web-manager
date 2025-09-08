'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { ServerList } from '@/components/servers/server-list';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  Plus,
  Server,
  CheckCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter
} from 'lucide-react';

// =============================================================================
// サーバー管理ページ - 新しいコンポーネントベース実装
// MCPサーバーの専用管理画面、詳細なフィルタリングと操作を提供
// =============================================================================

export default function ServersPage() {
  const [servers, setServers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // データ取得
  const loadServers = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/v1/servers');
      if (!response.ok) throw new Error('サーバー情報の取得に失敗しました');
      
      const data = await response.json();
      const serversList = data.success ? data.data : [];
      setServers(serversList);
    } catch (error) {
      console.error('Failed to load servers:', error);
      setError(error instanceof Error ? error.message : 'データ読み込みエラー');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadServers();
  }, []);

  // サーバー操作
  const handleServerStart = async (serverId: string) => {
    try {
      const response = await fetch(`/api/v1/servers/${serverId}/start`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('サーバー起動に失敗しました');
      
      await loadServers();
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
      
      await loadServers();
    } catch (error) {
      console.error('Server stop failed:', error);
      throw error;
    }
  };

  const handleServerDelete = async (serverId: string) => {
    try {
      const response = await fetch(`/api/v1/servers/${serverId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('サーバー削除に失敗しました');
      
      await loadServers();
    } catch (error) {
      console.error('Server delete failed:', error);
      throw error;
    }
  };

  // フィルタリング
  const filteredServers = servers.filter(server => {
    const matchesSearch = searchQuery === '' || 
      server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      server.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      server.image?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || server.status === statusFilter;
    
    const matchesCategory = categoryFilter === 'all' || 
      server.category === categoryFilter ||
      server.tags?.includes(categoryFilter);
    
    return matchesSearch && matchesStatus && matchesCategory;
  });

  // 利用可能なカテゴリの抽出
  const availableCategories = Array.from(new Set(
    servers.flatMap(server => [
      server.category,
      ...(server.tags || [])
    ]).filter(Boolean)
  ));

  // 統計情報
  const stats = {
    total: servers.length,
    running: servers.filter(s => s.status === 'running').length,
    stopped: servers.filter(s => s.status === 'stopped').length,
    error: servers.filter(s => s.status === 'error').length,
  };

  return (
    <ProtectedRoute requiredPermissions={['SERVERS_READ']}>
      <div className="space-y-6">
        {/* ヘッダー */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">サーバー管理</h1>
            <p className="text-sm text-gray-600">
              MCPサーバーの詳細な管理と監視を行います
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadServers} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
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
                <Server className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-semibold">{stats.total}</p>
                  <p className="text-sm text-gray-600">総サーバー数</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-2xl font-semibold text-green-600">{stats.running}</p>
                  <p className="text-sm text-gray-600">実行中</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Clock className="h-8 w-8 text-gray-500" />
                <div>
                  <p className="text-2xl font-semibold">{stats.stopped}</p>
                  <p className="text-sm text-gray-600">停止中</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-8 w-8 text-red-500" />
                <div>
                  <p className="text-2xl font-semibold text-red-600">{stats.error}</p>
                  <p className="text-sm text-gray-600">エラー</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* フィルタリング */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              {/* 検索バー */}
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
                <Filter className="h-4 w-4 text-gray-500" />
                
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="text-sm border rounded px-2 py-1"
                >
                  <option value="all">全ステータス</option>
                  <option value="running">実行中</option>
                  <option value="stopped">停止中</option>
                  <option value="starting">開始中</option>
                  <option value="stopping">停止中</option>
                  <option value="error">エラー</option>
                </select>

                {availableCategories.length > 0 && (
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="text-sm border rounded px-2 py-1"
                  >
                    <option value="all">全カテゴリ</option>
                    {availableCategories.map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* アクティブフィルターの表示 */}
            {(searchQuery || statusFilter !== 'all' || categoryFilter !== 'all') && (
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
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                    setCategoryFilter('all');
                  }}
                  className="text-xs h-6"
                >
                  すべてクリア
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* サーバー一覧 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                サーバー一覧 ({filteredServers.length}件)
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ServerList
              servers={filteredServers}
              isLoading={isLoading}
              error={error}
              onRefresh={loadServers}
              onServerStart={handleServerStart}
              onServerStop={handleServerStop}
              onServerDelete={handleServerDelete}
              showActions={true}
              showDetailsLink={true}
            />
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}