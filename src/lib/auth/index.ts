// =============================================================================
// 認証・認可システム統合エクスポート
// タスク4: NextAuth.js 4.24.11ベースの包括的な認証システム
// =============================================================================

// NextAuth.js 設定
export {
  authOptions,
  SESSION_CONFIG,
  hasPermission,
  isAdmin,
  isSessionActive,
} from './config';

// 認証情報検証
export {
  validateCredentials,
  validateUserPermissions,
  validateSessionContinuity,
  type User,
  type AuthRequest,
  type AuthResult,
} from './credentials-validator';

// Bitwarden統合
export {
  BitwardenClient,
  type BitwardenAuthRequest,
  type BitwardenAuthResult,
  type BitwardenItem,
  type BitwardenStatus,
} from './bitwarden-client';

export {
  BitwardenAuthProvider,
  validateBitwardenProviderConfig,
  checkBitwardenHealth,
} from './bitwarden-provider';

// 認証ミドルウェア
export {
  authMiddleware,
  config as middlewareConfig,
} from './middleware';

// セッション管理ユーティリティ
export {
  getServerSideSession,
  getSessionFromRequest,
  requirePermissions,
  requireAdmin,
  recordSessionActivity,
  invalidateSession,
  getSessionStats,
  validateSessionConfig,
  sanitizeSessionForClient,
  extendSession,
  checkSessionHealth,
  type ExtendedSession,
  type SessionValidationResult,
  type SessionStats,
} from './session-utils';

// 認証システムのヘルスチェック
export async function checkAuthSystemHealth(): Promise<{
  healthy: boolean;
  components: {
    config: { healthy: boolean; errors: string[]; warnings: string[] };
    bitwarden: { available: boolean; version?: string; error?: string };
    session: { healthy: boolean; error?: string };
  };
  timestamp: string;
}> {
  const timestamp = new Date().toISOString();

  // 設定の検証
  const configValidation = validateSessionConfig();

  // Bitwardenヘルスチェック
  const bitwardenHealth = await checkBitwardenHealth();

  // セッション機能チェック
  const sessionHealth = await checkSessionHealth();

  const healthy = configValidation.valid && 
                  bitwardenHealth.available && 
                  sessionHealth.healthy;

  return {
    healthy,
    components: {
      config: {
        healthy: configValidation.valid,
        errors: configValidation.errors,
        warnings: configValidation.warnings,
      },
      bitwarden: bitwardenHealth,
      session: {
        healthy: sessionHealth.healthy,
        error: sessionHealth.error,
      },
    },
    timestamp,
  };
}

// 権限定数
export const PERMISSIONS = {
  // サーバー管理
  SERVERS_READ: 'servers:read',
  SERVERS_CREATE: 'servers:create',
  SERVERS_MANAGE: 'servers:manage',
  SERVERS_DELETE: 'servers:delete',
  SERVERS_CONFIGURE: 'servers:configure',
  
  // カタログ
  CATALOG_READ: 'catalog:read',
  CATALOG_INSTALL: 'catalog:install',
  
  // ツールとテスト
  TOOLS_READ: 'tools:read',
  TOOLS_TEST: 'tools:test',
  
  // ログ
  LOGS_READ: 'logs:read',
  LOGS_DOWNLOAD: 'logs:download',
  LOGS_STREAM: 'logs:stream',
  
  // 設定管理
  CONFIG_READ: 'config:read',
  CONFIG_EXPORT: 'config:export',
  CONFIG_IMPORT: 'config:import',
  
  // シークレット管理
  SECRETS_READ: 'secrets:read',
  SECRETS_CREATE: 'secrets:create',
  SECRETS_MANAGE: 'secrets:manage',
  SECRETS_DELETE: 'secrets:delete',
  
  // ジョブ管理
  JOBS_READ: 'jobs:read',
  JOBS_MANAGE: 'jobs:manage',
  JOBS_CANCEL: 'jobs:cancel',
  
  // 管理者権限
  ADMIN_ALL: '*',
} as const;

// ロール定数
export const ROLES = {
  ADMIN: 'admin' as const,
  USER: 'user' as const,
  VIEWER: 'viewer' as const,
} as const;

// ロール別デフォルト権限
export const DEFAULT_ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: [PERMISSIONS.ADMIN_ALL],
  [ROLES.USER]: [
    PERMISSIONS.SERVERS_READ,
    PERMISSIONS.SERVERS_MANAGE,
    PERMISSIONS.SERVERS_CONFIGURE,
    PERMISSIONS.CATALOG_READ,
    PERMISSIONS.CATALOG_INSTALL,
    PERMISSIONS.TOOLS_TEST,
    PERMISSIONS.LOGS_READ,
    PERMISSIONS.LOGS_DOWNLOAD,
    PERMISSIONS.LOGS_STREAM,
    PERMISSIONS.CONFIG_READ,
    PERMISSIONS.CONFIG_EXPORT,
    PERMISSIONS.SECRETS_READ,
    PERMISSIONS.JOBS_READ,
    PERMISSIONS.JOBS_MANAGE,
    PERMISSIONS.JOBS_CANCEL,
  ],
  [ROLES.VIEWER]: [
    PERMISSIONS.SERVERS_READ,
    PERMISSIONS.CATALOG_READ,
    PERMISSIONS.TOOLS_READ,
    PERMISSIONS.LOGS_READ,
    PERMISSIONS.LOGS_STREAM,
    PERMISSIONS.CONFIG_READ,
    PERMISSIONS.JOBS_READ,
  ],
} as const;