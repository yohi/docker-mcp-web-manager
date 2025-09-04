import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import { NextRequest } from 'next/server';

/**
 * セッション管理ユーティリティ
 */

/**
 * 現在の認証セッションを取得
 */
export async function getCurrentSession() {
  return await auth();
}

/**
 * 認証が必要なページでセッションを確認
 * 未認証の場合はリダイレクト
 */
export async function requireAuth() {
  const session = await getCurrentSession();
  
  if (!session?.user) {
    redirect('/auth/signin');
  }
  
  return session;
}

/**
 * 管理者権限が必要な操作でセッションを確認
 */
export async function requireAdmin() {
  const session = await requireAuth();
  
  if (!session.user || !isAdmin(session.user)) {
    redirect('/dashboard?error=insufficient_permissions');
  }
  
  return session;
}

/**
 * ユーザーが管理者かどうかを判定
 */
export function isAdmin(user: any): boolean {
  return user?.role === 'admin';
}

/**
 * ユーザーがアクティブかどうかを判定
 */
export function isActiveUser(user: any): boolean {
  return user?.isActive !== false;
}

/**
 * API用のセッション検証ミドルウェア
 */
export async function validateApiSession(request: NextRequest) {
  const session = await getCurrentSession();
  
  if (!session?.user) {
    return {
      valid: false,
      error: 'Unauthorized: No valid session',
      status: 401,
    };
  }
  
  if (!isActiveUser(session.user)) {
    return {
      valid: false,
      error: 'Forbidden: User account is inactive',
      status: 403,
    };
  }
  
  return {
    valid: true,
    session,
    user: session.user,
  };
}

/**
 * API用の管理者権限検証
 */
export async function validateAdminSession(request: NextRequest) {
  const result = await validateApiSession(request);
  
  if (!result.valid) {
    return result;
  }
  
  if (!isAdmin(result.user)) {
    return {
      valid: false,
      error: 'Forbidden: Admin privileges required',
      status: 403,
    };
  }
  
  return result;
}

/**
 * セッション情報をサニタイズしてクライアントに送信
 */
export function sanitizeSessionForClient(session: any) {
  if (!session?.user) {
    return null;
  }
  
  return {
    user: {
      id: session.user.id,
      username: session.user.name || session.user.username,
      email: session.user.email,
      role: session.user.role || 'user',
      isActive: session.user.isActive !== false,
    },
    expires: session.expires,
  };
}

/**
 * 認証エラーのレスポンスを生成
 */
export function createAuthErrorResponse(error: string, status: number = 401) {
  return new Response(
    JSON.stringify({
      error: {
        code: `AUTH_${status}`,
        message: error,
        timestamp: new Date().toISOString(),
      },
    }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}