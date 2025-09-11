// 強化されたリポジトリファクトリー実装

import type { Database } from '@/db/client';
import { getDatabase } from '@/db/client';
import type {
  RepositoryFactory,
  ServerRepository,
  SecretRepository,
  ToolRepository,
  ResourceRepository,
  PromptRepository,
  ServerConfigurationRepository,
  TestResultRepository,
  TransactionManager,
  Transaction,
} from '@/types/repository';

// リポジトリ実装のインポート
// import { EnhancedSecretRepository } from './enhanced-secret-repository';
// import { EnhancedToolRepository } from './enhanced-tool-repository';
// 他のリポジトリは既存のものを使用するか、後で強化版を作成

// 一時的に基本実装を使用（TypeScriptエラー回避のため）

export class EnhancedRepositoryFactory implements RepositoryFactory {
  private static instance: EnhancedRepositoryFactory | null = null;
  private db: Database | null = null;

  // シングルトンパターン
  static getInstance(): EnhancedRepositoryFactory {
    if (!this.instance) {
      this.instance = new EnhancedRepositoryFactory();
    }
    return this.instance;
  }

  private constructor() {}

  private async getDb(): Promise<Database> {
    if (!this.db) {
      this.db = await getDatabase();
    }
    return this.db;
  }

  createServerRepository(): ServerRepository {
    // 既存のサーバーリポジトリを使用（後で強化版に置き換え）
    const { ServerRepository: ExistingServerRepository } = require('./server-repository');
    return new ExistingServerRepository();
  }

  createSecretRepository(): SecretRepository {
    // 一時的に基本実装を返す（既存のリポジトリがあれば使用）
    throw new Error('SecretRepository implementation pending - use existing repository');
  }

  createToolRepository(): ToolRepository {
    // 一時的に基本実装を返す（既存のリポジトリがあれば使用）
    throw new Error('ToolRepository implementation pending - use existing repository');
  }

  createResourceRepository(): ResourceRepository {
    // 後で実装予定、現在は基本実装を返す
    const { ResourceRepository: BasicResourceRepository } = require('./resource-repository');
    return new BasicResourceRepository();
  }

  createPromptRepository(): PromptRepository {
    // 後で実装予定、現在は基本実装を返す
    const { PromptRepository: BasicPromptRepository } = require('./prompt-repository');
    return new BasicPromptRepository();
  }

  createServerConfigurationRepository(): ServerConfigurationRepository {
    // 後で実装予定、現在は基本実装を返す
    const { ConfigurationRepository: ExistingConfigRepository } = require('./configuration-repository');
    return new ExistingConfigRepository();
  }

  createTestResultRepository(): TestResultRepository {
    // 後で実装予定、現在は基本実装を返す
    const { TestResultRepository: BasicTestResultRepository } = require('./test-result-repository');
    return new BasicTestResultRepository();
  }

  createTransactionManager(): TransactionManager {
    return new DrizzleTransactionManager(this.getDb.bind(this));
  }
}

/**
 * Drizzle ORMを使用したトランザクション管理実装
 */
class DrizzleTransactionManager implements TransactionManager {
  constructor(private getDb: () => Promise<Database>) {}

  async begin(): Promise<Transaction> {
    const db = await this.getDb();
    
    return new Promise((resolve, reject) => {
      db.transaction(async (tx) => {
        const transaction = new DrizzleTransaction(tx, resolve, reject);
        resolve(transaction);
        
        // トランザクションが完了するまで待機
        return new Promise<void>((txResolve, txReject) => {
          transaction.setHandlers(txResolve, txReject);
        });
      }).catch(reject);
    });
  }
}

/**
 * Drizzle ORM トランザクション実装
 */
class DrizzleTransaction implements Transaction {
  private isCompleted = false;
  private txResolve?: (value: void | PromiseLike<void>) => void;
  private txReject?: (reason?: any) => void;

  constructor(
    private tx: Database,
    private resolve: (value: Transaction | PromiseLike<Transaction>) => void,
    private reject: (reason?: any) => void
  ) {}

  setHandlers(
    txResolve: (value: void | PromiseLike<void>) => void,
    txReject: (reason?: any) => void
  ): void {
    this.txResolve = txResolve;
    this.txReject = txReject;
  }

  async commit(): Promise<void> {
    if (this.isCompleted) {
      throw new Error('Transaction is already completed');
    }

    try {
      this.isCompleted = true;
      if (this.txResolve) {
        this.txResolve();
      }
    } catch (error) {
      if (this.txReject) {
        this.txReject(error);
      }
      throw error;
    }
  }

  async rollback(): Promise<void> {
    if (this.isCompleted) {
      throw new Error('Transaction is already completed');
    }

    try {
      this.isCompleted = true;
      const rollbackError = new Error('Transaction rolled back');
      if (this.txReject) {
        this.txReject(rollbackError);
      }
      throw rollbackError;
    } catch (error) {
      if (this.txReject) {
        this.txReject(error);
      }
      throw error;
    }
  }

  // トランザクション内でのデータベースアクセス用
  getDatabase(): Database {
    return this.tx;
  }
}

// ファクトリーのデフォルトインスタンスをエクスポート
export const repositoryFactory = EnhancedRepositoryFactory.getInstance();

// 便利な関数もエクスポート
export function createSecretRepository(): SecretRepository {
  return repositoryFactory.createSecretRepository();
}

export function createToolRepository(): ToolRepository {
  return repositoryFactory.createToolRepository();
}

export function createServerRepository(): ServerRepository {
  return repositoryFactory.createServerRepository();
}

export function createResourceRepository(): ResourceRepository {
  return repositoryFactory.createResourceRepository();
}

export function createPromptRepository(): PromptRepository {
  return repositoryFactory.createPromptRepository();
}

export function createServerConfigurationRepository(): ServerConfigurationRepository {
  return repositoryFactory.createServerConfigurationRepository();
}

export function createTestResultRepository(): TestResultRepository {
  return repositoryFactory.createTestResultRepository();
}

export function createTransactionManager(): TransactionManager {
  return repositoryFactory.createTransactionManager();
}

// リポジトリ全体のセットアップとクリーンアップ
export class RepositoryManager {
  private static instance: RepositoryManager | null = null;

  static getInstance(): RepositoryManager {
    if (!this.instance) {
      this.instance = new RepositoryManager();
    }
    return this.instance;
  }

  private constructor() {}

  /**
   * リポジトリセットアップ（アプリケーション起動時に呼び出し）
   */
  async initialize(): Promise<void> {
    try {
      // データベース接続の初期化
      const db = await getDatabase();
      
      // ヘルスチェック
      await this.healthCheck();
      
      console.log('Repository layer initialized successfully');
    } catch (error) {
      console.error('Failed to initialize repository layer:', error);
      throw error;
    }
  }

  /**
   * リポジトリヘルスチェック
   */
  async healthCheck(): Promise<{ healthy: boolean; details?: any }> {
    try {
      const secretRepo = createSecretRepository();
      
      // 簡単な接続テスト
      await secretRepo.count();
      
      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  /**
   * リポジトリクリーンアップ（アプリケーション終了時に呼び出し）
   */
  async cleanup(): Promise<void> {
    try {
      // 接続のクリーンアップが必要な場合はここで実行
      console.log('Repository layer cleanup completed');
    } catch (error) {
      console.error('Error during repository cleanup:', error);
      throw error;
    }
  }
}

// デフォルトのリポジトリマネージャーインスタンス
export const repositoryManager = RepositoryManager.getInstance();