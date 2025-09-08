'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  ArrowLeft,
  Save,
  X,
  Plus,
  Trash2,
  Settings,
  Shield,
  HardDrive,
  Network,
  Cpu,
  MemoryStick,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Eye,
  EyeOff
} from 'lucide-react';
import { usePermissions } from '@/components/auth/auth-provider';

// =============================================================================
// ServerSettings - MCPサーバー設定管理コンポーネント
// サーバーの設定変更、環境変数、ボリューム、ネットワーク設定を提供
// =============================================================================

// バリデーションスキーマ
const serverSettingsSchema = z.object({
  name: z.string().min(1, 'サーバー名は必須です').max(100, 'サーバー名は100文字以内で入力してください'),
  description: z.string().max(500, '説明は500文字以内で入力してください').optional(),
  imageUrl: z.string().min(1, 'イメージURLは必須です'),
  version: z.string().optional(),
  port: z.number().int().min(1).max(65535).optional(),
  memoryLimit: z.number().int().min(64).max(16384).optional(), // MB
  cpuLimit: z.number().min(0.1).max(8).optional(), // CPU cores
  restartPolicy: z.enum(['no', 'always', 'on-failure', 'unless-stopped']).optional(),
  tags: z.array(z.string()).optional(),
  environment: z.record(z.string()).optional(),
  volumes: z.array(z.object({
    source: z.string().min(1, 'ソースパスは必須です'),
    target: z.string().min(1, 'ターゲットパスは必須です'),
    readonly: z.boolean().default(false)
  })).optional(),
  networks: z.array(z.string()).optional()
});

type ServerSettingsData = z.infer<typeof serverSettingsSchema>;

interface ServerSettingsProps {
  serverId: string;
  server?: {
    id: string;
    name: string;
    description?: string;
    imageUrl: string;
    version?: string;
    port?: number;
    memoryLimit?: number;
    cpuLimit?: number;
    restartPolicy?: 'no' | 'always' | 'on-failure' | 'unless-stopped';
    tags?: string[];
    environment?: Record<string, string>;
    volumes?: Array<{
      source: string;
      target: string;
      readonly: boolean;
    }>;
    networks?: string[];
    status: string;
  };
  isLoading?: boolean;
  error?: string | null;
  onSave?: (settings: ServerSettingsData) => Promise<void>;
  className?: string;
}

/**
 * サーバー設定コンポーネント
 */
export function ServerSettings({
  serverId,
  server,
  isLoading = false,
  error = null,
  onSave,
  className
}: ServerSettingsProps) {
  const { hasPermission } = usePermissions();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'basic' | 'resources' | 'environment' | 'volumes' | 'network'>('basic');
  const [showSecretValues, setShowSecretValues] = useState<Record<string, boolean>>({});
  
  // 権限チェック
  const canConfigureServers = hasPermission('SERVERS_CONFIGURE');
  
  // フォーム初期化
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors, isDirty },
    reset
  } = useForm<ServerSettingsData>({
    resolver: zodResolver(serverSettingsSchema),
    defaultValues: {
      name: server?.name || '',
      description: server?.description || '',
      imageUrl: server?.imageUrl || '',
      version: server?.version || '',
      port: server?.port,
      memoryLimit: server?.memoryLimit,
      cpuLimit: server?.cpuLimit,
      restartPolicy: server?.restartPolicy || 'unless-stopped',
      tags: server?.tags || [],
      environment: server?.environment || {},
      volumes: server?.volumes || [],
      networks: server?.networks || []
    }
  });

  // サーバー設定更新時にフォームをリセット
  useEffect(() => {
    if (server) {
      reset({
        name: server.name,
        description: server.description || '',
        imageUrl: server.imageUrl,
        version: server.version || '',
        port: server.port,
        memoryLimit: server.memoryLimit,
        cpuLimit: server.cpuLimit,
        restartPolicy: server.restartPolicy || 'unless-stopped',
        tags: server.tags || [],
        environment: server.environment || {},
        volumes: server.volumes || [],
        networks: server.networks || []
      });
    }
  }, [server, reset]);

  // フォーム送信
  const onSubmit = async (data: ServerSettingsData) => {
    if (!onSave || !canConfigureServers) return;
    
    setIsSaving(true);
    setSaveError(null);
    
    try {
      await onSave(data);
      console.log('[SERVER_SETTINGS] Settings saved successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : '設定の保存に失敗しました';
      setSaveError(message);
      console.error('[SERVER_SETTINGS] Save failed:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // 環境変数の追加
  const addEnvironmentVariable = () => {
    const currentEnv = getValues('environment') || {};
    setValue('environment', { ...currentEnv, '': '' }, { shouldDirty: true });
  };

  // 環境変数の削除
  const removeEnvironmentVariable = (key: string) => {
    const currentEnv = getValues('environment') || {};
    const { [key]: removed, ...rest } = currentEnv;
    setValue('environment', rest, { shouldDirty: true });
  };

  // 環境変数のキー・値更新
  const updateEnvironmentVariable = (oldKey: string, newKey: string, value: string) => {
    const currentEnv = getValues('environment') || {};
    const { [oldKey]: removed, ...rest } = currentEnv;
    setValue('environment', { ...rest, [newKey]: value }, { shouldDirty: true });
  };

  // ボリュームの追加
  const addVolume = () => {
    const currentVolumes = getValues('volumes') || [];
    setValue('volumes', [...currentVolumes, { source: '', target: '', readonly: false }], { shouldDirty: true });
  };

  // ボリュームの削除
  const removeVolume = (index: number) => {
    const currentVolumes = getValues('volumes') || [];
    setValue('volumes', currentVolumes.filter((_, i) => i !== index), { shouldDirty: true });
  };

  // タグの追加
  const addTag = (tag: string) => {
    const currentTags = getValues('tags') || [];
    if (tag.trim() && !currentTags.includes(tag.trim())) {
      setValue('tags', [...currentTags, tag.trim()], { shouldDirty: true });
    }
  };

  // タグの削除
  const removeTag = (tag: string) => {
    const currentTags = getValues('tags') || [];
    setValue('tags', currentTags.filter(t => t !== tag), { shouldDirty: true });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto" />
          <p className="text-sm text-gray-500">設定を読み込み中...</p>
        </div>
      </div>
    );
  }

  if (error || !server) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          {error || 'サーバー設定の取得に失敗しました'}
        </AlertDescription>
      </Alert>
    );
  }

  if (!canConfigureServers) {
    return (
      <Alert variant="destructive">
        <Shield className="h-4 w-4" />
        <AlertDescription>
          サーバー設定を変更する権限がありません
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className={`space-y-6 ${className}`}>
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/servers/${serverId}`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              サーバー詳細に戻る
            </Link>
          </Button>
          
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">サーバー設定</h1>
            <p className="text-sm text-gray-600">{server.name}の設定を管理します</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => reset()}
            disabled={!isDirty || isSaving}
          >
            <X className="h-4 w-4 mr-2" />
            リセット
          </Button>
          
          <Button
            type="submit"
            disabled={!isDirty || isSaving}
          >
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            保存
          </Button>
        </div>
      </div>

      {/* エラーメッセージ */}
      {saveError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}

      {/* サーバーステータス警告 */}
      {server.status === 'running' && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            サーバーが実行中です。設定変更を反映するには再起動が必要になる場合があります。
          </AlertDescription>
        </Alert>
      )}

      {/* タブナビゲーション */}
      <Card>
        <CardHeader>
          <div className="flex space-x-1">
            {[
              { id: 'basic', label: '基本設定', icon: Settings },
              { id: 'resources', label: 'リソース', icon: Cpu },
              { id: 'environment', label: '環境変数', icon: Shield },
              { id: 'volumes', label: 'ボリューム', icon: HardDrive },
              { id: 'network', label: 'ネットワーク', icon: Network }
            ].map((tab) => {
              const TabIcon = tab.icon;
              return (
                <Button
                  key={tab.id}
                  type="button"
                  variant={activeTab === tab.id ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setActiveTab(tab.id as any)}
                >
                  <TabIcon className="h-4 w-4 mr-2" />
                  {tab.label}
                </Button>
              );
            })}
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* 基本設定タブ */}
          {activeTab === 'basic' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">サーバー名 *</label>
                  <Input
                    {...register('name')}
                    placeholder="サーバー名を入力"
                  />
                  {errors.name && (
                    <p className="text-sm text-red-600">{errors.name.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">バージョン</label>
                  <Input
                    {...register('version')}
                    placeholder="例: 1.0.0"
                  />
                  {errors.version && (
                    <p className="text-sm text-red-600">{errors.version.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">説明</label>
                <textarea
                  {...register('description')}
                  placeholder="サーバーの説明を入力"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                />
                {errors.description && (
                  <p className="text-sm text-red-600">{errors.description.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Dockerイメージ *</label>
                <Input
                  {...register('imageUrl')}
                  placeholder="例: mcpregistry/example-server:latest"
                />
                {errors.imageUrl && (
                  <p className="text-sm text-red-600">{errors.imageUrl.message}</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">ポート</label>
                  <Input
                    {...register('port', { valueAsNumber: true })}
                    type="number"
                    min="1"
                    max="65535"
                    placeholder="3000"
                  />
                  {errors.port && (
                    <p className="text-sm text-red-600">{errors.port.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">再起動ポリシー</label>
                  <select
                    {...register('restartPolicy')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="no">再起動しない</option>
                    <option value="always">常に再起動</option>
                    <option value="on-failure">失敗時のみ再起動</option>
                    <option value="unless-stopped">手動停止まで再起動</option>
                  </select>
                </div>
              </div>

              {/* タグ */}
              <div className="space-y-2">
                <label className="text-sm font-medium">タグ</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {(watch('tags') || []).map((tag, index) => (
                    <Badge key={index} variant="outline" className="flex items-center gap-1">
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="ml-1 hover:text-red-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex space-x-2">
                  <Input
                    placeholder="タグを入力してEnterキーを押す"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const target = e.target as HTMLInputElement;
                        addTag(target.value);
                        target.value = '';
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* リソース設定タブ */}
          {activeTab === 'resources' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center space-x-2">
                    <MemoryStick className="h-4 w-4" />
                    <span>メモリ制限 (MB)</span>
                  </label>
                  <Input
                    {...register('memoryLimit', { valueAsNumber: true })}
                    type="number"
                    min="64"
                    max="16384"
                    placeholder="512"
                  />
                  <p className="text-xs text-gray-500">64MB～16GBの範囲で指定してください</p>
                  {errors.memoryLimit && (
                    <p className="text-sm text-red-600">{errors.memoryLimit.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center space-x-2">
                    <Cpu className="h-4 w-4" />
                    <span>CPU制限 (コア数)</span>
                  </label>
                  <Input
                    {...register('cpuLimit', { valueAsNumber: true })}
                    type="number"
                    min="0.1"
                    max="8"
                    step="0.1"
                    placeholder="1.0"
                  />
                  <p className="text-xs text-gray-500">0.1～8コアの範囲で指定してください</p>
                  {errors.cpuLimit && (
                    <p className="text-sm text-red-600">{errors.cpuLimit.message}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 環境変数タブ */}
          {activeTab === 'environment' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">環境変数</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addEnvironmentVariable}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  追加
                </Button>
              </div>

              <div className="space-y-2">
                {Object.entries(watch('environment') || {}).map(([key, value], index) => (
                  <div key={index} className="flex space-x-2 items-center">
                    <Input
                      placeholder="変数名"
                      defaultValue={key}
                      onChange={(e) => updateEnvironmentVariable(key, e.target.value, value)}
                      className="flex-1"
                    />
                    <div className="flex-1 relative">
                      <Input
                        type={showSecretValues[key] ? 'text' : 'password'}
                        placeholder="値"
                        defaultValue={value}
                        onChange={(e) => updateEnvironmentVariable(key, key, e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecretValues(prev => ({ ...prev, [key]: !prev[key] }))}
                        className="absolute right-2 top-2.5"
                      >
                        {showSecretValues[key] ? (
                          <EyeOff className="h-4 w-4 text-gray-400" />
                        ) : (
                          <Eye className="h-4 w-4 text-gray-400" />
                        )}
                      </button>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => removeEnvironmentVariable(key)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              {Object.keys(watch('environment') || {}).length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  設定された環境変数がありません
                </div>
              )}
            </div>
          )}

          {/* ボリュームタブ */}
          {activeTab === 'volumes' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">ボリュームマウント</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addVolume}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  追加
                </Button>
              </div>

              <div className="space-y-4">
                {(watch('volumes') || []).map((volume, index) => (
                  <Card key={index}>
                    <CardContent className="p-4">
                      <div className="flex space-x-2 items-start">
                        <div className="flex-1 space-y-2">
                          <Input
                            {...register(`volumes.${index}.source`)}
                            placeholder="ホストパス (例: /host/data)"
                          />
                        </div>
                        
                        <div className="flex-1 space-y-2">
                          <Input
                            {...register(`volumes.${index}.target`)}
                            placeholder="コンテナパス (例: /app/data)"
                          />
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            {...register(`volumes.${index}.readonly`)}
                            className="rounded border-gray-300"
                          />
                          <label className="text-sm text-gray-600">読み取り専用</label>
                        </div>
                        
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => removeVolume(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {(watch('volumes') || []).length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  マウントされたボリュームがありません
                </div>
              )}
            </div>
          )}

          {/* ネットワークタブ */}
          {activeTab === 'network' && (
            <div className="space-y-4">
              <div className="text-center py-8 text-gray-500">
                ネットワーク設定は今後のバージョンで対応予定です
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </form>
  );
}