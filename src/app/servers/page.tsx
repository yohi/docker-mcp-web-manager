'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { ServerList } from '@/components/servers/server-list';
import { ServerDetail } from '@/components/servers/server-detail';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Server,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Play,
  Pause,
  Settings,
  MoreVertical,
} from 'lucide-react';

// =============================================================================
// サーバー管理ページ - 新しいコンポーネントベース実装
// MCPサーバーの一覧表示と管理機能を提供
// =============================================================================

export default function ServersPage() {
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [refreshing, setRefreshing] = useState(false);

  const handleServerSelect = (serverId: string) => {
    setSelectedServer(serverId);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    // サーバーリストの再読み込みをトリガー
    try {
      // ServerListコンポーネントにrefreshハンドラーが必要
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate refresh
    } finally {
      setRefreshing(false);
    }
  };

  const filterOptions = [
    { value: 'all', label: 'All Servers', count: 0 },
    { value: 'running', label: 'Running', count: 0 },
    { value: 'stopped', label: 'Stopped', count: 0 },
    { value: 'error', label: 'Error', count: 0 },
  ];

  return (
    <ProtectedRoute requiredPermissions={['SERVERS_READ']}>
      <div className="container mx-auto p-6 space-y-6">
        {/* ヘッダー */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Servers</h1>
            <p className="text-muted-foreground">
              Manage your MCP server instances
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Button 
              variant="outline" 
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center space-x-2"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>
            <Button className="flex items-center space-x-2">
              <Plus className="h-4 w-4" />
              <span>Add Server</span>
            </Button>
          </div>
        </div>

        {/* フィルターと検索 */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row md:items-center space-y-4 md:space-y-0 md:space-x-4">
              {/* 検索バー */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search servers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* ステータスフィルター */}
              <div className="flex items-center space-x-2">
                <Filter className="h-4 w-4 text-gray-400" />
                <div className="flex space-x-2">
                  {filterOptions.map((option) => (
                    <Button
                      key={option.value}
                      variant={statusFilter === option.value ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setStatusFilter(option.value)}
                      className="flex items-center space-x-1"
                    >
                      <span>{option.label}</span>
                      {option.count > 0 && (
                        <Badge variant="secondary" className="ml-1">
                          {option.count}
                        </Badge>
                      )}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* メインコンテンツエリア */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* サーバーリスト */}
          <div className={`${selectedServer ? 'lg:col-span-1' : 'lg:col-span-3'} transition-all duration-200`}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Server className="h-5 w-5" />
                  <span>Server List</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ServerList 
                  searchQuery={searchQuery}
                  statusFilter={statusFilter}
                  onServerSelect={handleServerSelect}
                  selectedServerId={selectedServer}
                  showActions={true}
                  className="border-0 shadow-none"
                />
              </CardContent>
            </Card>
          </div>

          {/* サーバー詳細 (選択時のみ表示) */}
          {selectedServer && (
            <div className="lg:col-span-2">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center space-x-2">
                    <Settings className="h-5 w-5" />
                    <span>Server Details</span>
                  </CardTitle>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setSelectedServer(null)}
                  >
                    ×
                  </Button>
                </CardHeader>
                <CardContent>
                  <ServerDetail 
                    serverId={selectedServer}
                    className="border-0 shadow-none"
                  />
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* 空の状態 (サーバーがない場合) */}
        {/* この部分は ServerList コンポーネント内で処理される */}
      </div>
    </ProtectedRoute>
  );
}