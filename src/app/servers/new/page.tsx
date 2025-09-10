'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Server, AlertTriangle, Loader2, CheckCircle } from 'lucide-react';

// =============================================================================
// 新しいサーバー作成ページ
// MCPサーバーの新規作成フォーム
// =============================================================================

interface ServerFormData {
  name: string;
  image: string;
  description: string;
  version: string;
  port: number;
  environment: Record<string, string>;
  resourceLimits: {
    memory: string;
    cpu: string;
  };
}

function NewServerPageComponent() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  const [formData, setFormData] = useState<ServerFormData>({
    name: '',
    image: '',
    description: '',
    version: 'latest',
    port: 3000,
    environment: {},
    resourceLimits: {
      memory: '512m',
      cpu: '0.5'
    }
  });

  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>([
    { key: '', value: '' }
  ]);

  // フォーム入力処理
  const handleInputChange = (field: keyof ServerFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleResourceLimitChange = (field: 'memory' | 'cpu', value: string) => {
    setFormData(prev => ({
      ...prev,
      resourceLimits: {
        ...prev.resourceLimits,
        [field]: value
      }
    }));
  };

  // 環境変数の管理
  const addEnvVar = () => {
    setEnvVars(prev => [...prev, { key: '', value: '' }]);
  };

  const removeEnvVar = (index: number) => {
    setEnvVars(prev => prev.filter((_, i) => i !== index));
  };

  const updateEnvVar = (index: number, field: 'key' | 'value', value: string) => {
    setEnvVars(prev => prev.map((env, i) => 
      i === index ? { ...env, [field]: value } : env
    ));
  };

  // フォーム送信
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // 環境変数を整形
      const environment = envVars.reduce((acc, env) => {
        if (env.key && env.value) {
          acc[env.key] = env.value;
        }
        return acc;
      }, {} as Record<string, string>);

      const serverData = {
        ...formData,
        environment,
        port: Number(formData.port)
      };

      const response = await fetch('/api/v1/servers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(serverData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'サーバーの作成に失敗しました');
      }

      setSuccess(true);
      
      // 3秒後にサーバー一覧ページにリダイレクト
      setTimeout(() => {
        router.push('/servers');
      }, 3000);

    } catch (error) {
      console.error('Server creation failed:', error);
      setError(error instanceof Error ? error.message : 'サーバーの作成に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  // バリデーション
  const isFormValid = formData.name && formData.image && formData.port > 0;

  if (success) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <Button variant="outline" size="sm" onClick={() => router.push('/servers')}>
            <ArrowLeft className="h-4 w-4" />
            サーバー一覧に戻る
          </Button>
        </div>

        <Card>
          <CardContent className="p-8 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-green-700 mb-2">
              サーバーが正常に作成されました
            </h2>
            <p className="text-gray-600 mb-4">
              「{formData.name}」の作成が完了しました。
            </p>
            <p className="text-sm text-gray-500">
              3秒後にサーバー一覧ページにリダイレクトします...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center space-x-4">
        <Button variant="outline" size="sm" onClick={() => router.push('/servers')}>
          <ArrowLeft className="h-4 w-4" />
          サーバー一覧に戻る
        </Button>
      </div>

      <div className="flex items-center space-x-2">
        <Server className="h-6 w-6 text-blue-500" />
        <h1 className="text-2xl font-semibold text-gray-900">新しいサーバーを作成</h1>
      </div>

      {/* エラー表示 */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* フォーム */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 基本情報 */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>基本情報</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">サーバー名 *</Label>
                    <Input
                      id="name"
                      type="text"
                      value={formData.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      placeholder="例: my-mcp-server"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="version">バージョン</Label>
                    <Input
                      id="version"
                      type="text"
                      value={formData.version}
                      onChange={(e) => handleInputChange('version', e.target.value)}
                      placeholder="例: latest, v1.0.0"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="image">Dockerイメージ *</Label>
                  <Input
                    id="image"
                    type="text"
                    value={formData.image}
                    onChange={(e) => handleInputChange('image', e.target.value)}
                    placeholder="例: mcp/example-server:latest"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="description">説明</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    placeholder="サーバーの説明を入力してください"
                    rows={3}
                  />
                </div>

                <div>
                  <Label htmlFor="port">ポート番号 *</Label>
                  <Input
                    id="port"
                    type="number"
                    value={formData.port}
                    onChange={(e) => handleInputChange('port', parseInt(e.target.value) || 0)}
                    placeholder="3000"
                    min="1"
                    max="65535"
                    required
                  />
                </div>
              </CardContent>
            </Card>

            {/* 環境変数 */}
            <Card>
              <CardHeader>
                <CardTitle>環境変数</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {envVars.map((env, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <Input
                      type="text"
                      value={env.key}
                      onChange={(e) => updateEnvVar(index, 'key', e.target.value)}
                      placeholder="変数名"
                      className="flex-1"
                    />
                    <Input
                      type="text"
                      value={env.value}
                      onChange={(e) => updateEnvVar(index, 'value', e.target.value)}
                      placeholder="値"
                      className="flex-1"
                    />
                    {envVars.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeEnvVar(index)}
                      >
                        削除
                      </Button>
                    )}
                  </div>
                ))}
                <Button type="button" variant="outline" onClick={addEnvVar}>
                  環境変数を追加
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* リソース設定 */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle>リソース制限</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="memory">メモリ制限</Label>
                  <Select 
                    value={formData.resourceLimits.memory} 
                    onValueChange={(value) => handleResourceLimitChange('memory', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="メモリを選択" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="256m">256MB</SelectItem>
                      <SelectItem value="512m">512MB</SelectItem>
                      <SelectItem value="1g">1GB</SelectItem>
                      <SelectItem value="2g">2GB</SelectItem>
                      <SelectItem value="4g">4GB</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="cpu">CPU制限</Label>
                  <Select 
                    value={formData.resourceLimits.cpu} 
                    onValueChange={(value) => handleResourceLimitChange('cpu', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="CPUを選択" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0.25">0.25 CPU</SelectItem>
                      <SelectItem value="0.5">0.5 CPU</SelectItem>
                      <SelectItem value="1">1 CPU</SelectItem>
                      <SelectItem value="2">2 CPU</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* アクションボタン */}
            <Card>
              <CardContent className="p-4">
                <div className="space-y-3">
                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={!isFormValid || isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        作成中...
                      </>
                    ) : (
                      <>
                        <Server className="h-4 w-4 mr-2" />
                        サーバーを作成
                      </>
                    )}
                  </Button>
                  
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="w-full"
                    onClick={() => router.push('/servers')}
                    disabled={isLoading}
                  >
                    キャンセル
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}

// 開発環境では認証バイパス、本番環境では認証必須
export default function NewServerPage() {
  // 開発環境での認証バイパス
  if (process.env.NODE_ENV === 'development') {
    return <NewServerPageComponent />;
  }
  
  // 本番環境では認証必須
  return (
    <ProtectedRoute requiredPermissions={['SERVERS_CREATE']}>
      <NewServerPageComponent />
    </ProtectedRoute>
  );
}