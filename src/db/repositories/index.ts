// =============================================================================
// Repository Index
// 全てのリポジトリクラスとファクトリーのエクスポート
// =============================================================================

// 既存のリポジトリ（レガシー）
export { BaseRepository, type QueryOptions, type WhereCondition } from './base-repository';
export { ServerRepository } from './server-repository';
export { ConfigurationRepository } from './configuration-repository';
export { JobRepository } from './job-repository';

// 強化されたリポジトリ層（新しいタスク2.2実装） - 一時的にコメントアウト
// export { EnhancedBaseRepository } from './enhanced-base-repository';
// export { EnhancedSecretRepository } from './enhanced-secret-repository';
// export { EnhancedToolRepository } from './enhanced-tool-repository';

// リポジトリファクトリー（推奨）
export {
  EnhancedRepositoryFactory,
  repositoryFactory,
  repositoryManager,
  createSecretRepository,
  createToolRepository,
  createServerRepository,
  createResourceRepository,
  createPromptRepository,
  createServerConfigurationRepository,
  createTestResultRepository,
  createTransactionManager,
} from './enhanced-repository-factory';

// 既存のリポジトリインスタンス（下位互換性のため保持）
export const serverRepository = new ServerRepository();
export const configurationRepository = new ConfigurationRepository();
export const jobRepository = new JobRepository();

// データベース初期化関数のエクスポート
export { initializeDatabase, healthCheck, closeDatabase } from '../connection';