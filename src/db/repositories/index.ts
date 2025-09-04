// リポジトリの統合エクスポート
export { SimpleServerRepository } from './simple-server-repository';
export { SimpleJobRepository } from './simple-job-repository';

// シングルトンインスタンスを作成
import { SimpleServerRepository } from './simple-server-repository';
import { SimpleJobRepository } from './simple-job-repository';

// リポジトリインスタンスのシングルトン
let serverRepositoryInstance: SimpleServerRepository | null = null;
let jobRepositoryInstance: SimpleJobRepository | null = null;

/**
 * サーバーリポジトリのシングルトンインスタンスを取得
 */
export function getServerRepository(): SimpleServerRepository {
  if (!serverRepositoryInstance) {
    serverRepositoryInstance = new SimpleServerRepository();
  }
  return serverRepositoryInstance;
}

/**
 * ジョブリポジトリのシングルトンインスタンスを取得
 */
export function getJobRepository(): SimpleJobRepository {
  if (!jobRepositoryInstance) {
    jobRepositoryInstance = new SimpleJobRepository();
  }
  return jobRepositoryInstance;
}

/**
 * 全てのリポジトリインスタンスをリセット（テスト用）
 */
export function resetRepositories(): void {
  serverRepositoryInstance = null;
  jobRepositoryInstance = null;
}