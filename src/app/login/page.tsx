/**
 * ログインページ
 * 
 * 機能要件：
 * - ログインフォームの表示
 * - 認証状態のリダイレクト処理
 * - エラーメッセージの表示
 * - NextAuth統合
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import LoginForm from '@/components/auth/LoginForm';
import { authOptions } from '@/lib/auth/config';

/**
 * ページコンポーネントのプロパティ
 */
interface LoginPageProps {
  searchParams?: {
    callbackUrl?: string;
    error?: string;
  };
}

/**
 * ローディングコンポーネント
 */
function LoginPageLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-sm text-gray-600">読み込み中...</p>
      </div>
    </div>
  );
}

/**
 * ログインページコンポーネント
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  // セッション確認
  const session = await getServerSession(authOptions);
  
  // 既にログイン済みの場合はダッシュボードにリダイレクト
  if (session) {
    const callbackUrl = searchParams?.callbackUrl || '/dashboard';
    redirect(callbackUrl);
  }

  // エラーメッセージのマッピング
  const getErrorMessage = (error?: string) => {
    switch (error) {
      case 'CredentialsSignin':
        return 'メールアドレスまたはパスワードが間違っています';
      case 'AccountNotLinked':
        return 'このアカウントは別の認証方法でリンクされています';
      case 'AccessDenied':
        return 'アクセスが拒否されました';
      case 'Verification':
        return 'メールアドレスの確認が必要です';
      case 'OAuthSignin':
        return 'OAuth認証でエラーが発生しました';
      case 'OAuthCallback':
        return 'OAuth認証のコールバックでエラーが発生しました';
      case 'OAuthCreateAccount':
        return 'OAuth認証でアカウント作成に失敗しました';
      case 'EmailCreateAccount':
        return 'メール認証でアカウント作成に失敗しました';
      case 'Callback':
        return 'コールバック処理でエラーが発生しました';
      case 'OAuthAccountNotLinked':
        return 'OAuthアカウントがリンクされていません';
      case 'EmailSignin':
        return 'メール認証でエラーが発生しました';
      case 'CredentialsCallback':
        return '認証情報の検証でエラーが発生しました';
      case 'SessionRequired':
        return 'ログインが必要です';
      default:
        return error ? `認証エラー: ${error}` : undefined;
    }
  };

  const errorMessage = getErrorMessage(searchParams?.error);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* ロゴエリア */}
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Docker MCP Web Manager
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Dockerコンテナの統合管理プラットフォーム
          </p>
        </div>
      </div>

      {/* フォームエリア */}
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <Suspense fallback={<LoginPageLoading />}>
          <LoginForm
            callbackUrl={searchParams?.callbackUrl}
            error={errorMessage}
            className="w-full"
          />
        </Suspense>

        {/* フッター */}
        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-50 text-gray-500">サポート情報</span>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="text-center">
              <a
                href="/help"
                className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors"
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                ヘルプ
              </a>
            </div>
            <div className="text-center">
              <a
                href="/status"
                className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors"
              >
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                ステータス
              </a>
            </div>
          </div>
        </div>

        {/* バージョン情報 */}
        <div className="mt-8 text-center">
          <p className="text-xs text-gray-400">
            Version 1.0.0 | © 2024 Docker MCP Web Manager
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * メタデータ
 */
export const metadata = {
  title: 'ログイン - Docker MCP Web Manager',
  description: 'Docker MCP Web Managerにログインしてコンテナを管理',
};