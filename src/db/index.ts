// =============================================================================
// Database Module Index
// データベース関連のメイン エクスポート
// =============================================================================

// データベース接続とユーティリティ
export { default as db, sqlite, initializeDatabase, healthCheck, closeDatabase } from './connection';

// スキーマ定義
export * from './schema';

// リポジトリクラス
export {
  BaseRepository,
  ServerRepository,
  ConfigurationRepository,
  JobRepository,
  serverRepository,
  configurationRepository,
  jobRepository,
  type QueryOptions,
  type WhereCondition,
} from './repositories';

// 型定義
export type {
  MCPServer,
  ServerConfiguration,
  Job,
  JobResponse,
  Secret,
  SecretReference,
  Tool,
  Resource,
  Prompt,
  TestResult,
  CatalogEntry,
  CatalogServerInfo,
  JSONSchema,
  ResourceLimits,
  NetworkConfig,
  PaginatedResponse,
  ErrorResponse,
  ServerRow,
  ConfigurationRow,
  JobRow,
  SecretRow,
  SecretReferenceRow,
  ToolRow,
  ResourceRow,
  PromptRow,
  TestResultRow,
  BitwardenItemRow,
  IdempotencyKeyRow,
} from '../types/models';

// データベース初期化のヘルパー関数
export async function initializeRepositories() {
  try {
    console.log('Initializing database repositories...');
    
    // データベース接続の初期化
    await initializeDatabase();
    
    // ヘルスチェック実行
    const health = await healthCheck();
    if (health.status === 'unhealthy') {
      throw new Error(health.message);
    }
    
    console.log('Database repositories initialized successfully');
    return true;
  } catch (error) {
    console.error('Failed to initialize database repositories:', error);
    throw error;
  }
}