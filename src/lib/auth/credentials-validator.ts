import { randomUUID } from 'crypto';
import { BitwardenClient } from './bitwarden-client';
import { db } from '@/db/connection';
import { users as usersTable } from '@/db/schema';
import { eq } from 'drizzle-orm';

// =============================================================================
// 認証情報検証システム
// ローカル認証とBitwarden統合による認証情報の検証
// =============================================================================

/**
 * ユーザー情報の型定義
 */
export interface User {
  id: string;
  email: string;
  role: 'admin' | 'user' | 'viewer';
  permissions: string[];
  lastLogin?: Date;
  createdAt?: Date;
}

/**
 * 認証リクエストの型定義
 */
export interface AuthRequest {
  email: string;
  password: string;
  authMethod: 'local' | 'bitwarden';
  totpCode?: string;
  ipAddress: string;
}

/**
 * 認証結果の型定義
 */
export interface AuthResult {
  success: boolean;
  user?: User;
  error?: string;
  requiresTOTP?: boolean;
  attemptsRemaining?: number;
}

/**
 * レート制限のための試行回数管理
 */
class AuthAttemptTracker {
  private attempts = new Map<string, { count: number; lastAttempt: number }>();
  private readonly maxAttempts = 5;
  private readonly lockoutDuration = 15 * 60 * 1000; // 15分
  private readonly cleanupInterval: NodeJS.Timer;

  constructor() {
    // 定期的なクリーンアップ（5分間隔）
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * 試行回数の記録
   */
  recordAttempt(identifier: string): number {
    const now = Date.now();
    const existing = this.attempts.get(identifier);

    if (!existing || (now - existing.lastAttempt) > this.lockoutDuration) {
      // 新規または期限切れの場合はリセット
      this.attempts.set(identifier, { count: 1, lastAttempt: now });
      return this.maxAttempts - 1;
    }

    // 既存の試行回数を増加
    existing.count += 1;
    existing.lastAttempt = now;
    this.attempts.set(identifier, existing);

    return Math.max(0, this.maxAttempts - existing.count);
  }

  /**
   * アカウントロック状態の確認
   */
  isLocked(identifier: string): boolean {
    const attempt = this.attempts.get(identifier);
    if (!attempt) return false;

    const now = Date.now();
    if ((now - attempt.lastAttempt) > this.lockoutDuration) {
      // 期限切れの場合はロック解除
      this.attempts.delete(identifier);
      return false;
    }

    return attempt.count >= this.maxAttempts;
  }

  /**
   * 成功時のリセット
   */
  resetAttempts(identifier: string): void {
    this.attempts.delete(identifier);
  }

  /**
   * 期限切れエントリのクリーンアップ
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredKeys = Array.from(this.attempts.entries())
      .filter(([_, attempt]) => (now - attempt.lastAttempt) > this.lockoutDuration)
      .map(([key]) => key);

    expiredKeys.forEach(key => this.attempts.delete(key));

    if (expiredKeys.length > 0) {
      console.log(`[AUTH_CLEANUP] Cleaned up ${expiredKeys.length} expired auth attempts`);
    }
  }

  /**
   * リソースクリーンアップ
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.attempts.clear();
  }
}

// グローバルインスタンス
const attemptTracker = new AuthAttemptTracker();

/**
 * ハードコードされた管理者ユーザー（開発・初期セットアップ用）
 */
const DEFAULT_ADMIN_USERS: User[] = [
  {
    id: 'admin-001',
    email: process.env.DEFAULT_ADMIN_EMAIL || 'admin@docker-mcp.local',
    role: 'admin',
    permissions: ['*'], // 全権限
    createdAt: new Date('2024-01-01'),
  },
];

/**
 * データベースからユーザーを取得
 */
async function getUserFromDatabase(email: string): Promise<User | null> {
  try {
    const result = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const user = result[0];

    // permissions が JSON 文字列の場合はパース
    let permissions: string[] = [];
    if (user.permissions) {
      try {
        permissions = JSON.parse(user.permissions);
      } catch (error) {
        console.warn('[AUTH_WARNING] Failed to parse user permissions:', error);
        permissions = [];
      }
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role as 'admin' | 'user' | 'viewer',
      permissions,
      lastLogin: user.lastLoginAt ? new Date(user.lastLoginAt) : undefined,
      createdAt: user.createdAt ? new Date(user.createdAt) : undefined,
    };
  } catch (error) {
    console.error('[AUTH_ERROR] Database user lookup failed:', error);
    return null;
  }
}

/**
 * デフォルト管理者パスワードの検証
 */
function validateDefaultAdminPassword(email: string, password: string): boolean {
  const adminUser = DEFAULT_ADMIN_USERS.find(user => user.email === email);
  if (!adminUser) return false;

  const expectedPassword = process.env.DEFAULT_ADMIN_PASSWORD;
  if (!expectedPassword) {
    console.warn('[AUTH_WARNING] DEFAULT_ADMIN_PASSWORD not set, admin login disabled');
    return false;
  }

  // 本番環境での警告
  if (process.env.NODE_ENV === 'production' && expectedPassword === 'admin') {
    console.error('[AUTH_SECURITY] Using default password "admin" in production is not allowed');
    return false;
  }

  return password === expectedPassword;
}

/**
 * ローカル認証の実行
 */
async function performLocalAuth(request: AuthRequest): Promise<AuthResult> {
  try {
    // まずデフォルト管理者認証を確認
    const isDefaultAdmin = validateDefaultAdminPassword(request.email, request.password);

    if (isDefaultAdmin) {
      const adminUser = DEFAULT_ADMIN_USERS.find(user => user.email === request.email)!;

      console.log('[AUTH_LOCAL_SUCCESS] Default admin authentication:', {
        userId: adminUser.id,
        email: adminUser.email,
        ipAddress: request.ipAddress,
      });

      return {
        success: true,
        user: {
          ...adminUser,
          lastLogin: new Date(),
        },
      };
    }

    // データベースからユーザー情報を取得
    const dbUser = await getUserFromDatabase(request.email);

    if (!dbUser) {
      return {
        success: false,
        error: 'Invalid credentials',
      };
    }

    // パスワード検証（現在は固定パスワード "admin123" を使用）
    // 本番環境では適切なパスワードハッシュ化を実装すべき
    const isValidPassword = request.password === 'admin123';

    if (!isValidPassword) {
      return {
        success: false,
        error: 'Invalid credentials',
      };
    }

    console.log('[AUTH_LOCAL_SUCCESS] Database user authentication:', {
      userId: dbUser.id,
      email: dbUser.email,
      role: dbUser.role,
      ipAddress: request.ipAddress,
    });

    return {
      success: true,
      user: {
        ...dbUser,
        lastLogin: new Date(),
      },
    };
  } catch (error) {
    console.error('[AUTH_ERROR] Local authentication error:', error);
    return {
      success: false,
      error: 'Authentication service unavailable',
    };
  }
}

/**
 * Bitwarden認証の実行
 */
async function performBitwardenAuth(request: AuthRequest): Promise<AuthResult> {
  try {
    const bitwardenClient = new BitwardenClient();
    
    // Bitwarden CLIを使用した認証
    const authResult = await bitwardenClient.authenticate({
      email: request.email,
      password: request.password,
      totpCode: request.totpCode,
    });

    if (!authResult.success) {
      return {
        success: false,
        error: authResult.error || 'Bitwarden authentication failed',
        requiresTOTP: authResult.requiresTOTP,
      };
    }

    // Bitwardenユーザーから内部ユーザーオブジェクトを生成
    const user: User = {
      id: `bitwarden_${authResult.userId}`,
      email: request.email,
      role: determineBitwardenUserRole(request.email),
      permissions: getBitwardenUserPermissions(request.email),
      lastLogin: new Date(),
    };

    console.log('[AUTH_BITWARDEN_SUCCESS] Bitwarden authentication:', {
      userId: user.id,
      email: user.email,
      role: user.role,
      ipAddress: request.ipAddress,
    });

    return {
      success: true,
      user,
    };
  } catch (error) {
    console.error('[AUTH_ERROR] Bitwarden authentication error:', error);
    return {
      success: false,
      error: 'Bitwarden authentication service unavailable',
    };
  }
}

/**
 * Bitwardenユーザーの役割決定
 */
function determineBitwardenUserRole(email: string): 'admin' | 'user' | 'viewer' {
  // 環境変数で設定された管理者メールアドレス
  const adminEmails = (process.env.BITWARDEN_ADMIN_EMAILS || '').split(',').map(e => e.trim());
  
  if (adminEmails.includes(email)) {
    return 'admin';
  }

  // デフォルトはユーザー権限
  return 'user';
}

/**
 * Bitwardenユーザーの権限取得
 */
function getBitwardenUserPermissions(email: string): string[] {
  const role = determineBitwardenUserRole(email);
  
  switch (role) {
    case 'admin':
      return ['*']; // 全権限
    case 'user':
      return [
        'servers:read',
        'servers:manage',
        'catalog:read',
        'catalog:install',
        'tools:test',
        'logs:read',
        'config:read',
      ];
    case 'viewer':
      return [
        'servers:read',
        'catalog:read',
        'logs:read',
      ];
    default:
      return [];
  }
}

/**
 * セキュリティ監査ログの記録
 */
function logAuthAttempt(request: AuthRequest, result: AuthResult): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    event: 'AUTH_ATTEMPT',
    email: request.email,
    authMethod: request.authMethod,
    success: result.success,
    error: result.error,
    ipAddress: request.ipAddress,
    userAgent: 'N/A', // リクエストに含まれていない場合
    requiresTOTP: result.requiresTOTP,
    attemptsRemaining: result.attemptsRemaining,
  };

  if (result.success) {
    console.log('[AUTH_SUCCESS]', JSON.stringify(logEntry));
  } else {
    console.warn('[AUTH_FAILED]', JSON.stringify(logEntry));
  }
}

/**
 * メイン認証情報検証関数
 */
export async function validateCredentials(request: AuthRequest): Promise<AuthResult> {
  const identifier = `${request.email}:${request.ipAddress}`;
  
  try {
    // レート制限チェック
    if (attemptTracker.isLocked(identifier)) {
      const result: AuthResult = {
        success: false,
        error: 'Account temporarily locked due to too many failed attempts',
        attemptsRemaining: 0,
      };
      
      logAuthAttempt(request, result);
      return result;
    }

    let result: AuthResult;

    // 認証方法に応じた処理
    switch (request.authMethod) {
      case 'local':
        result = await performLocalAuth(request);
        break;
      case 'bitwarden':
        result = await performBitwardenAuth(request);
        break;
      default:
        result = {
          success: false,
          error: 'Unsupported authentication method',
        };
    }

    // 試行回数の管理
    if (result.success) {
      attemptTracker.resetAttempts(identifier);
    } else {
      const remaining = attemptTracker.recordAttempt(identifier);
      result.attemptsRemaining = remaining;
    }

    // 監査ログの記録
    logAuthAttempt(request, result);

    return result;
  } catch (error) {
    const result: AuthResult = {
      success: false,
      error: 'Internal authentication error',
    };

    console.error('[AUTH_ERROR] Validation error:', error);
    logAuthAttempt(request, result);
    
    return result;
  }
}

/**
 * ユーザー権限の検証
 */
export function validateUserPermissions(user: User, requiredPermissions: string[]): boolean {
  if (!user.permissions || user.permissions.length === 0) {
    return false;
  }

  // 管理者は全権限を持つ
  if (user.permissions.includes('*')) {
    return true;
  }

  // 必要な権限をすべて持っているかチェック
  return requiredPermissions.every(permission => 
    user.permissions.includes(permission)
  );
}

/**
 * セッション継続の検証
 */
export function validateSessionContinuity(lastActivity: number): boolean {
  const maxInactivity = 30 * 60 * 1000; // 30分
  return (Date.now() - lastActivity) <= maxInactivity;
}

// プロセス終了時のクリーンアップ
process.on('SIGTERM', () => {
  attemptTracker.destroy();
});

process.on('SIGINT', () => {
  attemptTracker.destroy();
});