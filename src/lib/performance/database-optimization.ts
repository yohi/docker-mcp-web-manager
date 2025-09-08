import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import { 
  sql, 
  eq, 
  and, 
  or, 
  desc, 
  asc,
  count,
  avg,
  sum,
  min,
  max
} from 'drizzle-orm';
import * as schema from '@/db/schema';

// =============================================================================
// データベース最適化システム
// クエリ最適化、接続プール管理、インデックス管理の包括的実装
// =============================================================================

/**
 * データベース統計情報
 */
interface DatabaseStats {
  totalQueries: number;
  slowQueries: number;
  averageQueryTime: number;
  cacheHitRate: number;
  connectionPoolStats: {
    active: number;
    idle: number;
    total: number;
  };
  indexUsage: Record<string, number>;
  tableStats: Record<string, {
    rowCount: number;
    avgRowSize: number;
    totalSize: number;
    fragmentationLevel: number;
  }>;
}

/**
 * クエリ最適化設定
 */
interface QueryOptimizationConfig {
  enableQueryLogging: boolean;
  slowQueryThreshold: number;
  maxConnectionPoolSize: number;
  connectionTimeout: number;
  enableQueryCache: boolean;
  cacheSize: number;
  enableIndexOptimization: boolean;
  autoVacuum: boolean;
  vacuumInterval: number;
}

/**
 * SQLite 最適化マネージャー
 */
export class DatabaseOptimizationManager {
  private db: Database.Database;
  private drizzleDb: ReturnType<typeof drizzle>;
  private config: QueryOptimizationConfig;
  private queryStats = new Map<string, { count: number; totalTime: number; lastExecuted: number }>();
  private connectionPool: Database.Database[] = [];
  private stats: DatabaseStats;

  constructor(databasePath: string, config: Partial<QueryOptimizationConfig> = {}) {
    this.config = {
      enableQueryLogging: process.env.NODE_ENV === 'development',
      slowQueryThreshold: 1000, // 1秒
      maxConnectionPoolSize: 10,
      connectionTimeout: 30000, // 30秒
      enableQueryCache: true,
      cacheSize: 50,
      enableIndexOptimization: true,
      autoVacuum: true,
      vacuumInterval: 24 * 60 * 60 * 1000, // 24時間
      ...config,
    };

    // メインデータベース接続
    this.db = new Database(databasePath, {
      verbose: this.config.enableQueryLogging ? console.log : undefined,
    });

    // Drizzle ORM インスタンス
    this.drizzleDb = drizzle(this.db, { schema });

    // 初期化
    this.initializeDatabase();
    this.initializeConnectionPool();
    this.startMaintenanceTasks();

    this.stats = this.initializeStats();
  }

  /**
   * データベース初期化
   */
  private initializeDatabase(): void {
    // SQLite 最適化設定
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA cache_size = 64000;
      PRAGMA foreign_keys = ON;
      PRAGMA temp_store = MEMORY;
      PRAGMA mmap_size = 268435456;
      PRAGMA page_size = 32768;
    `);

    // 自動VACUUM設定
    if (this.config.autoVacuum) {
      this.db.exec('PRAGMA auto_vacuum = INCREMENTAL;');
    }

    console.log('[DB] Database initialized with optimization settings');
  }

  /**
   * 接続プール初期化
   */
  private initializeConnectionPool(): void {
    for (let i = 0; i < this.config.maxConnectionPoolSize; i++) {
      const connection = new Database(this.db.name, {
        readonly: true,
        fileMustExist: true,
      });
      
      connection.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA cache_size = 32000;
        PRAGMA query_only = ON;
      `);

      this.connectionPool.push(connection);
    }

    console.log(`[DB] Connection pool initialized with ${this.config.maxConnectionPoolSize} connections`);
  }

  /**
   * メンテナンスタスク開始
   */
  private startMaintenanceTasks(): void {
    // 定期的な統計情報更新
    setInterval(() => {
      this.updateStats();
    }, 60000); // 1分間隔

    // 定期的なVACUUM
    if (this.config.autoVacuum) {
      setInterval(() => {
        this.performMaintenance();
      }, this.config.vacuumInterval);
    }

    // 古いクエリ統計の削除
    setInterval(() => {
      this.cleanupQueryStats();
    }, 60 * 60 * 1000); // 1時間間隔
  }

  /**
   * 統計情報初期化
   */
  private initializeStats(): DatabaseStats {
    return {
      totalQueries: 0,
      slowQueries: 0,
      averageQueryTime: 0,
      cacheHitRate: 0,
      connectionPoolStats: {
        active: 0,
        idle: this.config.maxConnectionPoolSize,
        total: this.config.maxConnectionPoolSize,
      },
      indexUsage: {},
      tableStats: {},
    };
  }

  /**
   * 最適化されたクエリ実行
   */
  async executeOptimizedQuery<T>(
    query: string,
    params: any[] = [],
    options: {
      useReadReplica?: boolean;
      enableCache?: boolean;
      cacheKey?: string;
      cacheTTL?: number;
    } = {}
  ): Promise<T[]> {
    const startTime = Date.now();
    const queryKey = this.generateQueryKey(query, params);

    try {
      // キャッシュチェック
      if (options.enableCache && this.config.enableQueryCache) {
        const cachedResult = await this.getCachedResult<T>(options.cacheKey || queryKey);
        if (cachedResult) {
          this.updateQueryStats(queryKey, Date.now() - startTime);
          return cachedResult;
        }
      }

      // 適切な接続を選択
      const connection = options.useReadReplica 
        ? this.getReadConnection() 
        : this.db;

      // クエリ実行
      const stmt = connection.prepare(query);
      const result = stmt.all(...params) as T[];

      // キャッシュに保存
      if (options.enableCache && this.config.enableQueryCache) {
        await this.setCachedResult(options.cacheKey || queryKey, result, options.cacheTTL);
      }

      // 統計更新
      const executionTime = Date.now() - startTime;
      this.updateQueryStats(queryKey, executionTime);

      return result;
    } catch (error) {
      console.error('[DB] Query execution error:', error);
      throw error;
    }
  }

  /**
   * 読み取り専用接続を取得
   */
  private getReadConnection(): Database.Database {
    // 接続プールから利用可能な接続を返す
    return this.connectionPool[Math.floor(Math.random() * this.connectionPool.length)];
  }

  /**
   * クエリキー生成
   */
  private generateQueryKey(query: string, params: any[]): string {
    return `${query}:${JSON.stringify(params)}`;
  }

  /**
   * キャッシュされた結果を取得
   */
  private async getCachedResult<T>(key: string): Promise<T[] | null> {
    // 実装は api-cache.ts の globalCache を使用
    return null; // プレースホルダー
  }

  /**
   * 結果をキャッシュに保存
   */
  private async setCachedResult<T>(key: string, result: T[], ttl?: number): Promise<void> {
    // 実装は api-cache.ts の globalCache を使用
  }

  /**
   * クエリ統計更新
   */
  private updateQueryStats(queryKey: string, executionTime: number): void {
    this.stats.totalQueries++;
    
    if (executionTime > this.config.slowQueryThreshold) {
      this.stats.slowQueries++;
    }

    const existing = this.queryStats.get(queryKey);
    if (existing) {
      existing.count++;
      existing.totalTime += executionTime;
      existing.lastExecuted = Date.now();
    } else {
      this.queryStats.set(queryKey, {
        count: 1,
        totalTime: executionTime,
        lastExecuted: Date.now(),
      });
    }

    // 平均クエリ時間を更新
    const totalTime = Array.from(this.queryStats.values())
      .reduce((sum, stat) => sum + stat.totalTime, 0);
    this.stats.averageQueryTime = totalTime / this.stats.totalQueries;
  }

  /**
   * 統計情報更新
   */
  private updateStats(): void {
    try {
      // テーブル統計を更新
      this.updateTableStats();
      
      // インデックス使用状況を更新
      this.updateIndexUsage();

      // 接続プール統計を更新
      this.updateConnectionPoolStats();
    } catch (error) {
      console.error('[DB] Error updating stats:', error);
    }
  }

  /**
   * テーブル統計更新
   */
  private updateTableStats(): void {
    const tables = ['servers', 'secrets', 'users', 'jobs', 'audit_logs'];
    
    for (const table of tables) {
      try {
        const [rowCountResult] = this.db
          .prepare(`SELECT COUNT(*) as count FROM ${table}`)
          .all() as [{ count: number }];
        
        const [sizeResult] = this.db
          .prepare(`SELECT page_count * page_size as size FROM pragma_page_count('${table}'), pragma_page_size`)
          .all() as [{ size: number }];

        this.stats.tableStats[table] = {
          rowCount: rowCountResult.count,
          avgRowSize: rowCountResult.count > 0 ? sizeResult.size / rowCountResult.count : 0,
          totalSize: sizeResult.size,
          fragmentationLevel: 0, // SQLiteでは断片化レベルの計算は複雑
        };
      } catch (error) {
        console.error(`[DB] Error updating stats for table ${table}:`, error);
      }
    }
  }

  /**
   * インデックス使用状況更新
   */
  private updateIndexUsage(): void {
    try {
      const indexes = this.db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'")
        .all() as { name: string }[];

      for (const index of indexes) {
        // SQLiteではインデックス使用統計の直接取得は困難
        // 代替としてクエリプランを解析する方法もありますが、ここでは簡略化
        this.stats.indexUsage[index.name] = 0;
      }
    } catch (error) {
      console.error('[DB] Error updating index usage:', error);
    }
  }

  /**
   * 接続プール統計更新
   */
  private updateConnectionPoolStats(): void {
    this.stats.connectionPoolStats = {
      active: 0, // 実際の実装では接続の使用状況を追跡
      idle: this.connectionPool.length,
      total: this.connectionPool.length,
    };
  }

  /**
   * 古いクエリ統計削除
   */
  private cleanupQueryStats(): void {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24時間前
    let cleanedCount = 0;

    for (const [key, stat] of this.queryStats.entries()) {
      if (stat.lastExecuted < cutoffTime) {
        this.queryStats.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[DB] Cleaned up ${cleanedCount} old query statistics`);
    }
  }

  /**
   * データベースメンテナンス実行
   */
  async performMaintenance(): Promise<void> {
    console.log('[DB] Starting database maintenance...');

    try {
      // ANALYZE でクエリプランナー統計を更新
      this.db.exec('ANALYZE;');
      
      // VACUUM でデータベースを最適化
      this.db.exec('VACUUM;');
      
      // WALファイルをメインDBに統合
      this.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');

      console.log('[DB] Database maintenance completed successfully');
    } catch (error) {
      console.error('[DB] Database maintenance failed:', error);
    }
  }

  /**
   * インデックス最適化
   */
  async optimizeIndexes(): Promise<void> {
    if (!this.config.enableIndexOptimization) {
      return;
    }

    console.log('[DB] Starting index optimization...');

    try {
      // 重複インデックスの検出
      const duplicateIndexes = this.findDuplicateIndexes();
      
      // 未使用インデックスの検出
      const unusedIndexes = this.findUnusedIndexes();

      // レポート出力
      if (duplicateIndexes.length > 0) {
        console.warn('[DB] Found duplicate indexes:', duplicateIndexes);
      }

      if (unusedIndexes.length > 0) {
        console.warn('[DB] Found unused indexes:', unusedIndexes);
      }

      // 提案されたインデックスの作成
      await this.createSuggestedIndexes();

      console.log('[DB] Index optimization completed');
    } catch (error) {
      console.error('[DB] Index optimization failed:', error);
    }
  }

  /**
   * 重複インデックス検出
   */
  private findDuplicateIndexes(): string[] {
    // 簡略化された実装
    // 実際の実装では、インデックスの列構成を比較して重複を検出
    return [];
  }

  /**
   * 未使用インデックス検出
   */
  private findUnusedIndexes(): string[] {
    // 簡略化された実装
    // 実際の実装では、EXPLAIN QUERY PLANを使用してインデックス使用状況を分析
    return [];
  }

  /**
   * 提案されたインデックス作成
   */
  private async createSuggestedIndexes(): Promise<void> {
    const suggestedIndexes = [
      // 頻繁にクエリされる列にインデックスを作成
      'CREATE INDEX IF NOT EXISTS idx_servers_status ON servers(status)',
      'CREATE INDEX IF NOT EXISTS idx_servers_created_at ON servers(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_secrets_user_id ON secrets(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_jobs_status_created_at ON jobs(status, created_at)',
    ];

    for (const indexQuery of suggestedIndexes) {
      try {
        this.db.exec(indexQuery);
      } catch (error) {
        // インデックスが既に存在する場合などのエラーは無視
        if (!error.message?.includes('already exists')) {
          console.error('[DB] Error creating index:', error);
        }
      }
    }
  }

  /**
   * 統計情報取得
   */
  getStats(): DatabaseStats {
    this.updateStats();
    return { ...this.stats };
  }

  /**
   * スロークエリレポート取得
   */
  getSlowQueryReport(): Array<{
    query: string;
    count: number;
    averageTime: number;
    totalTime: number;
  }> {
    return Array.from(this.queryStats.entries())
      .map(([query, stats]) => ({
        query: query.split(':')[0], // パラメーターを除く
        count: stats.count,
        averageTime: stats.totalTime / stats.count,
        totalTime: stats.totalTime,
      }))
      .filter(item => item.averageTime > this.config.slowQueryThreshold)
      .sort((a, b) => b.averageTime - a.averageTime);
  }

  /**
   * クリーンアップ
   */
  async close(): Promise<void> {
    // メンテナンスタスクの停止
    // setIntervalで作成されたタイマーの停止は実装時に追加

    // 接続プールのクリーンアップ
    for (const connection of this.connectionPool) {
      connection.close();
    }

    // メインデータベース接続のクローズ
    this.db.close();

    console.log('[DB] Database connections closed');
  }
}

/**
 * グローバル データベース最適化マネージャー
 */
export const dbOptimizationManager = new DatabaseOptimizationManager(
  process.env.DATABASE_URL?.replace('file:', '') || './data/app.db',
  {
    enableQueryLogging: process.env.NODE_ENV === 'development',
    maxConnectionPoolSize: parseInt(process.env.DB_POOL_SIZE || '10'),
    enableQueryCache: process.env.NODE_ENV === 'production',
  }
);

/**
 * クエリビルダー最適化ヘルパー
 */
export class OptimizedQueryBuilder {
  /**
   * ページネーション最適化
   */
  static buildPaginatedQuery<T>(
    baseQuery: any,
    page: number,
    limit: number,
    sortBy?: string,
    sortOrder?: 'asc' | 'desc'
  ) {
    let query = baseQuery;

    // ソート追加
    if (sortBy) {
      const sortDirection = sortOrder === 'desc' ? desc : asc;
      query = query.orderBy(sortDirection(schema[sortBy as keyof typeof schema]));
    }

    // LIMIT と OFFSET 追加
    const offset = (page - 1) * limit;
    query = query.limit(limit).offset(offset);

    return query;
  }

  /**
   * 効率的な存在チェック
   */
  static async exists(
    table: any,
    condition: any
  ): Promise<boolean> {
    const result = await dbOptimizationManager.drizzleDb
      .select({ count: count() })
      .from(table)
      .where(condition)
      .limit(1);

    return result[0].count > 0;
  }

  /**
   * バッチ挿入最適化
   */
  static async batchInsert<T>(
    table: any,
    records: T[],
    batchSize: number = 100
  ): Promise<void> {
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      await dbOptimizationManager.drizzleDb
        .insert(table)
        .values(batch);
    }
  }
}