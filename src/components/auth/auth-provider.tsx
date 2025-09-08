'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useSession, SessionProvider } from 'next-auth/react';
import { useRouter } from 'next/navigation';

// =============================================================================
// AuthProvider - グローバル認証状態管理プロバイダー
// NextAuth.js のセッション状態を管理し、アプリケーション全体で認証情報を提供
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
 * 内部認証プロバイダー（NextAuth.jsセッションを使用）
 */
function InternalAuthProvider({ children }: { children: ReactNode }) {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);

  // セッション状態の変更を監視
  useEffect(() => {
    setIsLoading(status === 'loading');
  }, [status]);

  // セッション情報からユーザー情報を構築
  const user = session?.user ? {
    id: session.user.id || '',
    email: session.user.email || '',
    name: session.user.name || undefined,
    role: session.user.role || 'viewer',
    permissions: session.user.permissions || [],
  } : null;

  // 認証状態の判定
  const isAuthenticated = status === 'authenticated' && !!user;

  // セッションの更新
  const refreshSession = async () => {
    try {
      await update();
      router.refresh();
    } catch (error) {
      console.error('[AUTH_PROVIDER] Failed to refresh session:', error);
    }
  };

  // 権限チェック
  const hasPermission = (permission: string): boolean => {
    if (!user || !user.permissions) return false;
    
    // 管理者は全権限を持つ
    if (user.permissions.includes('*') || user.role === 'admin') {
      return true;
    }
    
    return user.permissions.includes(permission);
  };

  // ロールチェック
  const hasRole = (role: string): boolean => {
    if (!user) return false;
    return user.role === role;
  };

  // 管理者チェック
  const isAdmin = hasRole('admin') || hasPermission('*');

  const contextValue: AuthContextType = {
    isAuthenticated,
    isLoading,
    user,
    refreshSession,
    hasPermission,
    hasRole,
    isAdmin,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * 認証プロバイダーコンポーネント
 * NextAuth.js の SessionProvider でラップした認証コンテキストを提供
 */
interface AuthProviderProps {
  children: ReactNode;
  session?: any;
}

export function AuthProvider({ children, session }: AuthProviderProps) {
  return (
    <SessionProvider session={session} refetchInterval={5 * 60} refetchOnWindowFocus={true}>
      <InternalAuthProvider>
        {children}
      </InternalAuthProvider>
    </SessionProvider>
  );
}

/**
 * 認証コンテキストを使用するためのカスタムフック
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
}

/**
 * 権限チェック用のカスタムフック
 */
export function usePermissions() {
  const { hasPermission, hasRole, isAdmin, user } = useAuth();
  
  return {
    hasPermission,
    hasRole,
    isAdmin,
    permissions: user?.permissions || [],
    role: user?.role || null,
  };
}

/**
 * 認証状態チェック用のカスタムフック
 */
export function useAuthStatus() {
  const { isAuthenticated, isLoading, user } = useAuth();
  
  return {
    isAuthenticated,
    isLoading,
    user,
    isReady: !isLoading,
  };
}