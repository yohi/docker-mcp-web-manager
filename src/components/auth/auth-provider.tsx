'use client';

import { createContext, useContext, ReactNode } from 'react';
import { SessionProvider } from 'next-auth/react';

// =============================================================================
// AuthProvider - モック認証プロバイダー（開発用）
// 一時的に認証を無効化して、すべてのユーザーを管理者として扱う
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
 * 内部認証プロバイダー（モック版）
 */
function InternalAuthProvider({ children }: { children: ReactNode }) {
  // モックユーザー
  const mockUser = {
    id: 'mock-admin-id',
    email: 'admin@example.com',
    name: 'Administrator',
    role: 'admin',
    permissions: ['*'], // 全権限
  };

  const contextValue: AuthContextType = {
    isAuthenticated: true,
    isLoading: false,
    user: mockUser,
    refreshSession: async () => { },
    hasPermission: () => true, // 全ての権限を許可
    hasRole: () => true, // 全てのロールを許可
    isAdmin: true,
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
