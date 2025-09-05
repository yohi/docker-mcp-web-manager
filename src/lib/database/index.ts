/**
 * データベース層のエントリーポイント
 * すべてのデータベース関連の機能をここからエクスポート
 */

// データベース接続
export { DatabaseConnection } from './connection';

// リポジトリ
export {
  BaseRepository,
  UserRepository,
  ServerRepository,
  ConfigurationRepository,
  RepositoryFactory,
  getRepositories,
  getUserRepository,
  getServerRepository,
  getConfigurationRepository
} from './repositories';

// バリデーションユーティリティ
export {
  createValidationError,
  createValidationResult,
  validateEmail,
  validatePassword,
  validatePort,
  validateUrl,
  validateDockerImage,
  validateDockerTag,
  validateJson,
  validateResourceLimit,
  mergeValidationResults,
  combineValidators,
  conditionalValidator
} from './utils/validation';

// 型定義（再エクスポート）
export type {
  // データベース基本型
  BaseEntity,
  JSONSchema,
  ResourceLimits,
  NetworkConfig,
  VolumeMount,
  PortMapping,

  // ユーザー関連型
  User,
  UserRole,
  AuthProvider,
  UserSession,
  CreateUserInput,
  UpdateUserInput,

  // サーバー関連型
  MCPServer,
  ServerStatus,
  RestartPolicy,
  CreateServerInput,
  UpdateServerInput,
  ServerSummary,

  // 設定関連型
  ServerConfiguration,
  CreateConfigurationInput,
  UpdateConfigurationInput,

  // その他の型
  ValidationError,
  ValidationResult,
  PaginatedResult,
  QueryOptions,
  SearchFilter,
  SortOption,
  DatabaseResult
} from '@/types/database';

// Result型（再エクスポート）
export type { Result, Success, Failure } from '@/types/common';

/**
 * データベース初期化ヘルパー関数
 */
export async function initializeDatabase(): Promise<void> {
  const db = DatabaseConnection.getInstance();
  await db.initialize();
}

/**
 * データベースヘルスチェック
 */
export async function checkDatabaseHealth(): Promise<{
  healthy: boolean;
  details: Record<string, unknown>;
}> {
  try {
    const db = DatabaseConnection.getInstance();
    const result = db.healthCheck();
    
    return {
      healthy: true,
      details: result
    };
  } catch (error) {
    return {
      healthy: false,
      details: {
        error: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

/**
 * データベース統計情報取得
 */
export async function getDatabaseStats(): Promise<Record<string, unknown>> {
  try {
    const db = DatabaseConnection.getInstance();
    return db.getStats();
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error)
    };
  }
}