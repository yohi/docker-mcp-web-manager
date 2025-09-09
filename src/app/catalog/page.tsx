'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { CatalogBrowser } from '@/components/catalog/catalog-browser';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Package,
  RefreshCw,
  AlertTriangle,
  Download
} from 'lucide-react';

// =============================================================================
// カタログページ - 新しいコンポーネントベース実装
// MCPサーバーカタログの閲覧とインストール機能を提供
// =============================================================================

interface CatalogEntry {
  id: string;
  name: string;
  displayName: string;
  description: string;
  longDescription?: string;
  version: string;
  author: string;
  authorUrl?: string;
  category: string;
  tags: string[];
  imageUrl: string;
  sourceUrl?: string;
  documentationUrl?: string;
  downloadCount: number;
  rating: number;
  ratingCount: number;
  size: number;
  lastUpdated: string;
  createdAt: string;
  verified: boolean;
  featured: boolean;
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

export default function CatalogPage() {
  const [catalogEntries, setCatalogEntries] = useState<CatalogEntry[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installationJobs, setInstallationJobs] = useState<Record<string, string>>({});

  // データ取得
  const loadCatalog = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // カタログエントリの取得
      const catalogRes = await fetch('/api/v1/catalog');
      if (!catalogRes.ok) throw new Error('カタログの取得に失敗しました');
      
      const catalogData = await catalogRes.json();
      const entries = catalogData.success ? catalogData.data : [];
      
      // インストールされているサーバーの情報も取得して統合
      const serversRes = await fetch('/api/v1/servers');
      if (serversRes.ok) {
        const serversData = await serversRes.json();
        const installedServers = serversData.success ? serversData.data : [];
        
        // インストール状態をカタログエントリに反映
        const entriesWithStatus = entries.map((entry: CatalogEntry) => {
          const installed = installedServers.find((server: any) => 
            server.image === entry.imageUrl || server.name === entry.name
          );
          return {
            ...entry,
            installationStatus: installed ? 'installed' : 'not_installed'
          };
        });
        
        setCatalogEntries(entriesWithStatus);
      } else {
        setCatalogEntries(entries);
      }
      
      // カテゴリの抽出
      const allCategories = Array.from(new Set(entries.map((e: CatalogEntry) => e.category).filter(Boolean))) as string[];
      setCategories(allCategories);
      
    } catch (error) {
      console.error('Failed to load catalog:', error);
      setError(error instanceof Error ? error.message : 'カタログ読み込みエラー');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, []);

  // インストール処理
  const handleInstall = async (entryId: string) => {
    try {
      const entry = catalogEntries.find(e => e.id === entryId);
      if (!entry) throw new Error('エントリが見つかりません');
      
      // インストール状態を「インストール中」に更新
      setCatalogEntries(prev => prev.map(e => 
        e.id === entryId 
          ? { ...e, installationStatus: 'installing' } 
          : e
      ));
      
      // インストールAPI呼び出し
      const response = await fetch('/api/v1/servers/install', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: entry.name,
          displayName: entry.displayName,
          description: entry.description,
          image: entry.imageUrl,
          category: entry.category,
          tags: entry.tags,
          version: entry.version,
          author: entry.author,
        }),
      });
      
      if (!response.ok) {
        throw new Error('インストールに失敗しました');
      }
      
      const data = await response.json();
      
      if (data.success) {
        // 非同期ジョブの場合はジョブIDを保存
        if (data.jobId) {
          setInstallationJobs(prev => ({ ...prev, [entryId]: data.jobId }));
          // ジョブの監視は別途実装予定
        }
        
        // インストール完了状態に更新
        setCatalogEntries(prev => prev.map(e => 
          e.id === entryId 
            ? { ...e, installationStatus: 'installed' } 
            : e
        ));
      } else {
        throw new Error(data.error?.message || 'インストールに失敗しました');
      }
      
    } catch (error) {
      console.error('Installation failed:', error);
      
      // エラー状態に更新
      setCatalogEntries(prev => prev.map(e => 
        e.id === entryId 
          ? { ...e, installationStatus: 'failed' } 
          : e
      ));
      
      throw error;
    }
  };

  // アンインストール処理
  const handleUninstall = async (entryId: string) => {
    try {
      const entry = catalogEntries.find(e => e.id === entryId);
      if (!entry) throw new Error('エントリが見つかりません');
      
      // 対応するサーバーを見つけて削除
      const serversRes = await fetch('/api/v1/servers');
      if (!serversRes.ok) throw new Error('サーバー情報の取得に失敗しました');
      
      const serversData = await serversRes.json();
      const servers = serversData.success ? serversData.data : [];
      
      const server = servers.find((s: any) => 
        s.image === entry.imageUrl || s.name === entry.name
      );
      
      if (!server) throw new Error('対応するサーバーが見つかりません');
      
      const response = await fetch(`/api/v1/servers/${server.id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error('アンインストールに失敗しました');
      
      // 未インストール状態に更新
      setCatalogEntries(prev => prev.map(e => 
        e.id === entryId 
          ? { ...e, installationStatus: 'not_installed' } 
          : e
      ));
      
    } catch (error) {
      console.error('Uninstallation failed:', error);
      throw error;
    }
  };

  return (
    <ProtectedRoute requiredPermissions={['CATALOG_READ']}>
      <div className="space-y-6">
        {/* ヘッダー */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">サーバーカタログ</h1>
            <p className="text-sm text-gray-600">
              利用可能なMCPサーバーを検索・インストールできます
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadCatalog} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              更新
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

        {/* カタログブラウザー */}
        <CatalogBrowser
          catalogEntries={catalogEntries}
          categories={categories}
          isLoading={isLoading}
          error={error}
          onRefresh={loadCatalog}
          onInstall={handleInstall}
          onUninstall={handleUninstall}
        />
      </div>
    </ProtectedRoute>
  );
}