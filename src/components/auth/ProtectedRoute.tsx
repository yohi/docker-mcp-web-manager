/**
 * 保護されたルートコンポーネント
 * 
 * 機能要件：
 * - 認証状態による条件付きレンダリング
 * - 権限・ロールベースのアクセス制御
 * - 適切なリダイレクト処理
 * - ローディング状態の表示
 * - エラー状態の適切な処理
 */

'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, UserRole } from './AuthProvider';

/**
 * 保護されたルートのプロパティ
 */
interface ProtectedRouteProps {
  children: ReactNode;
  requireAuth?: boolean;
  requiredRole?: UserRole;
  requiredPermissions?: string[];
  redirectTo?: string;
  fallback?: ReactNode;
  className?: string;
}

/**
 * アクセス拒否コンポーネント
 */
function AccessDenied({ 
  message = 'このページにアクセスする権限がありません',
  showLoginButton = false,
  onLogin 
}: {
  message?: string;
  showLoginButton?: boolean;
  onLogin?: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 text-red-500">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" 
              />
            </svg>
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            アクセス拒否
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {message}
          </p>
          
          {showLoginButton && (
            <div className="mt-6">
              <button
                onClick={onLogin}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                ログイン
              </button>
            </div>
          )}
          
          <div className="mt-6">
            <button
              onClick={() => window.history.back()}
              className="text-indigo-600 hover:text-indigo-500 text-sm font-medium"
            >
              ← 前のページに戻る
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * ローディングコンポーネント
 */
function LoadingScreen({ message = '読み込み中...' }: { message?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
        <p className="mt-4 text-sm text-gray-600">{message}</p>
      </div>
    </div>
  );
}

/**
 * 保護されたルートコンポーネント
 */
export default function ProtectedRoute({
  children,
  requireAuth = true,
  requiredRole,
  requiredPermissions = [],
  redirectTo,
  fallback,
  className = '',
}: ProtectedRouteProps) {
  const { 
    isAuthenticated, 
    isLoading, 
    user, 
    hasRole, 
    hasPermission,
    error 
  } = useAuth();
  
  const router = useRouter();

  /**
   * リダイレクト処理
   */
  useEffect(() => {
    if (isLoading) return;

    if (requireAuth && !isAuthenticated) {
      const loginUrl = redirectTo || '/login';
      const currentPath = window.location.pathname;
      const redirectUrl = currentPath !== '/' ? `${loginUrl}?callbackUrl=${encodeURIComponent(currentPath)}` : loginUrl;
      
      router.push(redirectUrl);
      return;
    }
  }, [isAuthenticated, isLoading, requireAuth, redirectTo, router]);

  // ローディング中
  if (isLoading) {
    return fallback || <LoadingScreen message="認証情報を確認しています..." />;
  }

  // エラー状態
  if (error) {
    return (
      <AccessDenied 
        message={`認証エラー: ${error}`}
        showLoginButton={!isAuthenticated}
        onLogin={() => router.push('/login')}
      />
    );
  }

  // 認証が必要だが、未認証の場合
  if (requireAuth && !isAuthenticated) {
    return fallback || <LoadingScreen message="ログインページに移動しています..." />;
  }

  // 認証されている場合の権限チェック
  if (isAuthenticated && user) {
    // アカウントが無効の場合
    if (!user.isActive) {
      return (
        <AccessDenied 
          message="アカウントが無効化されています。管理者にお問い合わせください。"
          showLoginButton={false}
        />
      );
    }

    // ロール要件チェック
    if (requiredRole && !hasRole(requiredRole)) {
      let roleMessage = '';
      switch (requiredRole) {
        case UserRole.ADMIN:
          roleMessage = '管理者権限が必要です';
          break;
        case UserRole.USER:
          roleMessage = 'ユーザー権限が必要です';
          break;
        case UserRole.VIEWER:
          roleMessage = '閲覧権限が必要です';
          break;
        default:
          roleMessage = '必要な権限を持っていません';
      }
      
      return (
        <AccessDenied 
          message={roleMessage}
          showLoginButton={false}
        />
      );
    }

    // 権限要件チェック
    if (requiredPermissions.length > 0) {
      const missingPermissions = requiredPermissions.filter(permission => !hasPermission(permission));
      
      if (missingPermissions.length > 0) {
        return (
          <AccessDenied 
            message={`以下の権限が必要です: ${missingPermissions.join(', ')}`}
            showLoginButton={false}
          />
        );
      }
    }
  }

  // すべてのチェックを通過した場合、子コンポーネントをレンダリング
  return (
    <div className={className}>
      {children}
    </div>
  );
}

/**
 * 管理者専用ルートコンポーネント
 */
export function AdminRoute({ children, ...props }: Omit<ProtectedRouteProps, 'requiredRole'>) {
  return (
    <ProtectedRoute 
      {...props}
      requiredRole={UserRole.ADMIN}
    >
      {children}
    </ProtectedRoute>
  );
}

/**
 * ユーザー専用ルートコンポーネント
 */
export function UserRoute({ children, ...props }: Omit<ProtectedRouteProps, 'requiredRole'>) {
  return (
    <ProtectedRoute 
      {...props}
      requiredRole={UserRole.USER}
    >
      {children}
    </ProtectedRoute>
  );
}

/**
 * 権限ベースルートコンポーネント
 */
export function PermissionRoute({ 
  permissions, 
  children, 
  ...props 
}: Omit<ProtectedRouteProps, 'requiredPermissions'> & { permissions: string[] }) {
  return (
    <ProtectedRoute 
      {...props}
      requiredPermissions={permissions}
    >
      {children}
    </ProtectedRoute>
  );
}