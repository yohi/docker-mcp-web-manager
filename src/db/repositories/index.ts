// =============================================================================
// Repository Index
// 全てのリポジトリクラスのエクスポート
// =============================================================================

export { BaseRepository, type QueryOptions, type WhereCondition } from './base-repository';
export { ServerRepository } from './server-repository';
export { ConfigurationRepository } from './configuration-repository';
export { JobRepository } from './job-repository';

// リポジトリインスタンスをシングルトンとして提供
export const serverRepository = new ServerRepository();
export const configurationRepository = new ConfigurationRepository();
export const jobRepository = new JobRepository();

// データベース初期化関数のエクスポート
export { initializeDatabase, healthCheck, closeDatabase } from '../connection';