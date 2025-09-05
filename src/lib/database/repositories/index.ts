/**
 * データベースリポジトリのエントリーポイント
 * すべてのリポジトリをここからエクスポート
 */

// 基底リポジトリ
export { BaseRepository } from './base';

// 具体的なリポジトリ
export { UserRepository } from './user';
export { ServerRepository } from './server';
export { ConfigurationRepository } from './configuration';

// リポジトリファクトリー
import { UserRepository } from './user';
import { ServerRepository } from './server';
import { ConfigurationRepository } from './configuration';

/**
 * リポジトリファクトリークラス
 * シングルトンパターンでリポジトリインスタンスを管理
 */
export class RepositoryFactory {
  private static instance: RepositoryFactory;
  private userRepository: UserRepository | null = null;
  private serverRepository: ServerRepository | null = null;
  private configurationRepository: ConfigurationRepository | null = null;

  private constructor() {}

  /**
   * ファクトリーのシングルトンインスタンスを取得
   */
  public static getInstance(): RepositoryFactory {
    if (!RepositoryFactory.instance) {
      RepositoryFactory.instance = new RepositoryFactory();
    }
    return RepositoryFactory.instance;
  }

  /**
   * ユーザーリポジトリを取得
   */
  public getUserRepository(): UserRepository {
    if (!this.userRepository) {
      this.userRepository = new UserRepository();
    }
    return this.userRepository;
  }

  /**
   * サーバーリポジトリを取得
   */
  public getServerRepository(): ServerRepository {
    if (!this.serverRepository) {
      this.serverRepository = new ServerRepository();
    }
    return this.serverRepository;
  }

  /**
   * 設定リポジトリを取得
   */
  public getConfigurationRepository(): ConfigurationRepository {
    if (!this.configurationRepository) {
      this.configurationRepository = new ConfigurationRepository();
    }
    return this.configurationRepository;
  }

  /**
   * すべてのリポジトリをリセット（テスト用）
   */
  public resetRepositories(): void {
    this.userRepository = null;
    this.serverRepository = null;
    this.configurationRepository = null;
  }
}

/**
 * 便利な関数でリポジトリを取得
 */
export const getRepositories = () => {
  const factory = RepositoryFactory.getInstance();
  return {
    user: factory.getUserRepository(),
    server: factory.getServerRepository(),
    configuration: factory.getConfigurationRepository()
  };
};

/**
 * 特定のリポジトリを取得するヘルパー関数
 */
export const getUserRepository = () => RepositoryFactory.getInstance().getUserRepository();
export const getServerRepository = () => RepositoryFactory.getInstance().getServerRepository();
export const getConfigurationRepository = () => RepositoryFactory.getInstance().getConfigurationRepository();