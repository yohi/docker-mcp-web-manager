'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Package,
  ArrowLeft,
  ExternalLink,
  Download,
  Star,
  CheckCircle,
  Calendar,
  User,
  Tag,
  Settings,
  AlertTriangle,
  Loader2,
  Copy,
  Eye,
  GitBranch
} from 'lucide-react';
import { formatTimeAgo } from '@/lib/utils';
import { usePermissions } from '@/components/auth/auth-provider';

// =============================================================================
// サーバー詳細ページ - Docker Hub MCP風の詳細表示
// カタログからのサーバー詳細情報表示とインストール機能を提供
// =============================================================================

interface ServerDetails {
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
  icon?: string;
  imageUrl?: string;
  homepage?: string;
  repository?: string;
  sourceUrl?: string;
  documentationUrl?: string;
  downloadCount: number;
  rating: number;
  ratingCount: number;
  lastUpdated: string;
  createdAt: string;
  verified: boolean;
  featured: boolean;
  // MCP固有フィールド
  installType: 'docker' | 'npm' | 'github' | 'existing';
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
  secrets?: Array<{
    name: string;
    env: string;
    example?: string;
  }>;
  installationStatus?: 'not_installed' | 'installing' | 'installed' | 'failed';
}

export default function ServerDetailPage() {
  const router = useRouter();
  const params = useParams();
  const serverId = params.serverId as string;
  const { hasPermission } = usePermissions();
  
  const [serverDetails, setServerDetails] = useState<ServerDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  
  // 権限チェック
  const canInstallServers = hasPermission('SERVERS_CREATE');
  
  // サーバー詳細を取得
  const loadServerDetails = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // カタログAPIから詳細を取得
      const response = await fetch(`/api/v1/catalog/${encodeURIComponent(serverId)}`);
      if (!response.ok) {
        throw new Error('サーバー詳細の取得に失敗しました');
      }
      
      const data = await response.json();
      if (data.success) {
        setServerDetails(data.data);
      } else {
        throw new Error(data.error?.message || 'サーバーが見つかりません');
      }
      
    } catch (error) {
      console.error('Failed to load server details:', error);
      setError(error instanceof Error ? error.message : 'サーバー詳細読み込みエラー');
    } finally {
      setIsLoading(false);
    }
  };
  
  // インストール処理
  const handleInstall = async () => {
    if (!serverDetails || !canInstallServers) return;
    
    try {
      setIsInstalling(true);
      
      const response = await fetch('/api/v1/servers/install', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: serverDetails.name,
          displayName: serverDetails.displayName,
          description: serverDetails.description,
          image: serverDetails.dockerImage || serverDetails.imageUrl,
          category: serverDetails.category,
          tags: serverDetails.tags,
          version: serverDetails.version,
          author: serverDetails.author,
        }),
      });
      
      if (!response.ok) {
        throw new Error('インストールに失敗しました');
      }
      
      const data = await response.json();
      if (data.success) {
        setServerDetails(prev => prev ? { ...prev, installationStatus: 'installed' } : null);
      } else {
        throw new Error(data.error?.message || 'インストールに失敗しました');
      }
      
    } catch (error) {
      console.error('Installation failed:', error);
      alert(`インストールに失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsInstalling(false);
    }
  };
  
  useEffect(() => {
    if (serverId) {
      loadServerDetails();
    }
  }, [serverId]);
  
  if (isLoading) {
    return (
      <ProtectedRoute requiredPermissions={['CATALOG_READ']}>
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-12">
            <div className="text-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto" />
              <p className="text-sm text-gray-500">サーバー詳細を読み込み中...</p>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }
  
  if (error || !serverDetails) {
    return (
      <ProtectedRoute requiredPermissions={['CATALOG_READ']}>
        <div className="container mx-auto px-4 py-8">
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error || 'サーバーが見つかりません'}</AlertDescription>
          </Alert>
          
          <Button onClick={() => router.push('/catalog')} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            カタログに戻る
          </Button>
        </div>
      </ProtectedRoute>
    );
  }
  
  return (
    <ProtectedRoute requiredPermissions={['CATALOG_READ']}>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* ヘッダーナビゲーション */}
        <div className="flex items-center mb-6">
          <Button 
            onClick={() => router.push('/catalog')} 
            variant="ghost" 
            size="sm"
            className="mr-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            カタログに戻る
          </Button>
          <div className="flex items-center text-sm text-gray-600">
            <span>カタログ</span>
            <span className="mx-2">/</span>
            <span className="font-medium text-gray-900">{serverDetails.displayName || serverDetails.name}</span>
          </div>
        </div>
        
        {/* サーバーヘッダー */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row md:items-start gap-6">
              {/* アイコンと基本情報 */}
              <div className="flex items-start space-x-4">
                {(serverDetails.icon || serverDetails.imageUrl) ? (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-white border border-gray-200 overflow-hidden flex-shrink-0">
                    <img 
                      src={serverDetails.icon || serverDetails.imageUrl} 
                      alt={`${serverDetails.displayName || serverDetails.name} icon`}
                      className="h-14 w-14 object-contain"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const parent = target.parentElement;
                        if (parent) {
                          parent.className = "flex h-16 w-16 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex-shrink-0";
                          parent.innerHTML = '<svg class="h-8 w-8 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>';
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex-shrink-0">
                    <Package className="h-8 w-8 text-white" />
                  </div>
                )}
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-3 mb-2">
                    <h1 className="text-3xl font-bold text-gray-900 truncate">
                      {serverDetails.displayName || serverDetails.name}
                    </h1>
                    {serverDetails.verified && (
                      <CheckCircle className="h-6 w-6 text-blue-500 flex-shrink-0" />
                    )}
                    {serverDetails.featured && (
                      <Star className="h-6 w-6 text-yellow-500 fill-current flex-shrink-0" />
                    )}
                  </div>
                  
                  <p className="text-gray-600 text-lg mb-4 line-clamp-2">
                    {serverDetails.description}
                  </p>
                  
                  <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                    <div className="flex items-center space-x-1">
                      <User className="h-4 w-4" />
                      <span>{serverDetails.author}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Download className="h-4 w-4" />
                      <span>{serverDetails.downloadCount.toLocaleString()} pulls</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Star className="h-4 w-4" />
                      <span>{serverDetails.rating}/5 ({serverDetails.ratingCount} reviews)</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Calendar className="h-4 w-4" />
                      <span>更新: {formatTimeAgo(serverDetails.lastUpdated)}</span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* インストールボタン */}
              <div className="flex flex-col space-y-3 flex-shrink-0">
                {canInstallServers && (
                  <Button
                    size="lg"
                    onClick={handleInstall}
                    disabled={isInstalling || serverDetails.installationStatus === 'installed'}
                    className="min-w-[140px]"
                  >
                    {isInstalling ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        インストール中
                      </>
                    ) : serverDetails.installationStatus === 'installed' ? (
                      <>
                        <CheckCircle className="mr-2 h-4 w-4" />
                        インストール済み
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        インストール
                      </>
                    )}
                  </Button>
                )}
                
                <div className="flex space-x-2">
                  {serverDetails.sourceUrl && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={serverDetails.sourceUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                  {serverDetails.documentationUrl && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={serverDetails.documentationUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </div>
            
            {/* タグ */}
            {serverDetails.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-6 pt-6 border-t border-gray-200">
                {serverDetails.tags.map(tag => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    <Tag className="h-3 w-3 mr-1" />
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* タブコンテンツ */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-4 w-full mb-8">
            <TabsTrigger value="overview">概要</TabsTrigger>
            <TabsTrigger value="configuration">設定</TabsTrigger>
            <TabsTrigger value="requirements">要件</TabsTrigger>
            <TabsTrigger value="installation">インストール</TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>説明</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {serverDetails.longDescription || serverDetails.description}
                </p>
              </CardContent>
            </Card>
            
            {serverDetails.capabilities && serverDetails.capabilities.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>機能</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {serverDetails.capabilities.map((capability, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                        <span className="text-sm">{capability}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            
            <Card>
              <CardHeader>
                <CardTitle>詳細情報</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3">基本情報</h4>
                    <dl className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-gray-600">カテゴリ:</dt>
                        <dd className="text-gray-900">{serverDetails.category}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-gray-600">バージョン:</dt>
                        <dd className="text-gray-900 font-mono">{serverDetails.version}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-gray-600">インストール方式:</dt>
                        <dd className="text-gray-900 capitalize">{serverDetails.installType}</dd>
                      </div>
                      {serverDetails.dockerImage && (
                        <div className="flex justify-between">
                          <dt className="text-gray-600">Docker Image:</dt>
                          <dd className="text-gray-900 font-mono text-xs">{serverDetails.dockerImage}</dd>
                        </div>
                      )}
                    </dl>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3">統計情報</h4>
                    <dl className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-gray-600">ダウンロード数:</dt>
                        <dd className="text-gray-900">{serverDetails.downloadCount.toLocaleString()}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-gray-600">評価:</dt>
                        <dd className="text-gray-900">{serverDetails.rating}/5 ({serverDetails.ratingCount}件)</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-gray-600">作成日:</dt>
                        <dd className="text-gray-900">{formatTimeAgo(serverDetails.createdAt)}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-gray-600">最終更新:</dt>
                        <dd className="text-gray-900">{formatTimeAgo(serverDetails.lastUpdated)}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="configuration" className="space-y-6">
            {serverDetails.configuration?.environment && (
              <Card>
                <CardHeader>
                  <CardTitle>環境変数</CardTitle>
                  <CardDescription>
                    このサーバーが必要とする環境変数の設定です。
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {serverDetails.configuration.environment.map((env, index) => (
                      <div key={index} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <code className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                              {env.name}
                            </code>
                            {env.required && (
                              <Badge variant="destructive" className="text-xs">必須</Badge>
                            )}
                          </div>
                          <Button variant="ghost" size="sm">
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{env.description}</p>
                        {env.default && (
                          <p className="text-xs text-gray-500">
                            デフォルト値: <code className="font-mono bg-gray-100 px-1 py-0.5 rounded">{env.default}</code>
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            
            {serverDetails.secrets && serverDetails.secrets.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>シークレット</CardTitle>
                  <CardDescription>
                    このサーバーが必要とするシークレット情報です。
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {serverDetails.secrets.map((secret, index) => (
                      <div key={index} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <code className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                              {secret.name}
                            </code>
                            <Badge variant="outline" className="text-xs">
                              {secret.env}
                            </Badge>
                          </div>
                        </div>
                        {secret.example && (
                          <p className="text-xs text-gray-500">
                            例: <code className="font-mono bg-gray-100 px-1 py-0.5 rounded">{secret.example}</code>
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            
            {serverDetails.configuration?.volumes && (
              <Card>
                <CardHeader>
                  <CardTitle>ボリューム</CardTitle>
                  <CardDescription>
                    このサーバーが使用するボリュームマウントの設定です。
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {serverDetails.configuration.volumes.map((volume, index) => (
                      <div key={index} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <code className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                            {volume.source} → {volume.target}
                          </code>
                          {volume.required && (
                            <Badge variant="destructive" className="text-xs">必須</Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">{volume.description}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
          
          <TabsContent value="requirements" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>システム要件</CardTitle>
                <CardDescription>
                  このサーバーを実行するために必要なシステムリソースです。
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {serverDetails.requirements?.memory && (
                    <div className="text-center">
                      <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                        <Settings className="h-6 w-6 text-blue-600" />
                      </div>
                      <h4 className="font-medium text-gray-900">メモリ</h4>
                      <p className="text-sm text-gray-600">{serverDetails.requirements.memory}</p>
                    </div>
                  )}
                  
                  {serverDetails.requirements?.cpu && (
                    <div className="text-center">
                      <div className="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                        <Settings className="h-6 w-6 text-green-600" />
                      </div>
                      <h4 className="font-medium text-gray-900">CPU</h4>
                      <p className="text-sm text-gray-600">{serverDetails.requirements.cpu}</p>
                    </div>
                  )}
                  
                  {serverDetails.requirements?.disk && (
                    <div className="text-center">
                      <div className="h-12 w-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                        <Settings className="h-6 w-6 text-purple-600" />
                      </div>
                      <h4 className="font-medium text-gray-900">ディスク</h4>
                      <p className="text-sm text-gray-600">{serverDetails.requirements.disk}</p>
                    </div>
                  )}
                  
                  <div className="text-center">
                    <div className="h-12 w-12 bg-orange-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                      <Settings className="h-6 w-6 text-orange-600" />
                    </div>
                    <h4 className="font-medium text-gray-900">ネットワーク</h4>
                    <p className="text-sm text-gray-600">
                      {serverDetails.requirements?.network ? '必要' : '不要'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {serverDetails.dependencies && serverDetails.dependencies.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>依存関係</CardTitle>
                  <CardDescription>
                    このサーバーが依存している外部パッケージやライブラリです。
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {serverDetails.dependencies.map((dep, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                        <div className="flex items-center space-x-3">
                          <Package className="h-5 w-5 text-gray-400" />
                          <div>
                            <p className="font-medium text-gray-900">{dep.name}</p>
                            <p className="text-sm text-gray-600">バージョン: {dep.version}</p>
                          </div>
                        </div>
                        {dep.required && (
                          <Badge variant="destructive" className="text-xs">必須</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
          
          <TabsContent value="installation" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>インストール方法</CardTitle>
                <CardDescription>
                  このサーバーのインストール手順と設定方法です。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h4 className="font-medium text-gray-900 mb-3">1. Webインターフェースからインストール</h4>
                  <p className="text-sm text-gray-600 mb-3">
                    最も簡単な方法です。上の「インストール」ボタンをクリックして自動インストールを開始します。
                  </p>
                  {canInstallServers && (
                    <Button onClick={handleInstall} disabled={isInstalling}>
                      {isInstalling ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          インストール中
                        </>
                      ) : (
                        <>
                          <Download className="mr-2 h-4 w-4" />
                          今すぐインストール
                        </>
                      )}
                    </Button>
                  )}
                </div>
                
                {serverDetails.dockerImage && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3">2. Docker Pullコマンド</h4>
                    <div className="bg-gray-900 text-white p-4 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-400">BASH</span>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-gray-400 hover:text-white h-6 px-2"
                          onClick={() => navigator.clipboard.writeText(`docker pull ${serverDetails.dockerImage}`)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <code className="text-sm">docker pull {serverDetails.dockerImage}</code>
                    </div>
                  </div>
                )}
                
                {serverDetails.githubRepo && (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3">3. ソースコードから構築</h4>
                    <div className="bg-gray-900 text-white p-4 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-400">BASH</span>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-gray-400 hover:text-white h-6 px-2"
                          onClick={() => navigator.clipboard.writeText(`git clone https://github.com/${serverDetails.githubRepo}`)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <code className="text-sm">git clone https://github.com/{serverDetails.githubRepo}</code>
                    </div>
                  </div>
                )}
                
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    本番環境でのインストールの前に、テスト環境での動作確認をお勧めします。
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ProtectedRoute>
  );
}