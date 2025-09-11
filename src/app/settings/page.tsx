'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { SystemSettings } from '@/components/settings/system-settings';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Settings,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Download,
  Upload,
  Shield,
  Palette,
  Globe
} from 'lucide-react';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { LanguageToggle } from '@/components/i18n/LanguageToggle';
import { Separator } from '@/components/ui/separator';

// =============================================================================
// 設定ページ - 新しいコンポーネントベース実装
// システム設定とアプリケーション設定の管理を提供
// =============================================================================

interface SystemSettingsData {
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
}

interface SystemInfo {
  uptime: number;
  totalMemory: number;
  usedMemory: number;
  cpuUsage: number;
  diskUsage: number;
  networkConnections: number;
  activeUsers: number;
  totalServers: number;
  runningServers: number;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SystemSettingsData | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // データ取得
  const loadSettingsData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // 設定データの取得
      const settingsRes = await fetch('/api/v1/settings');
      if (!settingsRes.ok) throw new Error('設定データの取得に失敗しました');
      
      const settingsData = await settingsRes.json();
      
      // モック設定データを設定（本来はAPIから取得）
      const mockSettings: SystemSettingsData = {
        general: {
          applicationName: 'Docker MCP Web Manager',
          applicationDescription: 'MCPサーバーの包括的な管理ツール',
          timezone: 'Asia/Tokyo',
          language: 'ja',
          defaultServerImage: 'mcpregistry/default:latest',
          version: '2.0.0',
          buildDate: '2024-01-15'
        },
        security: {
          sessionTimeout: 3600,
          maxLoginAttempts: 5,
          passwordMinLength: 8,
          requireMFA: false,
          allowedDomains: [],
          encryptionEnabled: true,
          auditLogEnabled: true
        },
        monitoring: {
          enableMetrics: true,
          metricsRetention: 30,
          logLevel: 'info',
          maxLogSize: 100,
          healthCheckInterval: 60
        },
        notifications: {
          enableNotifications: true,
          emailNotifications: true,
          slackWebhookUrl: '',
          notificationChannels: ['email', 'slack']
        },
        resources: {
          maxServersPerUser: 10,
          maxCpuPerServer: 4,
          maxMemoryPerServer: 4096,
          maxDiskPerServer: 100
        },
        backup: {
          enableAutoBackup: true,
          backupSchedule: '0 2 * * *',
          backupRetention: 30,
          backupLocation: '/var/backups/docker-mcp',
          lastBackup: new Date(Date.now() - 86400000).toISOString() // 昨日
        }
      };

      // システム情報の取得
      const systemRes = await fetch('/api/v1/system/info');
      const mockSystemInfo: SystemInfo = {
        uptime: 2592000, // 30日間の秒数
        totalMemory: 16000000000, // 16GB
        usedMemory: 8000000000, // 8GB
        cpuUsage: 35.2,
        diskUsage: 65.8,
        networkConnections: 245,
        activeUsers: 5,
        totalServers: 12,
        runningServers: 8
      };

      setSettings(mockSettings);
      setSystemInfo(mockSystemInfo);
      setLastUpdated(new Date());
      
    } catch (error) {
      console.error('Failed to load settings data:', error);
      setError(error instanceof Error ? error.message : '設定データ読み込みエラー');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSettingsData();
  }, []);

  // 設定保存
  const handleSaveSettings = async (settingsData: any) => {
    try {
      const response = await fetch('/api/v1/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(settingsData),
      });
      
      if (!response.ok) throw new Error('設定の保存に失敗しました');
      
      const data = await response.json();
      if (!data.success) throw new Error(data.error?.message || '設定の保存に失敗しました');
      
      // 設定を更新
      await loadSettingsData();
      
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw error;
    }
  };

  // 接続テスト
  const handleTestConnection = async (type: 'slack' | 'email') => {
    try {
      const response = await fetch(`/api/v1/settings/test-${type}`, {
        method: 'POST',
      });
      
      if (!response.ok) throw new Error(`${type}接続テストに失敗しました`);
      
      const data = await response.json();
      return data.success;
      
    } catch (error) {
      console.error(`${type} connection test failed:`, error);
      return false;
    }
  };

  // バックアップ
  const handleBackup = async () => {
    try {
      const response = await fetch('/api/v1/settings/backup', {
        method: 'POST',
      });
      
      if (!response.ok) throw new Error('バックアップの実行に失敗しました');
      
      const data = await response.json();
      if (!data.success) throw new Error(data.error?.message || 'バックアップの実行に失敗しました');
      
      // 設定を再読み込みして最新のバックアップ情報を取得
      await loadSettingsData();
      
    } catch (error) {
      console.error('Backup failed:', error);
      throw error;
    }
  };

  // 復元
  const handleRestore = async (file: File) => {
    try {
      const formData = new FormData();
      formData.append('backup', file);
      
      const response = await fetch('/api/v1/settings/restore', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) throw new Error('復元に失敗しました');
      
      const data = await response.json();
      if (!data.success) throw new Error(data.error?.message || '復元に失敗しました');
      
      // 設定を再読み込み
      await loadSettingsData();
      
    } catch (error) {
      console.error('Restore failed:', error);
      throw error;
    }
  };

  return (
    <ProtectedRoute requiredPermissions={['SETTINGS_READ']}>
      <div className="space-y-6">
        {/* ヘッダー */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">システム設定</h1>
            <p className="text-sm text-gray-600">
              アプリケーションの設定とシステム情報を管理します
            </p>
            {lastUpdated && (
              <p className="text-xs text-gray-500 mt-1">
                最終更新: {lastUpdated.toLocaleString('ja-JP')}
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadSettingsData} disabled={isLoading}>
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

        {/* クイック情報 */}
        {systemInfo && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Settings className="h-8 w-8 text-blue-500" />
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
                  <CheckCircle className="h-8 w-8 text-green-500" />
                  <div>
                    <p className="text-2xl font-semibold text-green-600">
                      {systemInfo.runningServers}/{systemInfo.totalServers}
                    </p>
                    <p className="text-sm text-gray-600">実行中サーバー</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Shield className="h-8 w-8 text-purple-500" />
                  <div>
                    <p className="text-2xl font-semibold">{systemInfo.cpuUsage.toFixed(1)}%</p>
                    <p className="text-sm text-gray-600">CPU使用率</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="h-8 w-8 text-orange-500" />
                  <div>
                    <p className="text-2xl font-semibold">{systemInfo.diskUsage.toFixed(1)}%</p>
                    <p className="text-sm text-gray-600">ディスク使用率</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左カラム: ユーザー設定 */}
          <div className="lg:col-span-1">
            {/* 表示設定 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  表示設定
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium">テーマ</h4>
                    <p className="text-sm text-muted-foreground">
                      アプリケーションの外観を設定します
                    </p>
                  </div>
                  <ThemeToggle variant="dropdown" showLabel />
                </div>
                
                <Separator />
                
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium">言語</h4>
                    <p className="text-sm text-muted-foreground">
                      表示言語を設定します
                    </p>
                  </div>
                  <LanguageToggle variant="dropdown" showLabel />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 右カラム: システム設定 */}
          <div className="lg:col-span-2">
            <SystemSettings
              settings={settings || undefined}
              systemInfo={systemInfo || undefined}
              isLoading={isLoading}
              error={error}
              onSave={handleSaveSettings}
              onTestConnection={handleTestConnection}
              onBackup={handleBackup}
              onRestore={handleRestore}
            />
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}