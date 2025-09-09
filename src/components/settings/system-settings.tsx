'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Save,
  X,
  RefreshCw,
  Settings,
  Shield,
  Database,
  Network,
  Bell,
  Key,
  FileText,
  Monitor,
  Users,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Eye,
  EyeOff,
  Upload,
  Download,
  Trash2,
  Plus
} from 'lucide-react';
import { usePermissions } from '@/components/auth/auth-provider';

// =============================================================================
// SystemSettings - システム設定管理コンポーネント
// アプリケーション全体の設定、セキュリティ、監視などの管理を提供
// =============================================================================

// バリデーションスキーマ
const systemSettingsSchema = z.object({
  // 一般設定
  applicationName: z.string().min(1, 'アプリケーション名は必須です').max(100),
  applicationDescription: z.string().max(500).optional(),
  timezone: z.string().min(1, 'タイムゾーンは必須です'),
  language: z.string().min(1, '言語は必須です'),
  defaultServerImage: z.string().min(1, 'デフォルトイメージは必須です'),
  
  // セキュリティ設定
  sessionTimeout: z.number().min(300).max(86400), // 5分〜24時間
  maxLoginAttempts: z.number().min(3).max(10),
  passwordMinLength: z.number().min(8).max(128),
  requireMFA: z.boolean(),
  allowedDomains: z.array(z.string()).optional(),
  
  // 監視設定
  enableMetrics: z.boolean(),
  metricsRetention: z.number().min(1).max(365), // 1日〜365日
  logLevel: z.enum(['debug', 'info', 'warn', 'error']),
  maxLogSize: z.number().min(10).max(1000), // 10MB〜1GB
  
  // 通知設定
  enableNotifications: z.boolean(),
  emailNotifications: z.boolean(),
  slackWebhookUrl: z.string().url().optional().or(z.literal('')),
  notificationChannels: z.array(z.string()).optional(),
  
  // リソース制限
  maxServersPerUser: z.number().min(1).max(100),
  maxCpuPerServer: z.number().min(0.1).max(16),
  maxMemoryPerServer: z.number().min(128).max(32768), // MB
  maxDiskPerServer: z.number().min(1).max(1024), // GB
  
  // バックアップ設定
  enableAutoBackup: z.boolean(),
  backupSchedule: z.string().optional(),
  backupRetention: z.number().min(1).max(90), // 1日〜90日
  backupLocation: z.string().optional()
});

type SystemSettingsData = z.infer<typeof systemSettingsSchema>;

interface SystemSettingsProps {
  settings?: {
    general: {
      applicationName: string;
      applicationDescription?: string;
      timezone: string;
      language: string;
      defaultServerImage: string;
      version: string;
      buildDate: string;
    };
    security: {
      sessionTimeout: number;
      maxLoginAttempts: number;
      passwordMinLength: number;
      requireMFA: boolean;
      allowedDomains?: string[];
      encryptionEnabled: boolean;
      auditLogEnabled: boolean;
    };
    monitoring: {
      enableMetrics: boolean;
      metricsRetention: number;
      logLevel: 'debug' | 'info' | 'warn' | 'error';
      maxLogSize: number;
      healthCheckInterval: number;
    };
    notifications: {
      enableNotifications: boolean;
      emailNotifications: boolean;
      slackWebhookUrl?: string;
      notificationChannels?: string[];
    };
    resources: {
      maxServersPerUser: number;
      maxCpuPerServer: number;
      maxMemoryPerServer: number;
      maxDiskPerServer: number;
    };
    backup: {
      enableAutoBackup: boolean;
      backupSchedule?: string;
      backupRetention: number;
      backupLocation?: string;
      lastBackup?: string;
    };
  };
  systemInfo?: {
    uptime: number;
    totalMemory: number;
    usedMemory: number;
    cpuUsage: number;
    diskUsage: number;
    networkConnections: number;
    activeUsers: number;
    totalServers: number;
    runningServers: number;
  };
  isLoading?: boolean;
  error?: string | null;
  onSave?: (settings: SystemSettingsData) => Promise<void>;
  onTestConnection?: (type: 'slack' | 'email') => Promise<boolean>;
  onBackup?: () => Promise<void>;
  onRestore?: (file: File) => Promise<void>;
  className?: string;
}

/**
 * ファイルサイズをフォーマット
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * アップタイムをフォーマット
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) return `${days}日 ${hours}時間 ${minutes}分`;
  if (hours > 0) return `${hours}時間 ${minutes}分`;
  return `${minutes}分`;
}

/**
 * システム設定コンポーネント
 */
export function SystemSettings({
  settings,
  systemInfo,
  isLoading = false,
  error = null,
  onSave,
  onTestConnection,
  onBackup,
  onRestore,
  className
}: SystemSettingsProps) {
  const { hasPermission } = usePermissions();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'security' | 'monitoring' | 'notifications' | 'resources' | 'backup'>('general');
  const [showSecretValues, setShowSecretValues] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, boolean | null>>({});
  
  // 権限チェック
  const canManageSettings = hasPermission('SETTINGS_MANAGE');
  const canViewSystemInfo = hasPermission('SYSTEM_INFO_READ');
  
  // フォーム初期化
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors, isDirty },
    reset
  } = useForm<SystemSettingsData>({
    resolver: zodResolver(systemSettingsSchema),
    defaultValues: {
      applicationName: settings?.general.applicationName || '',
      applicationDescription: settings?.general.applicationDescription || '',
      timezone: settings?.general.timezone || 'Asia/Tokyo',
      language: settings?.general.language || 'ja',
      defaultServerImage: settings?.general.defaultServerImage || '',
      sessionTimeout: settings?.security.sessionTimeout || 3600,
      maxLoginAttempts: settings?.security.maxLoginAttempts || 5,
      passwordMinLength: settings?.security.passwordMinLength || 8,
      requireMFA: settings?.security.requireMFA || false,
      allowedDomains: settings?.security.allowedDomains || [],
      enableMetrics: settings?.monitoring.enableMetrics || true,
      metricsRetention: settings?.monitoring.metricsRetention || 30,
      logLevel: settings?.monitoring.logLevel || 'info',
      maxLogSize: settings?.monitoring.maxLogSize || 100,
      enableNotifications: settings?.notifications.enableNotifications || true,
      emailNotifications: settings?.notifications.emailNotifications || true,
      slackWebhookUrl: settings?.notifications.slackWebhookUrl || '',
      notificationChannels: settings?.notifications.notificationChannels || [],
      maxServersPerUser: settings?.resources.maxServersPerUser || 10,
      maxCpuPerServer: settings?.resources.maxCpuPerServer || 4,
      maxMemoryPerServer: settings?.resources.maxMemoryPerServer || 4096,
      maxDiskPerServer: settings?.resources.maxDiskPerServer || 100,
      enableAutoBackup: settings?.backup.enableAutoBackup || false,
      backupSchedule: settings?.backup.backupSchedule || '',
      backupRetention: settings?.backup.backupRetention || 30,
      backupLocation: settings?.backup.backupLocation || ''
    }
  });

  // 設定更新時にフォームをリセット
  useEffect(() => {
    if (settings) {
      reset({
        applicationName: settings.general.applicationName,
        applicationDescription: settings.general.applicationDescription || '',
        timezone: settings.general.timezone,
        language: settings.general.language,
        defaultServerImage: settings.general.defaultServerImage,
        sessionTimeout: settings.security.sessionTimeout,
        maxLoginAttempts: settings.security.maxLoginAttempts,
        passwordMinLength: settings.security.passwordMinLength,
        requireMFA: settings.security.requireMFA,
        allowedDomains: settings.security.allowedDomains || [],
        enableMetrics: settings.monitoring.enableMetrics,
        metricsRetention: settings.monitoring.metricsRetention,
        logLevel: settings.monitoring.logLevel,
        maxLogSize: settings.monitoring.maxLogSize,
        enableNotifications: settings.notifications.enableNotifications,
        emailNotifications: settings.notifications.emailNotifications,
        slackWebhookUrl: settings.notifications.slackWebhookUrl || '',
        notificationChannels: settings.notifications.notificationChannels || [],
        maxServersPerUser: settings.resources.maxServersPerUser,
        maxCpuPerServer: settings.resources.maxCpuPerServer,
        maxMemoryPerServer: settings.resources.maxMemoryPerServer,
        maxDiskPerServer: settings.resources.maxDiskPerServer,
        enableAutoBackup: settings.backup.enableAutoBackup,
        backupSchedule: settings.backup.backupSchedule || '',
        backupRetention: settings.backup.backupRetention,
        backupLocation: settings.backup.backupLocation || ''
      });
    }
  }, [settings, reset]);

  // フォーム送信
  const onSubmit = async (data: SystemSettingsData) => {
    if (!onSave || !canManageSettings) return;
    
    setIsSaving(true);
    setSaveError(null);
    
    try {
      await onSave(data);
      console.log('[SYSTEM_SETTINGS] Settings saved successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : '設定の保存に失敗しました';
      setSaveError(message);
      console.error('[SYSTEM_SETTINGS] Save failed:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // 接続テスト
  const handleTestConnection = async (type: 'slack' | 'email') => {
    if (!onTestConnection) return;
    
    setTestResults(prev => ({ ...prev, [type]: null }));
    
    try {
      const result = await onTestConnection(type);
      setTestResults(prev => ({ ...prev, [type]: result }));
    } catch (error) {
      setTestResults(prev => ({ ...prev, [type]: false }));
      console.error(`[SYSTEM_SETTINGS] ${type} test failed:`, error);
    }
  };

  // ファイルアップロード処理
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && onRestore) {
      onRestore(file);
    }
  };

  if (!canManageSettings && !canViewSystemInfo) {
    return (
      <Alert variant="destructive">
        <Shield className="h-4 w-4" />
        <AlertDescription>
          システム設定を表示する権限がありません
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">システム設定</h1>
          <p className="text-sm text-gray-600">アプリケーションの設定を管理します</p>
        </div>

        {canManageSettings && (
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
              onClick={handleSubmit(onSubmit)}
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
        )}
      </div>

      {/* エラーメッセージ */}
      {(error || saveError) && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error || saveError}</AlertDescription>
        </Alert>
      )}

      {/* システム情報 */}
      {canViewSystemInfo && systemInfo && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Monitor className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-2xl font-semibold">{formatUptime(systemInfo.uptime)}</p>
                  <p className="text-sm text-gray-600">稼働時間</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Users className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-2xl font-semibold">{systemInfo.activeUsers}</p>
                  <p className="text-sm text-gray-600">アクティブユーザー</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Settings className="h-8 w-8 text-purple-500" />
                <div>
                  <p className="text-2xl font-semibold">{systemInfo.runningServers}/{systemInfo.totalServers}</p>
                  <p className="text-sm text-gray-600">実行中サーバー</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Database className="h-8 w-8 text-orange-500" />
                <div>
                  <p className="text-2xl font-semibold">
                    {formatFileSize(systemInfo.usedMemory)}/{formatFileSize(systemInfo.totalMemory)}
                  </p>
                  <p className="text-sm text-gray-600">メモリ使用量</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 設定フォーム */}
      {canManageSettings && (
        <form onSubmit={handleSubmit(onSubmit)}>
          <Card>
            <CardHeader>
              <div className="flex space-x-1">
                {[
                  { id: 'general', label: '一般', icon: Settings },
                  { id: 'security', label: 'セキュリティ', icon: Shield },
                  { id: 'monitoring', label: '監視', icon: Monitor },
                  { id: 'notifications', label: '通知', icon: Bell },
                  { id: 'resources', label: 'リソース', icon: Database },
                  { id: 'backup', label: 'バックアップ', icon: FileText }
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
              {/* 一般設定タブ */}
              {activeTab === 'general' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">アプリケーション名 *</label>
                      <Input
                        {...register('applicationName')}
                        placeholder="Docker MCP Web Manager"
                      />
                      {errors.applicationName && (
                        <p className="text-sm text-red-600">{errors.applicationName.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">タイムゾーン *</label>
                      <select
                        {...register('timezone')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="Asia/Tokyo">Asia/Tokyo</option>
                        <option value="UTC">UTC</option>
                        <option value="America/New_York">America/New_York</option>
                        <option value="Europe/London">Europe/London</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">説明</label>
                    <textarea
                      {...register('applicationDescription')}
                      placeholder="アプリケーションの説明"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={3}
                    />
                    {errors.applicationDescription && (
                      <p className="text-sm text-red-600">{errors.applicationDescription.message}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">言語</label>
                      <select
                        {...register('language')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="ja">日本語</option>
                        <option value="en">English</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">デフォルトサーバーイメージ *</label>
                      <Input
                        {...register('defaultServerImage')}
                        placeholder="mcpregistry/default:latest"
                      />
                      {errors.defaultServerImage && (
                        <p className="text-sm text-red-600">{errors.defaultServerImage.message}</p>
                      )}
                    </div>
                  </div>

                  {settings && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                      <div className="text-sm">
                        <span className="text-gray-500">バージョン:</span>
                        <span className="ml-2 font-mono">{settings.general.version}</span>
                      </div>
                      <div className="text-sm">
                        <span className="text-gray-500">ビルド日:</span>
                        <span className="ml-2">{settings.general.buildDate}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* セキュリティ設定タブ */}
              {activeTab === 'security' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">セッションタイムアウト (秒)</label>
                      <Input
                        {...register('sessionTimeout', { valueAsNumber: true })}
                        type="number"
                        min="300"
                        max="86400"
                        placeholder="3600"
                      />
                      {errors.sessionTimeout && (
                        <p className="text-sm text-red-600">{errors.sessionTimeout.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">最大ログイン試行回数</label>
                      <Input
                        {...register('maxLoginAttempts', { valueAsNumber: true })}
                        type="number"
                        min="3"
                        max="10"
                        placeholder="5"
                      />
                      {errors.maxLoginAttempts && (
                        <p className="text-sm text-red-600">{errors.maxLoginAttempts.message}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">パスワード最小長</label>
                      <Input
                        {...register('passwordMinLength', { valueAsNumber: true })}
                        type="number"
                        min="8"
                        max="128"
                        placeholder="8"
                      />
                      {errors.passwordMinLength && (
                        <p className="text-sm text-red-600">{errors.passwordMinLength.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          {...register('requireMFA')}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm font-medium">多要素認証を必須にする</span>
                      </label>
                    </div>
                  </div>

                  {settings && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span>暗号化: {settings.security.encryptionEnabled ? '有効' : '無効'}</span>
                      </div>
                      <div className="flex items-center space-x-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span>監査ログ: {settings.security.auditLogEnabled ? '有効' : '無効'}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 監視設定タブ */}
              {activeTab === 'monitoring' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        {...register('enableMetrics')}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm font-medium">メトリクス収集を有効にする</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">メトリクス保持期間 (日)</label>
                      <Input
                        {...register('metricsRetention', { valueAsNumber: true })}
                        type="number"
                        min="1"
                        max="365"
                        placeholder="30"
                      />
                      {errors.metricsRetention && (
                        <p className="text-sm text-red-600">{errors.metricsRetention.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">ログレベル</label>
                      <select
                        {...register('logLevel')}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="debug">Debug</option>
                        <option value="info">Info</option>
                        <option value="warn">Warning</option>
                        <option value="error">Error</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">最大ログサイズ (MB)</label>
                    <Input
                      {...register('maxLogSize', { valueAsNumber: true })}
                      type="number"
                      min="10"
                      max="1000"
                      placeholder="100"
                    />
                    {errors.maxLogSize && (
                      <p className="text-sm text-red-600">{errors.maxLogSize.message}</p>
                    )}
                  </div>
                </div>
              )}

              {/* 通知設定タブ */}
              {activeTab === 'notifications' && (
                <div className="space-y-4">
                  <div className="space-y-4">
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        {...register('enableNotifications')}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm font-medium">通知を有効にする</span>
                    </label>

                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        {...register('emailNotifications')}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm font-medium">メール通知を有効にする</span>
                    </label>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Slack Webhook URL</label>
                    <div className="flex space-x-2">
                      <div className="flex-1 relative">
                        <Input
                          {...register('slackWebhookUrl')}
                          type={showSecretValues.slack ? 'text' : 'password'}
                          placeholder="https://hooks.slack.com/services/..."
                        />
                        <button
                          type="button"
                          onClick={() => setShowSecretValues(prev => ({ ...prev, slack: !prev.slack }))}
                          className="absolute right-2 top-2.5"
                        >
                          {showSecretValues.slack ? (
                            <EyeOff className="h-4 w-4 text-gray-400" />
                          ) : (
                            <Eye className="h-4 w-4 text-gray-400" />
                          )}
                        </button>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleTestConnection('slack')}
                        disabled={!watch('slackWebhookUrl')}
                      >
                        {testResults.slack === null ? 'テスト' :
                         testResults.slack ? <CheckCircle className="h-4 w-4 text-green-500" /> :
                         <X className="h-4 w-4 text-red-500" />}
                      </Button>
                    </div>
                    {errors.slackWebhookUrl && (
                      <p className="text-sm text-red-600">{errors.slackWebhookUrl.message}</p>
                    )}
                  </div>
                </div>
              )}

              {/* リソース制限タブ */}
              {activeTab === 'resources' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">ユーザーあたり最大サーバー数</label>
                      <Input
                        {...register('maxServersPerUser', { valueAsNumber: true })}
                        type="number"
                        min="1"
                        max="100"
                        placeholder="10"
                      />
                      {errors.maxServersPerUser && (
                        <p className="text-sm text-red-600">{errors.maxServersPerUser.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">サーバーあたり最大CPU (コア)</label>
                      <Input
                        {...register('maxCpuPerServer', { valueAsNumber: true })}
                        type="number"
                        min="0.1"
                        max="16"
                        step="0.1"
                        placeholder="4"
                      />
                      {errors.maxCpuPerServer && (
                        <p className="text-sm text-red-600">{errors.maxCpuPerServer.message}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">サーバーあたり最大メモリ (MB)</label>
                      <Input
                        {...register('maxMemoryPerServer', { valueAsNumber: true })}
                        type="number"
                        min="128"
                        max="32768"
                        placeholder="4096"
                      />
                      {errors.maxMemoryPerServer && (
                        <p className="text-sm text-red-600">{errors.maxMemoryPerServer.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">サーバーあたり最大ディスク (GB)</label>
                      <Input
                        {...register('maxDiskPerServer', { valueAsNumber: true })}
                        type="number"
                        min="1"
                        max="1024"
                        placeholder="100"
                      />
                      {errors.maxDiskPerServer && (
                        <p className="text-sm text-red-600">{errors.maxDiskPerServer.message}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* バックアップ設定タブ */}
              {activeTab === 'backup' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        {...register('enableAutoBackup')}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm font-medium">自動バックアップを有効にする</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">バックアップスケジュール (Cron)</label>
                      <Input
                        {...register('backupSchedule')}
                        placeholder="0 2 * * *"
                        disabled={!watch('enableAutoBackup')}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">バックアップ保持期間 (日)</label>
                      <Input
                        {...register('backupRetention', { valueAsNumber: true })}
                        type="number"
                        min="1"
                        max="90"
                        placeholder="30"
                      />
                      {errors.backupRetention && (
                        <p className="text-sm text-red-600">{errors.backupRetention.message}</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">バックアップ保存場所</label>
                    <Input
                      {...register('backupLocation')}
                      placeholder="/var/backups/docker-mcp"
                    />
                  </div>

                  <div className="flex space-x-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onBackup}
                      disabled={!onBackup}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      今すぐバックアップ
                    </Button>
                    
                    <div className="relative">
                      <input
                        type="file"
                        accept=".json,.zip"
                        onChange={handleFileUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!onRestore}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        復元
                      </Button>
                    </div>
                  </div>

                  {settings?.backup.lastBackup && (
                    <div className="text-sm text-gray-500">
                      最終バックアップ: {settings.backup.lastBackup}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </form>
      )}
    </div>
  );
}