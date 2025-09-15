'use client';

import { Suspense } from 'react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { PasskeyManager } from '@/components/passkey/passkey-manager';
import { ShieldCheckIcon, KeyIcon, LockClosedIcon } from '@heroicons/react/24/outline';

// =============================================================================
// Security Settings Page
// セキュリティ設定ページ
// =============================================================================

function SecuritySettingsContent() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="bg-white shadow rounded-lg mb-6">
          <div className="px-4 py-5 sm:p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <ShieldCheckIcon className="h-8 w-8 text-green-600" />
              </div>
              <div className="ml-4">
                <h1 className="text-2xl font-bold text-gray-900">
                  セキュリティ設定
                </h1>
                <p className="text-sm text-gray-600">
                  アカウントのセキュリティを管理し、認証方法を設定します
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Passkey Management Section */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <PasskeyManager />
            </div>
          </div>

          {/* Additional Security Settings */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <div className="flex items-center mb-4">
                <LockClosedIcon className="h-6 w-6 text-gray-600" />
                <h3 className="ml-3 text-lg font-medium text-gray-900">
                  その他のセキュリティ設定
                </h3>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">
                      セッションタイムアウト
                    </h4>
                    <p className="text-sm text-gray-500">
                      非アクティブ時間後に自動ログアウト
                    </p>
                  </div>
                  <div className="text-sm text-gray-600">
                    30分
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">
                      Bitwarden統合
                    </h4>
                    <p className="text-sm text-gray-500">
                      Bitwardenアカウントでの認証
                    </p>
                  </div>
                  <div className="text-sm text-green-600">
                    有効
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">
                      監査ログ
                    </h4>
                    <p className="text-sm text-gray-500">
                      認証とアクセスの履歴を記録
                    </p>
                  </div>
                  <div className="text-sm text-green-600">
                    有効
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Security Tips */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <ShieldCheckIcon className="h-5 w-5 text-amber-400" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-amber-800">
                  セキュリティのベストプラクティス
                </h3>
                <div className="mt-2 text-sm text-amber-700">
                  <ul className="list-disc list-inside space-y-1">
                    <li>複数のパスキーを異なるデバイスに登録する</li>
                    <li>定期的に不要なパスキーを削除する</li>
                    <li>共有デバイスでは使用後に必ずサインアウトする</li>
                    <li>不審なアクティビティを発見した場合は管理者に報告する</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SecuritySettingsPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-sm text-gray-600">読み込み中...</p>
          </div>
        </div>
      }>
        <SecuritySettingsContent />
      </Suspense>
    </ProtectedRoute>
  );
}