'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import PageHeader from '@/components/layout/PageHeader';
import { CardLoading } from '@/components/common/LoadingSpinner';
import {
  Plus as PlusIcon,
  Play as PlayIcon,
  Square as StopIcon,
  Settings as CogIcon,
  Trash2 as TrashIcon,
  Search as MagnifyingGlassIcon,
  Server as ServerIcon,
  AlertTriangle as ExclamationTriangleIcon,
  CheckCircle as CheckCircleIcon,
  Clock as ClockIcon,
} from 'lucide-react';
import { clsx } from 'clsx';

// =============================================================================
// サーバー管理ページ
// MCPサーバーの一覧表示と基本操作
// =============================================================================

interface Server {
  id: string;
  name: string;
  image: string;
  status: 'running' | 'stopped' | 'starting' | 'stopping' | 'error';
  description?: string;
  createdAt: string;
  updatedAt: string;
  lastHealthCheck?: string;
  resourceUsage?: {
    cpu: number;
    memory: number;
  };
}

export default function ServersPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [operatingServers, setOperatingServers] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadServers();
  }, []);

  const loadServers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/v1/servers');
      const data = await response.json();
      
      if (data.success) {
        setServers(data.data);
      } else {
        console.error('Failed to load servers:', data.error);
      }
    } catch (error) {
      console.error('Failed to load servers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleServerAction = async (serverId: string, action: 'start' | 'stop') => {
    if (operatingServers.has(serverId)) return;

    try {
      setOperatingServers(prev => new Set(prev).add(serverId));
      
      const response = await fetch(`/api/v1/servers/${serverId}/${action}`, {
        method: 'POST',
      });
      
      const data = await response.json();
      
      if (data.success) {
        // サーバーリストを更新
        await loadServers();
      } else {
        console.error(`Failed to ${action} server:`, data.error);
        alert(`サーバーの${action === 'start' ? '開始' : '停止'}に失敗しました: ${data.error?.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error(`Failed to ${action} server:`, error);
      alert(`サーバーの${action === 'start' ? '開始' : '停止'}中にエラーが発生しました`);
    } finally {
      setOperatingServers(prev => {
        const newSet = new Set(prev);
        newSet.delete(serverId);
        return newSet;
      });
    }
  };

  const handleDeleteServer = async (serverId: string, serverName: string) => {
    if (!confirm(`サーバー "${serverName}" を削除してもよろしいですか？この操作は元に戻せません。`)) {
      return;
    }

    try {
      const response = await fetch(`/api/v1/servers/${serverId}`, {
        method: 'DELETE',
      });
      
      const data = await response.json();
      
      if (data.success) {
        await loadServers();
      } else {
        console.error('Failed to delete server:', data.error);
        alert(`サーバーの削除に失敗しました: ${data.error?.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to delete server:', error);
      alert('サーバーの削除中にエラーが発生しました');
    }
  };

  // フィルタリング
  const filteredServers = servers.filter(server => {
    const matchesSearch = server.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         server.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || server.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'stopped':
        return <ClockIcon className="h-5 w-5 text-gray-500" />;
      case 'starting':
      case 'stopping':
        return <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />;
      case 'error':
        return <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />;
      default:
        return <ServerIcon className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'running': return '実行中';
      case 'stopped': return '停止中';
      case 'starting': return '開始中';
      case 'stopping': return '停止中';
      case 'error': return 'エラー';
      default: return '不明';
    }
  };

  const getStatusBadge = (status: string) => {
    const baseClasses = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium";
    switch (status) {
      case 'running':
        return `${baseClasses} bg-green-100 text-green-800`;
      case 'stopped':
        return `${baseClasses} bg-gray-100 text-gray-800`;
      case 'starting':
      case 'stopping':
        return `${baseClasses} bg-blue-100 text-blue-800`;
      case 'error':
        return `${baseClasses} bg-red-100 text-red-800`;
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`;
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <PageHeader title="サーバー管理" />
        <div className="px-4 sm:px-6 lg:px-8">
          <CardLoading text="サーバー一覧を読み込み中..." />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <PageHeader
        title="サーバー管理"
        description="MCPサーバーの管理と監視"
        breadcrumbs={[
          { name: 'ダッシュボード', href: '/dashboard' },
          { name: 'サーバー管理' },
        ]}
        actions={
          <Link
            href="/servers/new"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
            新しいサーバー
          </Link>
        }
      >
        {/* Search and filters */}
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
          <div className="flex-1 min-w-0">
            <label htmlFor="search" className="sr-only">
              サーバーを検索
            </label>
            <div className="relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                name="search"
                id="search"
                className="block w-full pl-10 sm:text-sm border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                placeholder="サーバー名または説明で検索"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          
          <div className="sm:w-48">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
            >
              <option value="all">すべてのステータス</option>
              <option value="running">実行中</option>
              <option value="stopped">停止中</option>
              <option value="error">エラー</option>
            </select>
          </div>
        </div>
      </PageHeader>

      <div className="px-4 sm:px-6 lg:px-8">
        {/* Server stats */}
        <div className="mt-6">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-4">
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <ServerIcon className="h-8 w-8 text-blue-600" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        総サーバー数
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {servers.length}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <CheckCircleIcon className="h-8 w-8 text-green-600" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        実行中
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {servers.filter(s => s.status === 'running').length}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <ClockIcon className="h-8 w-8 text-gray-600" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        停止中
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {servers.filter(s => s.status === 'stopped').length}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <ExclamationTriangleIcon className="h-8 w-8 text-red-600" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        エラー
                      </dt>
                      <dd className="text-lg font-medium text-gray-900">
                        {servers.filter(s => s.status === 'error').length}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Servers list */}
        <div className="mt-8">
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            {filteredServers.length > 0 ? (
              <ul className="divide-y divide-gray-200">
                {filteredServers.map((server) => (
                  <li key={server.id}>
                    <div className="px-4 py-4 flex items-center justify-between hover:bg-gray-50">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                            <ServerIcon className="h-6 w-6 text-blue-600" />
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="flex items-center">
                            <div className="text-sm font-medium text-gray-900">
                              {server.name}
                            </div>
                            <div className="ml-3 flex items-center">
                              {getStatusIcon(server.status)}
                              <span className={clsx("ml-1", getStatusBadge(server.status))}>
                                {getStatusText(server.status)}
                              </span>
                            </div>
                          </div>
                          <div className="text-sm text-gray-500">
                            {server.description || `Image: ${server.image}`}
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            作成日: {new Date(server.createdAt).toLocaleString('ja-JP')}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        {/* Start/Stop buttons */}
                        {server.status === 'stopped' && (
                          <button
                            onClick={() => handleServerAction(server.id, 'start')}
                            disabled={operatingServers.has(server.id)}
                            className="inline-flex items-center p-2 border border-transparent rounded-full shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                          >
                            <PlayIcon className="h-4 w-4" />
                          </button>
                        )}
                        
                        {server.status === 'running' && (
                          <button
                            onClick={() => handleServerAction(server.id, 'stop')}
                            disabled={operatingServers.has(server.id)}
                            className="inline-flex items-center p-2 border border-transparent rounded-full shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                          >
                            <StopIcon className="h-4 w-4" />
                          </button>
                        )}

                        {/* Settings button */}
                        <Link
                          href={`/servers/${server.id}`}
                          className="inline-flex items-center p-2 border border-gray-300 rounded-full shadow-sm text-gray-400 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                          <CogIcon className="h-4 w-4" />
                        </Link>

                        {/* Delete button */}
                        {server.status === 'stopped' && (
                          <button
                            onClick={() => handleDeleteServer(server.id, server.name)}
                            className="inline-flex items-center p-2 border border-transparent rounded-full shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-12 text-center">
                {searchQuery || statusFilter !== 'all' ? (
                  <div>
                    <ServerIcon className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">
                      該当するサーバーが見つかりません
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      検索条件を変更してもう一度お試しください
                    </p>
                  </div>
                ) : (
                  <div>
                    <ServerIcon className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">
                      サーバーがありません
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      新しいサーバーを作成して始めましょう
                    </p>
                    <div className="mt-6">
                      <Link
                        href="/servers/new"
                        className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      >
                        <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
                        新しいサーバー
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}