import { JobRepository } from './job-repository';
import { UserRepository } from './user-repository';

// シングルトンインスタンス
let jobRepositoryInstance: JobRepository | null = null;
let userRepositoryInstance: UserRepository | null = null;

/**
 * JobRepositoryのシングルトンインスタンスを取得
 */
export function getJobRepository(): JobRepository {
  if (!jobRepositoryInstance) {
    jobRepositoryInstance = new JobRepository();
  }
  return jobRepositoryInstance;
}

/**
 * UserRepositoryのシングルトンインスタンスを取得
 */
export function getUserRepository(): UserRepository {
  if (!userRepositoryInstance) {
    userRepositoryInstance = new UserRepository();
  }
  return userRepositoryInstance;
}

/**
 * すべてのリポジトリインスタンスをリセット（テスト用）
 */
export function resetRepositories(): void {
  jobRepositoryInstance = null;
  userRepositoryInstance = null;
}

// 型エクスポート
export type { JobRepository, UserRepository };