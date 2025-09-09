'use client';

import { createContext, useContext, ReactNode } from 'react';

// 元のAuthProviderと同じenumを定義
export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  VIEWER = 'viewer',
}

// 元のAuthProviderと同じインターフェース
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

// モック認証コンテキスト（開発用）
interface MockAuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: ExtendedUser | null;
  session: any;
  error: string | null;
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: UserRole) => boolean;
  isAdmin: boolean;
  clearError: () => void;
}

const MockAuthContext = createContext<MockAuthContextType | undefined>(undefined);

export function MockAuthProvider({ children }: { children: ReactNode }) {
  // モックユーザー（管理者権限）
  const mockUser: ExtendedUser = {
    id: 'mock-admin-id',
    email: 'admin@example.com',
    name: 'Administrator',
    role: UserRole.ADMIN,
    permissions: ['*'], // 全権限
    createdAt: new Date().toISOString(),
    isActive: true,
  };

  const contextValue: MockAuthContextType = {
    isAuthenticated: true,
    isLoading: false,
    user: mockUser,
    session: { user: mockUser },
    error: null,
    refreshSession: async () => {},
    logout: async () => {},
    hasPermission: () => true, // 全ての権限を許可
    hasRole: () => true, // 全てのロールを許可
    isAdmin: true,
    clearError: () => {},
  };

  return (
    <MockAuthContext.Provider value={contextValue}>
      {children}
    </MockAuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(MockAuthContext);
  if (!context) {
    throw new Error('useAuth must be used within a MockAuthProvider');
  }
  return context;
}