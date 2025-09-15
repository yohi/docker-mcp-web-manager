'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { PasskeyRegistration } from './passkey-registration';
import { PasskeyList } from './passkey-list';
import { KeyIcon } from '@heroicons/react/24/outline';

// =============================================================================
// Passkey Manager Component
// パスキー管理統合コンポーネント
// =============================================================================

export function PasskeyManager() {
  const { data: session } = useSession();
  const [refreshKey, setRefreshKey] = useState(0);

  if (!session?.user?.email) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="text-center">
          <KeyIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            認証が必要です
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            パスキーを管理するにはサインインしてください
          </p>
        </div>
      </div>
    );
  }

  const handleRegistrationSuccess = () => {
    // パスキー一覧を更新
    setRefreshKey(prev => prev + 1);
  };

  const handlePasskeyDeleted = () => {
    // 必要に応じて追加の処理
  };

  const handlePasskeyRenamed = () => {
    // 必要に応じて追加の処理
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <KeyIcon className="h-8 w-8 text-blue-600" />
          </div>
          <div className="ml-4">
            <h2 className="text-xl font-semibold text-gray-900">
              パスキー管理
            </h2>
            <p className="text-sm text-gray-600">
              セキュアな認証方法としてパスキーを管理できます
            </p>
          </div>
        </div>
      </div>

      {/* Passkey Registration */}
      <PasskeyRegistration
        userEmail={session.user.email}
        onRegistrationSuccess={handleRegistrationSuccess}
      />

      {/* Passkey List */}
      <div key={refreshKey}>
        <PasskeyList
          onPasskeyDeleted={handlePasskeyDeleted}
          onPasskeyRenamed={handlePasskeyRenamed}
        />
      </div>

      {/* Security Information */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-medium text-blue-900 mb-4">
          パスキーのセキュリティについて
        </h3>
        <div className="space-y-3 text-sm text-blue-800">
          <div className="flex items-start">
            <div className="flex-shrink-0 mt-0.5">
              <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
            </div>
            <div className="ml-3">
              <strong>フィッシング耐性:</strong> パスキーは偽サイトでは機能せず、フィッシング攻撃を防ぎます
            </div>
          </div>
          <div className="flex items-start">
            <div className="flex-shrink-0 mt-0.5">
              <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
            </div>
            <div className="ml-3">
              <strong>デバイス保護:</strong> パスキーはデバイスのセキュアエレメントに保存され、抽出できません
            </div>
          </div>
          <div className="flex items-start">
            <div className="flex-shrink-0 mt-0.5">
              <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
            </div>
            <div className="ml-3">
              <strong>生体認証:</strong> 指紋、顔認証、またはPINで保護され、なりすましを防ぎます
            </div>
          </div>
          <div className="flex items-start">
            <div className="flex-shrink-0 mt-0.5">
              <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
            </div>
            <div className="ml-3">
              <strong>複数デバイス:</strong> 複数のデバイスでパスキーを登録して利便性を向上できます
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}