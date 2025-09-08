'use client';

import { useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStatus, usePermissions } from './auth-provider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Lock, AlertTriangle } from 'lucide-react';

// =============================================================================
// ProtectedRoute - 認証・認可保護されたルートラッパー
// 認証状態と権限をチェックし、適切なアクセス制御を提供
// =============================================================================

interface ProtectedRouteProps {
  children: ReactNode;
  requiredPermissions?: string[];
  requiredRole?: string;
  fallbackUrl?: string;
  showLoadingSpinner?: boolean;
  allowedRoles?: string[];
}

/**
 * 保護されたルートコンポーネント
 * 認証と権限チェックを行い、適切でない場合はアクセス拒否またはリダイレクトを行う
 */
export function ProtectedRoute({
  children,
  requiredPermissions = [],
  requiredRole,
  fallbackUrl = '/auth/signin',
  showLoadingSpinner = true,
  allowedRoles = [],
}: ProtectedRouteProps) {
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuthStatus();
  const { hasPermission, hasRole, isAdmin } = usePermissions();

  // 認証状態の変化を監視してリダイレクト
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      console.log('[PROTECTED_ROUTE] User not authenticated, redirecting to:', fallbackUrl);
      router.push(fallbackUrl);
    }
  }, [isAuthenticated, isLoading, router, fallbackUrl]);

  // ローディング中の表示
  if (isLoading) {
    if (!showLoadingSpinner) {
      return null;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center p-8 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-gray-600" />
            <p className="text-sm text-gray-600">認証状態を確認中...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 未認証の場合は何も表示しない（useEffectでリダイレクト処理）
  if (!isAuthenticated) {
    return null;
  }

  // 権限チェック
  const hasRequiredPermissions = requiredPermissions.length === 0 || 
    requiredPermissions.every(permission => hasPermission(permission));

  const hasRequiredRole = !requiredRole || hasRole(requiredRole);

  const hasAllowedRole = allowedRoles.length === 0 || 
    allowedRoles.some(role => hasRole(role));

  // 管理者は常にアクセス許可（特定のロール制限がある場合を除く）
  const hasAdminAccess = isAdmin && allowedRoles.length === 0;

  // アクセス許可の判定
  const hasAccess = hasAdminAccess || 
    (hasRequiredPermissions && hasRequiredRole && hasAllowedRole);

  // アクセス拒否の場合
  if (!hasAccess) {
    const missingPermissions = requiredPermissions.filter(permission => !hasPermission(permission));
    const currentRole = user?.role || 'unknown';

    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Card className="w-full max-w-lg">
          <CardContent className="p-8">
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                  <Lock className="h-6 w-6 text-red-600" />
                </div>
              </div>
              
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  アクセスが拒否されました
                </h2>
                <p className="mt-2 text-sm text-gray-600">
                  このページにアクセスする権限がありません。
                </p>
              </div>

              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2 text-left">
                    <p>
                      <strong>現在のロール:</strong> {currentRole}
                    </p>
                    
                    {requiredRole && !hasRequiredRole && (
                      <p>
                        <strong>必要なロール:</strong> {requiredRole}
                      </p>
                    )}
                    
                    {allowedRoles.length > 0 && !hasAllowedRole && (
                      <p>
                        <strong>許可されたロール:</strong> {allowedRoles.join(', ')}
                      </p>
                    )}
                    
                    {missingPermissions.length > 0 && (
                      <div>
                        <p><strong>不足している権限:</strong></p>
                        <ul className="mt-1 list-disc list-inside text-xs space-y-1">
                          {missingPermissions.map(permission => (
                            <li key={permission}>{permission}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>

              <div className="text-sm text-gray-500">
                適切な権限が必要な場合は、管理者にお問い合わせください。
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // アクセス許可の場合、子コンポーネントをレンダリング
  return <>{children}</>;
}

/**
 * 権限ベースの条件レンダリング用コンポーネント
 */
interface ConditionalRenderProps {
  children: ReactNode;
  requiredPermissions?: string[];
  requiredRole?: string;
  allowedRoles?: string[];
  fallback?: ReactNode;
}

export function ConditionalRender({
  children,
  requiredPermissions = [],
  requiredRole,
  allowedRoles = [],
  fallback = null,
}: ConditionalRenderProps) {
  const { hasPermission, hasRole, isAdmin } = usePermissions();

  const hasRequiredPermissions = requiredPermissions.length === 0 || 
    requiredPermissions.every(permission => hasPermission(permission));

  const hasRequiredRole = !requiredRole || hasRole(requiredRole);

  const hasAllowedRole = allowedRoles.length === 0 || 
    allowedRoles.some(role => hasRole(role));

  const hasAdminAccess = isAdmin && allowedRoles.length === 0;

  const hasAccess = hasAdminAccess || 
    (hasRequiredPermissions && hasRequiredRole && hasAllowedRole);

  return hasAccess ? <>{children}</> : <>{fallback}</>;
}

/**
 * 認証が必要なページ用のHOC
 */
export function withAuth<P extends object>(
  Component: React.ComponentType<P>,
  options: Omit<ProtectedRouteProps, 'children'> = {}
) {
  const AuthenticatedComponent = (props: P) => {
    return (
      <ProtectedRoute {...options}>
        <Component {...props} />
      </ProtectedRoute>
    );
  };

  AuthenticatedComponent.displayName = `withAuth(${Component.displayName || Component.name})`;
  return AuthenticatedComponent;
}