'use client';

import { useState, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Download,
  Upload,
  Database,
  FileText,
  Settings,
  Shield,
  Clock,
  CheckCircle,
  AlertTriangle,
  Info,
  Trash2,
  RotateCcw,
  Archive
} from 'lucide-react';
import { cn } from '@/lib/utils';

// =============================================================================
// バックアップ・復元コンポーネント
// システムデータの完全バックアップと復元機能を提供
// =============================================================================

interface BackupData {
  id: string;
  name: string;
  createdAt: string;
  size: string;
  type: 'full' | 'settings' | 'database' | 'secrets';
  status: 'completed' | 'failed' | 'in_progress';
  description?: string;
  version: string;
}

interface BackupRestoreProps {
  className?: string;
}

const mockBackups: BackupData[] = [
  {
    id: '1',
    name: 'システム全体バックアップ',
    createdAt: '2024-01-15T10:30:00Z',
    size: '125.3 MB',
    type: 'full',
    status: 'completed',
    description: '全設定、データベース、シークレットを含む完全バックアップ',
    version: '2.0.0'
  },
  {
    id: '2',
    name: '設定のみバックアップ',
    createdAt: '2024-01-14T15:45:00Z',
    size: '2.1 MB',
    type: 'settings',
    status: 'completed',
    description: 'システム設定とユーザー設定のバックアップ',
    version: '2.0.0'
  },
  {
    id: '3',
    name: 'データベースバックアップ',
    createdAt: '2024-01-13T08:00:00Z',
    size: '89.7 MB',
    type: 'database',
    status: 'completed',
    description: 'サーバー情報、ログ、メトリクスデータのバックアップ',
    version: '2.0.0'
  },
];

export function BackupRestore({ className }: BackupRestoreProps) {
  const [backups, setBackups] = useState<BackupData[]>(mockBackups);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedBackupType, setSelectedBackupType] = useState<'full' | 'settings' | 'database' | 'secrets'>('full');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const backupTypes = [
    {
      type: 'full' as const,
      name: '完全バックアップ',
      description: '全ての設定、データベース、シークレットを含む',
      icon: Archive,
      color: 'text-blue-500'
    },
    {
      type: 'settings' as const,
      name: '設定のみ',
      description: 'システム設定とユーザー設定のみ',
      icon: Settings,
      color: 'text-green-500'
    },
    {
      type: 'database' as const,
      name: 'データベース',
      description: 'サーバー情報とログデータのみ',
      icon: Database,
      color: 'text-purple-500'
    },
    {
      type: 'secrets' as const,
      name: 'シークレット',
      description: '暗号化されたシークレットデータのみ',
      icon: Shield,
      color: 'text-red-500'
    },
  ];

  const createBackup = async () => {
    setIsCreatingBackup(true);
    setError(null);
    setSuccess(null);
    setProgress(0);

    try {
      // プログレス表示のためのシミュレーション
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 95) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + Math.random() * 10;
        });
      }, 300);

      const response = await fetch('/api/v1/backup/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: selectedBackupType }),
      });

      clearInterval(progressInterval);
      setProgress(100);

      if (!response.ok) {
        throw new Error(`バックアップ作成に失敗しました: ${response.status}`);
      }

      const result = await response.json();
      
      // 新しいバックアップをリストに追加
      const newBackup: BackupData = {
        id: Date.now().toString(),
        name: backupTypes.find(t => t.type === selectedBackupType)?.name || 'バックアップ',
        createdAt: new Date().toISOString(),
        size: '計算中...',
        type: selectedBackupType,
        status: 'completed',
        description: backupTypes.find(t => t.type === selectedBackupType)?.description,
        version: '2.0.0'
      };

      setBackups(prev => [newBackup, ...prev]);
      setSuccess('バックアップが正常に作成されました');

    } catch (error) {
      console.error('Backup creation failed:', error);
      setError(error instanceof Error ? error.message : 'バックアップの作成に失敗しました');
      setProgress(0);
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const restoreFromBackup = async (backupId: string) => {
    setIsRestoring(true);
    setError(null);
    setSuccess(null);
    setProgress(0);

    try {
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 95) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + Math.random() * 8;
        });
      }, 400);

      const response = await fetch(`/api/v1/backup/${backupId}/restore`, {
        method: 'POST',
      });

      clearInterval(progressInterval);
      setProgress(100);

      if (!response.ok) {
        throw new Error(`復元に失敗しました: ${response.status}`);
      }

      const result = await response.json();
      setSuccess('バックアップからの復元が完了しました。システムを再起動してください。');

    } catch (error) {
      console.error('Restore failed:', error);
      setError(error instanceof Error ? error.message : '復元に失敗しました');
      setProgress(0);
    } finally {
      setIsRestoring(false);
    }
  };

  const uploadBackup = async (file: File) => {
    setIsRestoring(true);
    setError(null);
    setSuccess(null);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append('backup', file);

      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 95) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + Math.random() * 7;
        });
      }, 350);

      const response = await fetch('/api/v1/backup/upload', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setProgress(100);

      if (!response.ok) {
        throw new Error(`バックアップアップロードに失敗しました: ${response.status}`);
      }

      const result = await response.json();
      setSuccess('バックアップファイルのアップロードと復元が完了しました');

    } catch (error) {
      console.error('Upload failed:', error);
      setError(error instanceof Error ? error.message : 'アップロードに失敗しました');
      setProgress(0);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadBackup(file);
    }
  };

  const deleteBackup = async (backupId: string) => {
    try {
      const response = await fetch(`/api/v1/backup/${backupId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('バックアップの削除に失敗しました');
      }

      setBackups(prev => prev.filter(b => b.id !== backupId));
      setSuccess('バックアップが削除されました');

    } catch (error) {
      console.error('Delete failed:', error);
      setError(error instanceof Error ? error.message : '削除に失敗しました');
    }
  };

  const getStatusBadge = (status: BackupData['status']) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="flex items-center gap-1">
          <CheckCircle className="h-3 w-3" />
          完了
        </Badge>;
      case 'failed':
        return <Badge variant="destructive" className="flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          失敗
        </Badge>;
      case 'in_progress':
        return <Badge variant="secondary" className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          進行中
        </Badge>;
      default:
        return <Badge variant="secondary">不明</Badge>;
    }
  };

  const getTypeIcon = (type: BackupData['type']) => {
    const typeConfig = backupTypes.find(t => t.type === type);
    if (!typeConfig) return Database;
    
    const Icon = typeConfig.icon;
    return <Icon className={cn('h-4 w-4', typeConfig.color)} />;
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* アラート */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {/* プログレス表示 */}
      {(isCreatingBackup || isRestoring) && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{isCreatingBackup ? 'バックアップ作成中...' : '復元中...'}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="w-full" />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* バックアップ作成 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              バックアップ作成
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <h4 className="text-sm font-medium">バックアップタイプ</h4>
              <div className="grid grid-cols-1 gap-2">
                {backupTypes.map((type) => {
                  const Icon = type.icon;
                  return (
                    <label
                      key={type.type}
                      className={cn(
                        'flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors',
                        selectedBackupType === type.type
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-accent'
                      )}
                    >
                      <input
                        type="radio"
                        name="backupType"
                        value={type.type}
                        checked={selectedBackupType === type.type}
                        onChange={() => setSelectedBackupType(type.type)}
                        className="sr-only"
                      />
                      <Icon className={cn('h-4 w-4', type.color)} />
                      <div className="flex-1">
                        <div className="text-sm font-medium">{type.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {type.description}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <Separator />

            <Button
              onClick={createBackup}
              disabled={isCreatingBackup || isRestoring}
              className="w-full"
            >
              <Download className="h-4 w-4 mr-2" />
              {isCreatingBackup ? '作成中...' : 'バックアップ作成'}
            </Button>
          </CardContent>
        </Card>

        {/* バックアップ復元 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              バックアップ復元
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                復元を実行すると現在のデータが置き換えられます。実行前に最新のバックアップを作成することを強く推奨します。
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isCreatingBackup || isRestoring}
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                ファイルからアップロード
              </Button>
              
              <input
                ref={fileInputRef}
                type="file"
                accept=".backup,.json,.gz"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>

            <Separator />

            <div className="text-xs text-muted-foreground">
              対応形式: .backup, .json, .gz
            </div>
          </CardContent>
        </Card>
      </div>

      {/* バックアップ履歴 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            バックアップ履歴
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {backups.map((backup) => (
              <div
                key={backup.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  {getTypeIcon(backup.type)}
                  <div>
                    <div className="text-sm font-medium">{backup.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(backup.createdAt).toLocaleString('ja-JP')} • {backup.size} • v{backup.version}
                    </div>
                    {backup.description && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {backup.description}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {getStatusBadge(backup.status)}
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => restoreFromBackup(backup.id)}
                    disabled={isCreatingBackup || isRestoring || backup.status !== 'completed'}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    復元
                  </Button>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteBackup(backup.id)}
                    disabled={isCreatingBackup || isRestoring}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}