'use client';

import { ProtectedRoute } from '@/components/auth/protected-route';
import { BackupRestore } from '@/components/backup/BackupRestore';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Archive,
  Shield,
  AlertTriangle,
  CheckCircle,
  Info,
  Clock
} from 'lucide-react';

// =============================================================================
// バックアップ・復元ページ
// システムデータの完全バックアップと復元管理
// =============================================================================

export default function BackupPage() {
  return (
    <ProtectedRoute requiredPermissions={['SETTINGS_MANAGE']}>
      <div className="container mx-auto p-6 space-y-6">
        {/* ヘッダー */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Archive className="h-8 w-8" />
              バックアップ・復元
            </h1>
            <p className="text-muted-foreground">
              システムデータの安全なバックアップと復元管理
            </p>
          </div>
        </div>

        {/* 重要な注意事項 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center space-x-2">
                <Shield className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-lg font-semibold text-green-600">セキュア</p>
                  <p className="text-sm text-muted-foreground">暗号化済み</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-lg font-semibold text-blue-600">自動化</p>
                  <p className="text-sm text-muted-foreground">定期実行</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center space-x-2">
                <Clock className="h-8 w-8 text-purple-500" />
                <div>
                  <p className="text-lg font-semibold text-purple-600">高速</p>
                  <p className="text-sm text-muted-foreground">圧縮対応</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center space-x-2">
                <Info className="h-8 w-8 text-orange-500" />
                <div>
                  <p className="text-lg font-semibold text-orange-600">包括</p>
                  <p className="text-sm text-muted-foreground">全データ対応</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* バックアップ情報カード */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              重要な注意事項
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <h4 className="font-medium">バックアップについて</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• 完全バックアップには全ての設定とデータが含まれます</li>
                  <li>• 定期的なバックアップ作成を強く推奨します</li>
                  <li>• バックアップファイルはAES-256で暗号化されています</li>
                  <li>• 大容量データの場合、作成に時間がかかる場合があります</li>
                </ul>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-medium">復元について</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• 復元により現在のデータが完全に置き換わります</li>
                  <li>• 復元前に最新のバックアップ作成を推奨します</li>
                  <li>• 復元後はシステムの再起動が必要な場合があります</li>
                  <li>• 復元中は他の操作を実行しないでください</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* メインコンポーネント */}
        <BackupRestore />

        {/* バックアップ戦略 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              推奨バックアップ戦略
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <h4 className="font-medium text-green-600">日次バックアップ</h4>
                <p className="text-sm text-muted-foreground">
                  重要な変更がある日は設定バックアップを作成し、データの安全性を確保します。
                </p>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-medium text-blue-600">週次バックアップ</h4>
                <p className="text-sm text-muted-foreground">
                  毎週完全バックアップを作成し、システム全体の状態を保存します。
                </p>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-medium text-purple-600">月次アーカイブ</h4>
                <p className="text-sm text-muted-foreground">
                  月末に長期保存用のアーカイブを作成し、外部ストレージに保存します。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}