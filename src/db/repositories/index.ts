// =============================================================================
// Repository Index
// 全てのリポジトリクラスのエクスポート
// =============================================================================

export { BaseRepository, type QueryOptions, type WhereCondition } from './base-repository';

// 各リポジトリクラスを個別にインポートしてエクスポート
import { ServerRepository as ServerRepositoryClass } from './server-repository';
import { ConfigurationRepository as ConfigurationRepositoryClass } from './configuration-repository';
import { JobRepository as JobRepositoryClass } from './job-repository';

export { ServerRepositoryClass as ServerRepository };
export { ConfigurationRepositoryClass as ConfigurationRepository };
export { JobRepositoryClass as JobRepository };

// インスタンスを作成
export function getServerRepository(): ServerRepositoryClass {
  return new ServerRepositoryClass();
}

export function getConfigurationRepository(): ConfigurationRepositoryClass {
  return new ConfigurationRepositoryClass();
}

export function getJobRepository(): JobRepositoryClass {
  return new JobRepositoryClass();
}

// シングルトンインスタンス
let _serverRepository: ServerRepositoryClass | null = null;
let _configurationRepository: ConfigurationRepositoryClass | null = null;
let _jobRepository: JobRepositoryClass | null = null;

export const serverRepository = (() => {
  if (!_serverRepository) {
    _serverRepository = new ServerRepositoryClass();
  }
  return _serverRepository;
})();

export const configurationRepository = (() => {
  if (!_configurationRepository) {
    _configurationRepository = new ConfigurationRepositoryClass();
  }
  return _configurationRepository;
})();

export const jobRepository = (() => {
  if (!_jobRepository) {
    _jobRepository = new JobRepositoryClass();
  }
  return _jobRepository;
})();

// データベース初期化関数のエクスポート
export { initializeDatabase, healthCheck, closeDatabase } from '../connection';