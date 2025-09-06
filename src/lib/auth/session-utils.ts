import { getServerSession } from 'next-auth/next';
import { getToken } from 'next-auth/jwt';
import { NextRequest } from 'next/server';
import { authOptions, SESSION_CONFIG, hasPermission, isAdmin, isSessionActive } from './config';

// =============================================================================
// セッション管理ユーティリティ
// サーバーサイド・クライアントサイドでのセッション操作
// =============================================================================

/**
 * 拡張セッション情報の型定義
 */
export interface ExtendedSession {
  user: {
    id: string;
    email: string;
    role: 'admin' | 'user' | 'viewer';
    permissions: string[];
  };
  sessionId: string;
  lastActivity: number;
  expiresAt: number;
  isActive: boolean;
  remainingTime: number;
}

/**
 * セッション検証結果の型定義
 */
export interface SessionValidationResult {
  valid: boolean;
  session?: ExtendedSession;
  error?: string;
  requiresReauth?: boolean;
}

/**
 * サーバーサイドセッションの取得
 */
export async function getServerSideSession(): Promise<SessionValidationResult> {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return {
        valid: false,
        error: 'No session found',
      };
    }

    // セッションの有効性チェック
    const isActive = isSessionActive(session);
    if (!isActive) {
      return {
        valid: false,
        error: 'Session expired',
        requiresReauth: true,
      };
    }

    const extendedSession: ExtendedSession = {
      user: session.user,
      sessionId: session.sessionId,
      lastActivity: session.lastActivity,
      expiresAt: session.expiresAt,
      isActive: true,
      remainingTime: Math.max(0, session.expiresAt - Date.now()),
    };

    return {
      valid: true,
      session: extendedSession,
    };
  } catch (error) {
    console.error('[SESSION_ERROR] Server-side session retrieval failed:', error);
    return {
      valid: false,
      error: 'Session retrieval failed',
    };
  }
}

/**
 * APIリクエストからセッション情報の取得
 */
export async function getSessionFromRequest(req: NextRequest): Promise<SessionValidationResult> {
  try {
    const token = await getToken({
      req,
      secret: process.env.JWT_SECRET,
    });

    if (!token) {
      return {
        valid: false,
        error: 'No token found',
      };
    }

    // トークンの有効性チェック
    const now = Date.now();
    if (token.lastActivity && (now - token.lastActivity) > SESSION_CONFIG.activityTimeout) {
      return {
        valid: false,
        error: 'Token expired due to inactivity',
        requiresReauth: true,
      };
    }

    const extendedSession: ExtendedSession = {
      user: {
        id: token.id,
        email: token.email,
        role: token.role,
        permissions: token.permissions,
      },
      sessionId: token.sessionId,
      lastActivity: token.lastActivity,
      expiresAt: token.lastActivity + SESSION_CONFIG.activityTimeout,
      isActive: true,
      remainingTime: Math.max(0, token.lastActivity + SESSION_CONFIG.activityTimeout - now),
    };

    return {
      valid: true,
      session: extendedSession,
    };
  } catch (error) {
    console.error('[SESSION_ERROR] Request session retrieval failed:', error);
    return {
      valid: false,
      error: 'Session retrieval failed',
    };
  }
}

/**
 * 権限ベースのアクセス制御
 */
export async function requirePermissions(
  permissions: string[],
  req?: NextRequest
): Promise<SessionValidationResult> {
  try {
    // セッション取得
    const sessionResult = req 
      ? await getSessionFromRequest(req)
      : await getServerSideSession();

    if (!sessionResult.valid || !sessionResult.session) {
      return sessionResult;
    }

    // 権限チェック
    const hasRequiredPermissions = hasPermission(sessionResult.session, permissions.join(','));
    if (!hasRequiredPermissions) {
      return {
        valid: false,
        error: `Insufficient permissions. Required: ${permissions.join(', ')}`,
      };
    }

    return sessionResult;
  } catch (error) {
    console.error('[SESSION_ERROR] Permission check failed:', error);
    return {
      valid: false,
      error: 'Permission check failed',
    };
  }
}

/**
 * 管理者権限の確認
 */
export async function requireAdmin(req?: NextRequest): Promise<SessionValidationResult> {
  try {
    const sessionResult = req 
      ? await getSessionFromRequest(req)
      : await getServerSideSession();

    if (!sessionResult.valid || !sessionResult.session) {
      return sessionResult;
    }

    const adminAccess = isAdmin(sessionResult.session);
    if (!adminAccess) {
      return {
        valid: false,
        error: 'Administrator privileges required',
      };
    }

    return sessionResult;
  } catch (error) {
    console.error('[SESSION_ERROR] Admin check failed:', error);
    return {
      valid: false,
      error: 'Admin check failed',
    };
  }
}

/**
 * セッション活動の記録
 */
export function recordSessionActivity(sessionId: string, activity: {
  action: string;
  resource?: string;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
}): void {
  const activityLog = {
    timestamp: new Date().toISOString(),
    sessionId,
    activity: activity.action,
    resource: activity.resource,
    details: activity.details,
    ipAddress: activity.ipAddress || 'unknown',
    userAgent: activity.userAgent || 'unknown',
    level: 'info',
  };

  console.log('[SESSION_ACTIVITY]', JSON.stringify(activityLog));
}

/**
 * セッションの強制終了（セキュリティ用）
 */
export async function invalidateSession(
  sessionId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // セッション無効化ログ
    console.log('[SESSION_INVALIDATION]', {
      sessionId,
      reason,
      timestamp: new Date().toISOString(),
    });

    // TODO: 実際のセッション無効化処理
    // JWT戦略を使用しているため、ブラックリスト管理が必要
    // 現在はログのみ記録

    return { success: true };
  } catch (error) {
    console.error('[SESSION_ERROR] Session invalidation failed:', error);
    return {
      success: false,
      error: 'Session invalidation failed',
    };
  }
}

/**
 * セッション統計の取得
 */
export interface SessionStats {
  activeSessions: number;
  expiringSoon: number; // 5分以内に期限切れ
  averageSessionDuration: number;
  totalSessions: number;
}

/**
 * セッション統計の生成（簡易版）
 */
export function getSessionStats(): SessionStats {
  // JWT戦略では実際のセッション数の追跡が困難
  // 実際の実装では Redis や データベースでの追跡が必要
  
  return {
    activeSessions: 0, // 実装が必要
    expiringSoon: 0,   // 実装が必要
    averageSessionDuration: SESSION_CONFIG.maxAge,
    totalSessions: 0,  // 実装が必要
  };
}

/**
 * セッション設定の検証
 */
export function validateSessionConfig(): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // JWT秘密鍵の確認
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    errors.push('JWT_SECRET environment variable is required');
  } else if (jwtSecret.length < 32) {
    warnings.push('JWT_SECRET should be at least 32 characters long');
  }

  // NextAuth URL の確認
  const nextAuthUrl = process.env.NEXTAUTH_URL;
  if (!nextAuthUrl) {
    warnings.push('NEXTAUTH_URL environment variable should be set');
  } else if (process.env.NODE_ENV === 'production' && !nextAuthUrl.startsWith('https://')) {
    warnings.push('NEXTAUTH_URL should use HTTPS in production');
  }

  // NextAuth 秘密鍵の確認
  const nextAuthSecret = process.env.NEXTAUTH_SECRET;
  if (!nextAuthSecret) {
    errors.push('NEXTAUTH_SECRET environment variable is required');
  } else if (nextAuthSecret.length < 32) {
    warnings.push('NEXTAUTH_SECRET should be at least 32 characters long');
  }

  // セッション設定の妥当性
  if (SESSION_CONFIG.maxAge < 300) {
    warnings.push('Session maxAge is very short (less than 5 minutes)');
  }

  if (SESSION_CONFIG.activityTimeout < 60000) {
    warnings.push('Activity timeout is very short (less than 1 minute)');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * セッション情報のクライアント側用サニタイゼーション
 */
export function sanitizeSessionForClient(session: ExtendedSession): Omit<ExtendedSession, 'sessionId'> {
  const { sessionId, ...clientSession } = session;
  
  return {
    ...clientSession,
    // 権限情報を一般化（詳細な権限リストは含めない）
    user: {
      ...clientSession.user,
      permissions: clientSession.user.permissions.includes('*') 
        ? ['admin'] 
        : ['user'],
    },
  };
}

/**
 * セッションの延長
 */
export async function extendSession(
  sessionId: string
): Promise<{ success: boolean; newExpiresAt?: number; error?: string }> {
  try {
    const now = Date.now();
    const newExpiresAt = now + SESSION_CONFIG.activityTimeout;

    // セッション延長ログ
    console.log('[SESSION_EXTENSION]', {
      sessionId,
      newExpiresAt: new Date(newExpiresAt).toISOString(),
      timestamp: new Date().toISOString(),
    });

    // TODO: 実際のセッション延長処理
    // JWT戦略では次回のトークン生成時に更新される

    return {
      success: true,
      newExpiresAt,
    };
  } catch (error) {
    console.error('[SESSION_ERROR] Session extension failed:', error);
    return {
      success: false,
      error: 'Session extension failed',
    };
  }
}

/**
 * セッションのヘルスチェック
 */
export async function checkSessionHealth(req?: NextRequest): Promise<{
  healthy: boolean;
  details: {
    hasValidSession: boolean;
    sessionExpiry?: Date;
    remainingTime?: number;
    userRole?: string;
    lastActivity?: Date;
  };
  error?: string;
}> {
  try {
    const sessionResult = req 
      ? await getSessionFromRequest(req)
      : await getServerSideSession();

    if (!sessionResult.valid || !sessionResult.session) {
      return {
        healthy: false,
        details: {
          hasValidSession: false,
        },
        error: sessionResult.error,
      };
    }

    const session = sessionResult.session;

    return {
      healthy: true,
      details: {
        hasValidSession: true,
        sessionExpiry: new Date(session.expiresAt),
        remainingTime: session.remainingTime,
        userRole: session.user.role,
        lastActivity: new Date(session.lastActivity),
      },
    };
  } catch (error) {
    return {
      healthy: false,
      details: {
        hasValidSession: false,
      },
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}