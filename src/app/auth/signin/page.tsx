'use client';

import { useState, useEffect, Suspense } from 'react';
import { signIn, getSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { EyeIcon, EyeSlashIcon, LockClosedIcon, KeyIcon } from '@heroicons/react/24/outline';
import { ButtonLoading } from '@/components/common/LoadingSpinner';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';

// =============================================================================
// サインインページ
// NextAuth.js統合によるセキュアな認証
// =============================================================================

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMethod, setAuthMethod] = useState<'local' | 'bitwarden' | 'passkey'>('local');
  const [totpCode, setTotpCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);
  const [error, setError] = useState('');
  const [passkeySupported, setPasskeySupported] = useState(false);
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';

  // 既にログイン済みの場合はリダイレクト & パスキーサポート確認
  useEffect(() => {
    getSession().then((session) => {
      if (session) {
        router.push(callbackUrl);
      }
    });

    // パスキーサポートの確認
    if (window.PublicKeyCredential && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        .then((available) => setPasskeySupported(available))
        .catch(() => setPasskeySupported(false));
    }
  }, [router, callbackUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (authMethod === 'passkey') {
      await handlePasskeyAuth();
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const providerId = authMethod === 'bitwarden' ? 'bitwarden' : 'custom-auth';
      const credentials = authMethod === 'bitwarden'
        ? { email, password, totpCode: totpCode || undefined }
        : { email, password, authMethod: 'local' };

      const result = await signIn(providerId, {
        ...credentials,
        redirect: false,
        callbackUrl,
      });

      if (result?.error) {
        setError('メールアドレスまたはパスワードが正しくありません');
      } else if (result?.ok) {
        router.push(callbackUrl);
      }
    } catch (error) {
      setError('サインイン処理中にエラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasskeyAuth = async () => {
    setIsPasskeyLoading(true);
    setError('');

    try {
      // 認証オプションを取得
      const optionsResponse = await fetch('/api/auth/passkey/authenticate/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email || undefined }),
      });

      if (!optionsResponse.ok) {
        throw new Error('認証オプションの取得に失敗しました');
      }

      const { data: authOptions } = await optionsResponse.json();

      // WebAuthn認証を実行
      const authResponse = await startAuthentication(authOptions.options);

      // 認証結果を検証
      const verifyResponse = await fetch('/api/auth/passkey/authenticate/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credential: authResponse,
          challengeId: authOptions.challenge,
        }),
      });

      if (!verifyResponse.ok) {
        throw new Error('パスキー認証に失敗しました');
      }

      const { data: verifyResult } = await verifyResponse.json();

      // NextAuth.jsでサインイン
      const result = await signIn('passkey', {
        token: verifyResult.token,
        redirect: false,
        callbackUrl,
      });

      if (result?.error) {
        setError('サインインに失敗しました');
      } else if (result?.ok) {
        router.push(callbackUrl);
      }
    } catch (error) {
      console.error('Passkey authentication error:', error);
      setError(error instanceof Error ? error.message : 'パスキー認証中にエラーが発生しました');
    } finally {
      setIsPasskeyLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="mx-auto h-12 w-12 flex items-center justify-center bg-blue-100 rounded-lg">
            <LockClosedIcon className="h-6 w-6 text-blue-600" />
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Docker MCP Manager
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            アカウントにサインインしてください
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <input type="hidden" name="remember" defaultValue="true" />

          <div className="space-y-4">
            <div>
              <label htmlFor="authMethod" className="block text-sm font-medium text-gray-700">
                認証方法
              </label>
              <select
                id="authMethod"
                name="authMethod"
                value={authMethod}
                onChange={(e) => setAuthMethod(e.target.value as 'local' | 'bitwarden' | 'passkey')}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                disabled={isLoading || isPasskeyLoading}
              >
                <option value="local">ローカル認証</option>
                <option value="bitwarden">Bitwarden認証</option>
                {passkeySupported && <option value="passkey">パスキー認証</option>}
              </select>
            </div>
            {authMethod !== 'passkey' && (
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  メールアドレス
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                  placeholder="example@company.com"
                  disabled={isLoading || isPasskeyLoading}
                />
              </div>
            )}

            {authMethod === 'passkey' && (
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  メールアドレス（オプション）
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                  placeholder="特定のユーザーでサインインする場合のみ入力"
                  disabled={isLoading || isPasskeyLoading}
                />
                <p className="mt-1 text-sm text-gray-500">
                  メールアドレスを空にすると、利用可能なすべてのパスキーが表示されます
                </p>
              </div>
            )}

            {authMethod !== 'passkey' && (
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  パスワード
                </label>
                <div className="mt-1 relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="appearance-none relative block w-full px-3 py-2 pr-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                    placeholder="パスワードを入力"
                    disabled={isLoading || isPasskeyLoading}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isLoading || isPasskeyLoading}
                  >
                    {showPassword ? (
                      <EyeSlashIcon className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                    ) : (
                      <EyeIcon className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {authMethod === 'bitwarden' && (
              <div>
                <label htmlFor="totpCode" className="block text-sm font-medium text-gray-700">
                  2要素認証コード（オプション）
                </label>
                <input
                  id="totpCode"
                  name="totpCode"
                  type="text"
                  autoComplete="one-time-code"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                  placeholder="123456"
                  disabled={isLoading || isPasskeyLoading}
                />
              </div>
            )}

            {authMethod === 'passkey' && (
              <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <KeyIcon className="h-5 w-5 text-blue-400" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-blue-800">
                      パスキー認証について
                    </h3>
                    <div className="mt-2 text-sm text-blue-700">
                      <p>
                        パスキーを使用してサインインします。生体認証（指紋、顔認証）や
                        セキュリティキーを使用してセキュアに認証できます。
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">
                    サインインエラー
                  </h3>
                  <div className="mt-2 text-sm text-red-700">
                    {error}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={
                (isLoading || isPasskeyLoading) ||
                (authMethod !== 'passkey' && (!email || !password))
              }
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
            >
              {(isLoading || isPasskeyLoading) ? (
                <>
                  <ButtonLoading />
                  {authMethod === 'passkey' ? 'パスキー認証中...' : 'サインイン中...'}
                </>
              ) : (
                <>
                  <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                    {authMethod === 'passkey' ? (
                      <KeyIcon
                        className="h-5 w-5 text-blue-500 group-hover:text-blue-400"
                        aria-hidden="true"
                      />
                    ) : (
                      <LockClosedIcon
                        className="h-5 w-5 text-blue-500 group-hover:text-blue-400"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  {authMethod === 'passkey' ? 'パスキーでサインイン' : 'サインイン'}
                </>
              )}
            </button>
          </div>

          <div className="text-center">
            <div className="text-sm text-gray-600">
              <p>テスト用アカウント:</p>
              <p className="font-mono text-xs mt-1">
                admin@example.com / admin123
              </p>
            </div>
          </div>
        </form>

        {/* Security notice */}
        <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                セキュリティについて
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>
                  このシステムでは機密性の高いDocker環境を管理します。
                  強力なパスワードを使用し、不審なアクティビティを発見した場合は
                  すぐに管理者に報告してください。
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-sm text-gray-600">読み込み中...</p>
        </div>
      </div>
    }>
      <SignInForm />
    </Suspense>
  );
}
