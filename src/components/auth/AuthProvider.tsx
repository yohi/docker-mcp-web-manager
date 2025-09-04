/**
 * 認証プロバイダーコンポーネント
 * 
 * 機能要件：
 * - グローバル認証状態管理
 * - セッション情報の提供
 * - 認証状態の変更通知
 * - セッション更新とリフレッシュ
 * - エラー処理とログアウト機能
 */

'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { Session } from 'next-auth';
import { useSession, signOut } from 'next-auth/react';

/**
 * ユーザーロール
 */
export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  VIEWER = 'viewer',
}

/**
 * 拡張ユーザー情報
 */
export interface ExtendedUser {
  id: string;
  email: string;
  name?: string;
  image?: string;
  role: UserRole;
  permissions: string[];
  lastLoginAt?: string;
  createdAt: string;
  isActive: boolean;
}

/**
 * 認証状態
 */
export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: ExtendedUser | null;
  session: Session | null;
  error: string | null;
}

/**
 * 認証コンテキスト
 */
export interface AuthContextType extends AuthState {
  // アクション
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: UserRole) => boolean;
  isAdmin: boolean;
  
  // 状態管理
  clearError: () => void;
}

/**
 * 認証コンテキスト
 */
const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * 認証プロバイダーのプロパティ
 */
interface AuthProviderProps {
  children: ReactNode;
}

/**
 * セッションからユーザー情報を抽出
 */
function extractUserFromSession(session: Session | null): ExtendedUser | null {
  if (!session?.user) {
    return null;
  }

  // NextAuthのセッションから拡張ユーザー情報を構築
  const user = session.user as any;
  
  return {
    id: user.id || user.sub || '',
    email: user.email || '',
    name: user.name || undefined,
    image: user.image || undefined,
    role: user.role || UserRole.USER,
    permissions: user.permissions || [],
    lastLoginAt: user.lastLoginAt || undefined,
    createdAt: user.createdAt || new Date().toISOString(),
    isActive: user.isActive !== false,
  };
}

/**
 * 認証プロバイダーコンポーネント
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const { data: session, status, update } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<ExtendedUser | null>(null);

  // セッション状態の計算
  const isLoading = status === 'loading';
  const isAuthenticated = status === 'authenticated' && !!session && !!user?.isActive;

  // ユーザー情報の更新
  useEffect(() => {
    const extractedUser = extractUserFromSession(session);
    setUser(extractedUser);
    
    // セッションエラーの処理
    if (session && !extractedUser) {
      setError('セッション情報の取得に失敗しました');
    } else if (extractedUser && !extractedUser.isActive) {
      setError('アカウントが無効化されています。管理者に連絡してください。');
    } else {
      setError(null);
    }
  }, [session]);

  /**
   * セッション更新
   */
  const refreshSession = useCallback(async () => {
    try {
      setError(null);
      await update();
    } catch (error) {
      console.error('Session refresh failed:', error);
      setError('セッションの更新に失敗しました');
    }
  }, [update]);

  /**
   * ログアウト
   */
  const logout = useCallback(async () => {
    try {
      setError(null);
      await signOut({ 
        redirect: true,
        callbackUrl: '/login'
      });
    } catch (error) {
      console.error('Logout failed:', error);
      setError('ログアウトに失敗しました');
    }
  }, []);

  /**
   * 権限チェック
   */
  const hasPermission = useCallback((permission: string): boolean => {
    if (!user || !user.isActive) {
      return false;
    }
    
    // 管理者は全ての権限を持つ
    if (user.role === UserRole.ADMIN) {
      return true;
    }
    
    return user.permissions.includes(permission);
  }, [user]);

  /**
   * ロールチェック
   */
  const hasRole = useCallback((role: UserRole): boolean => {
    if (!user || !user.isActive) {
      return false;
    }
    
    // 管理者は全てのロールを包含
    if (user.role === UserRole.ADMIN) {
      return true;
    }
    
    return user.role === role;
  }, [user]);

  /**
   * 管理者権限チェック
   */
  const isAdmin = user?.role === UserRole.ADMIN && user?.isActive;

  /**
   * エラークリア
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // コンテキスト値
  const contextValue: AuthContextType = {
    // 状態
    isAuthenticated,
    isLoading,
    user,
    session,
    error,
    
    // アクション
    refreshSession,
    logout,
    hasPermission,
    hasRole,
    isAdmin,
    clearError,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
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
 * 認証必須フック（認証されていない場合はエラー）
 */
export function useRequireAuth(): AuthContextType {
  const auth = useAuth();
  
  if (!auth.isAuthenticated && !auth.isLoading) {
    throw new Error('Authentication required');
  }
  
  return auth;
}

/**
 * 管理者権限必須フック
 */
export function useRequireAdmin(): AuthContextType {
  const auth = useRequireAuth();
  
  if (!auth.isAdmin) {
    throw new Error('Admin privileges required');
  }
  
  return auth;
}

/**
 * 権限チェックフック
 */
export function usePermission(permission: string): boolean {
  const auth = useAuth();
  return auth.hasPermission(permission);
}

/**
 * ロールチェックフック
 */
export function useRole(role: UserRole): boolean {
  const auth = useAuth();
  return auth.hasRole(role);
}