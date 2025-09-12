'use client';

import { createContext, useContext, ReactNode } from 'react';
import { SessionProvider, useSession } from 'next-auth/react';

// =============================================================================
// AuthProvider - NextAuth.jsベースの認証プロバイダー
// セッション管理とユーザー認証を提供
// =============================================================================

/**
 * 認証コンテキストの型定義
 */
interface AuthContextType {
  // セッション情報
  isAuthenticated: boolean;
  isLoading: boolean;
  user: {
    id: string;
    email: string;
    name?: string;
    role: string;
    permissions: string[];
  } | null;

  // セッション管理
  refreshSession: () => Promise<void>;

  // ユーザー操作
  hasPermission: (permission: string) => boolean;
  hasRole: (role: string) => boolean;
  isAdmin: boolean;
}

/**
 * 認証コンテキスト
 */
const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * 内部認証プロバイダー（NextAuth.jsセッション連携版）
 */
function InternalAuthProvider({ children }: { children: ReactNode }) {
  const { data: session, status, update } = useSession();

  console.log('[AUTH_PROVIDER] Session status:', status);
  console.log('[AUTH_PROVIDER] Session data:', session);
  console.log('[AUTH_PROVIDER] Window location:', typeof window !== 'undefined' ? window.location.href : 'server');

  // セッション情報をもとにユーザーオブジェクトを構築
  const user = session?.user ? {
    id: session.user.id,
    email: session.user.email,
    name: session.user.email, // セッションにnameがない場合はemailを使用
    role: session.user.role,
    permissions: session.user.permissions,
  } : null;

  const contextValue: AuthContextType = {
    isAuthenticated: !!session && status === 'authenticated',
    isLoading: status === 'loading',
    user,
    refreshSession: async () => {
      await update();
    },
    hasPermission: (permission: string) => {
      if (!user?.permissions) return false;
      return user.permissions.includes(permission) || user.permissions.includes('*');
    },
    hasRole: (role: string) => {
      return user?.role === role;
    },
    isAdmin: user?.role === 'admin',
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * 外部向けAuthProvider（NextAuth.jsのSessionProviderでラップ）
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <InternalAuthProvider>{children}</InternalAuthProvider>
    </SessionProvider>
  );
}

/**
 * 認証コンテキストフック
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

/**
 * 認証状態フック（後方互換性のため）
 */
export function useAuthStatus() {
  const { isAuthenticated, isLoading, user } = useAuth();
  return { isAuthenticated, isLoading, user };
}

/**
 * 権限管理フック（後方互換性のため）
 */
export function usePermissions() {
  const { hasPermission, hasRole, isAdmin, user, isLoading } = useAuth();
  return { hasPermission, hasRole, isAdmin, user, isLoading };
}

/**
 * 管理者チェックフック（後方互換性のため）
 */
export function useRequireAdmin() {
  const { isAdmin } = useAuth();
  return { isAdmin };
}

/**
 * 認証必須フック（後方互換性のため）
 */
export function useRequireAuth() {
  const { isAuthenticated, user } = useAuth();
  return { isAuthenticated, user };
}
