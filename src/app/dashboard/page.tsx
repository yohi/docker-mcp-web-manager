/**
 * ダッシュボードページ
 * 
 * 機能要件：
 * - 認証が必要なページ
 * - サーバー管理機能へのアクセス
 * - リアルタイム状態監視
 * - 統計情報の表示
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import DashboardPage from '@/components/dashboard/DashboardPage';

/**
 * ローディングコンポーネント
 */
function DashboardLoading() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダースケルトン */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-4">
              <div className="h-8 w-64 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-4 w-32 bg-gray-200 rounded animate-pulse"></div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="h-10 w-32 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-10 w-24 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-10 w-20 bg-gray-200 rounded animate-pulse"></div>
            </div>
          </div>
        </div>
      </div>

      {/* コンテンツスケルトン */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 統計カードスケルトン */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white shadow rounded-lg p-5">
              <div className="flex items-center">
                <div className="h-12 w-12 bg-gray-200 rounded-md animate-pulse"></div>
                <div className="ml-5 flex-1">
                  <div className="h-4 w-20 bg-gray-200 rounded animate-pulse mb-2"></div>
                  <div className="h-6 w-12 bg-gray-200 rounded animate-pulse"></div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* サーバーリストスケルトン */}
        <div className="bg-white shadow rounded-lg p-6">
          <div className="h-6 w-32 bg-gray-200 rounded animate-pulse mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="h-5 w-24 bg-gray-200 rounded animate-pulse"></div>
                  <div className="h-4 w-16 bg-gray-200 rounded animate-pulse"></div>
                </div>
                <div className="h-4 w-full bg-gray-200 rounded animate-pulse mb-2"></div>
                <div className="h-4 w-3/4 bg-gray-200 rounded animate-pulse mb-4"></div>
                <div className="flex space-x-2">
                  <div className="h-8 w-16 bg-gray-200 rounded animate-pulse"></div>
                  <div className="h-8 w-16 bg-gray-200 rounded animate-pulse"></div>
                  <div className="h-8 w-16 bg-gray-200 rounded animate-pulse"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * ダッシュボードページコンポーネント
 */
export default async function Dashboard() {
  // セッション確認（サーバーサイド）
  const session = await getServerSession(authOptions);
  
  // 未ログインの場合はログインページにリダイレクト
  if (!session) {
    redirect('/login?callbackUrl=/dashboard');
  }

  // セッションはあるがユーザー情報がない場合
  if (!session.user) {
    redirect('/login?error=SessionRequired');
  }

  return (
    <ProtectedRoute 
      requireAuth={true}
      redirectTo="/login?callbackUrl=/dashboard"
      fallback={<DashboardLoading />}
    >
      <Suspense fallback={<DashboardLoading />}>
        <DashboardPage />
      </Suspense>
    </ProtectedRoute>
  );
}

/**
 * メタデータ
 */
export const metadata = {
  title: 'ダッシュボード - Docker MCP Web Manager',
  description: 'Docker コンテナサーバーの統合管理ダッシュボード',
};