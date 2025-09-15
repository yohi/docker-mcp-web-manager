'use client';

import { useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { KeyIcon, PlusIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { ButtonLoading } from '@/components/common/LoadingSpinner';

// =============================================================================
// Passkey Registration Component
// パスキー登録コンポーネント
// =============================================================================

interface PasskeyRegistrationProps {
  userEmail: string;
  onRegistrationSuccess?: (passkey: any) => void;
  onRegistrationError?: (error: string) => void;
}

export function PasskeyRegistration({
  userEmail,
  onRegistrationSuccess,
  onRegistrationError,
}: PasskeyRegistrationProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [passkeyName, setPasskeyName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleRegisterPasskey = async () => {
    if (!passkeyName.trim()) {
      setError('パスキーの名前を入力してください');
      return;
    }

    setIsRegistering(true);
    setError('');
    setSuccess('');

    try {
      // 登録オプションを取得
      const optionsResponse = await fetch('/api/auth/passkey/register/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail,
          username: userEmail.split('@')[0], // メールアドレスからユーザー名を生成
        }),
      });

      if (!optionsResponse.ok) {
        throw new Error('登録オプションの取得に失敗しました');
      }

      const { data: registrationOptions } = await optionsResponse.json();

      // WebAuthn登録を実行
      const registrationResponse = await startRegistration(registrationOptions.options);

      // 登録結果を検証
      const verifyResponse = await fetch('/api/auth/passkey/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: registrationOptions.options.user.id,
          credential: registrationResponse,
          challengeId: registrationOptions.challenge,
          name: passkeyName.trim(),
        }),
      });

      if (!verifyResponse.ok) {
        const errorData = await verifyResponse.json();
        throw new Error(errorData.error?.message || 'パスキー登録の検証に失敗しました');
      }

      const { data: verifyResult } = await verifyResponse.json();

      setSuccess('パスキーが正常に登録されました');
      setPasskeyName('');

      if (onRegistrationSuccess) {
        onRegistrationSuccess(verifyResult.passkey);
      }

    } catch (error) {
      console.error('Passkey registration error:', error);
      const errorMessage = error instanceof Error ? error.message : 'パスキー登録中にエラーが発生しました';
      setError(errorMessage);

      if (onRegistrationError) {
        onRegistrationError(errorMessage);
      }
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center mb-4">
        <div className="flex-shrink-0">
          <KeyIcon className="h-6 w-6 text-blue-600" />
        </div>
        <div className="ml-3">
          <h3 className="text-lg font-medium text-gray-900">
            新しいパスキーを登録
          </h3>
          <p className="text-sm text-gray-500">
            生体認証やセキュリティキーを使用してセキュアにサインインできます
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="passkeyName" className="block text-sm font-medium text-gray-700">
            パスキーの名前
          </label>
          <input
            type="text"
            id="passkeyName"
            value={passkeyName}
            onChange={(e) => setPasskeyName(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            placeholder="例: MacBook Pro Touch ID, iPhone, Windows Hello"
            disabled={isRegistering}
          />
          <p className="mt-1 text-sm text-gray-500">
            デバイスや認証方法がわかりやすい名前を付けてください
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  登録エラー
                </h3>
                <div className="mt-2 text-sm text-red-700">
                  {error}
                </div>
              </div>
            </div>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-green-800">
                  登録成功
                </h3>
                <div className="mt-2 text-sm text-green-700">
                  {success}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">
                パスキーについて
              </h3>
              <div className="mt-2 text-sm text-blue-700">
                <ul className="list-disc list-inside space-y-1">
                  <li>パスキーは生体認証（指紋、顔認証）やPINで保護されます</li>
                  <li>デバイスに安全に保存され、サーバーに秘密情報は送信されません</li>
                  <li>複数のデバイスでパスキーを登録できます</li>
                  <li>パスワードより安全で、フィッシング攻撃を防ぎます</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRegisterPasskey}
          disabled={isRegistering || !passkeyName.trim()}
          className="w-full flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
        >
          {isRegistering ? (
            <>
              <ButtonLoading />
              <span className="ml-2">パスキーを登録中...</span>
            </>
          ) : (
            <>
              <PlusIcon className="h-4 w-4 mr-2" />
              パスキーを登録
            </>
          )}
        </button>
      </div>
    </div>
  );
}