import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

/**
 * データベース接続管理クラス
 * SQLiteデータベースへの接続とクエリ実行を管理
 */
class DatabaseConnection {
  private static instance: DatabaseConnection;
  private db: Database.Database | null = null;
  private readonly dbPath: string;
  private readonly schemaPath: string;

  private constructor() {
    // 環境変数からデータベースパスを取得
    const databaseUrl = process.env.DATABASE_URL || 'sqlite:./data/app.db';
    this.dbPath = databaseUrl.replace('sqlite:', '');
    this.schemaPath = path.join(__dirname, 'schema.sql');

    // データディレクトリの作成
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  /**
   * シングルトンインスタンスの取得
   */
  public static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  /**
   * データベース接続の取得
   * 初回呼び出し時にデータベースを初期化
   */
  public getDatabase(): Database.Database {
    if (!this.db) {
      this.db = this.connect();
    }
    return this.db;
  }

  /**
   * データベースに接続
   */
  private connect(): Database.Database {
    try {
      // SQLiteデータベースに接続
      const db = new Database(this.dbPath, {
        verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
        fileMustExist: false,
      });

      // データベース設定の最適化
      this.configurateDatabase(db);

      // スキーマが存在しない場合は初期化
      this.initializeSchema(db);

      console.log(`✅ Database connected: ${this.dbPath}`);
      return db;
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      throw new DatabaseError('Failed to connect to database', { cause: error });
    }
  }

  /**
   * データベース設定の最適化
   */
  private configurateDatabase(db: Database.Database): void {
    try {
      // 外部キー制約を有効化
      db.pragma('foreign_keys = ON');

      // WALモードを有効化（並行読み取り性能向上）
      db.pragma('journal_mode = WAL');

      // 同期設定（パフォーマンスと安全性のバランス）
      db.pragma('synchronous = NORMAL');

      // キャッシュサイズ設定（10MB）
      db.pragma('cache_size = 10000');

      // 一時ファイルをメモリに保存
      db.pragma('temp_store = MEMORY');

      // 自動バキューム設定
      db.pragma('auto_vacuum = INCREMENTAL');

      // タイムアウト設定
      db.pragma('busy_timeout = 30000');

      console.log('✅ Database configuration applied');
    } catch (error) {
      console.error('❌ Database configuration failed:', error);
      throw new DatabaseError('Failed to configure database', { cause: error });
    }
  }

  /**
   * スキーマの初期化
   */
  private initializeSchema(db: Database.Database): void {
    try {
      // スキーマファイルの存在確認
      if (!fs.existsSync(this.schemaPath)) {
        throw new Error(`Schema file not found: ${this.schemaPath}`);
      }

      // 既存のテーブル確認
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
        .all() as Array<{ name: string }>;

      // スキーマが未初期化の場合のみ実行
      if (tables.length === 0) {
        console.log('🔧 Initializing database schema...');

        // スキーマファイルを読み込んで実行
        const schema = fs.readFileSync(this.schemaPath, 'utf8');
        db.exec(schema);

        console.log('✅ Database schema initialized');
      } else {
        console.log('✅ Database schema already exists');
      }

      // データベースの整合性チェック
      this.checkDatabaseIntegrity(db);
    } catch (error) {
      console.error('❌ Schema initialization failed:', error);
      throw new DatabaseError('Failed to initialize database schema', {
        cause: error,
      });
    }
  }

  /**
   * データベース整合性チェック
   */
  private checkDatabaseIntegrity(db: Database.Database): void {
    try {
      const result = db.pragma('integrity_check') as Array<{ integrity_check: string }>;

      if (result.length === 0 || result[0].integrity_check !== 'ok') {
        throw new Error('Database integrity check failed');
      }

      console.log('✅ Database integrity check passed');
    } catch (error) {
      console.error('❌ Database integrity check failed:', error);
      throw new DatabaseError('Database integrity check failed', {
        cause: error,
      });
    }
  }

  /**
   * マイグレーションの実行
   */
  public async runMigrations(migrationDir: string): Promise<void> {
    const db = this.getDatabase();

    try {
      // マイグレーションディレクトリの存在確認
      if (!fs.existsSync(migrationDir)) {
        console.log('📁 No migration directory found, skipping migrations');
        return;
      }

      // 現在のスキーマバージョンを取得
      const currentVersion = this.getCurrentSchemaVersion(db);
      console.log(`📊 Current schema version: ${currentVersion}`);

      // マイグレーションファイルを取得
      const migrationFiles = fs
        .readdirSync(migrationDir)
        .filter(file => file.endsWith('.sql'))
        .sort();

      let executedMigrations = 0;

      for (const file of migrationFiles) {
        const version = this.extractVersionFromFilename(file);
        if (version > currentVersion) {
          console.log(`🚀 Executing migration: ${file}`);

          const migrationPath = path.join(migrationDir, file);
          const migrationSql = fs.readFileSync(migrationPath, 'utf8');

          // トランザクション内でマイグレーションを実行
          const transaction = db.transaction(() => {
            db.exec(migrationSql);
            db.prepare(
              'INSERT INTO schema_migrations (version, description) VALUES (?, ?)'
            ).run(version, `Migration from ${file}`);
          });

          transaction();
          executedMigrations++;
        }
      }

      if (executedMigrations > 0) {
        console.log(`✅ Executed ${executedMigrations} migrations`);
      } else {
        console.log('✅ No new migrations to execute');
      }
    } catch (error) {
      console.error('❌ Migration execution failed:', error);
      throw new DatabaseError('Failed to execute migrations', { cause: error });
    }
  }

  /**
   * 現在のスキーマバージョンを取得
   */
  private getCurrentSchemaVersion(db: Database.Database): number {
    try {
      const result = db
        .prepare('SELECT MAX(version) as version FROM schema_migrations')
        .get() as { version: number } | undefined;

      return result?.version || 0;
    } catch {
      // schema_migrationsテーブルが存在しない場合
      return 0;
    }
  }

  /**
   * ファイル名からバージョン番号を抽出
   */
  private extractVersionFromFilename(filename: string): number {
    const match = filename.match(/^(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * データベース接続の閉じる
   */
  public close(): void {
    if (this.db) {
      try {
        this.db.close();
        this.db = null;
        console.log('✅ Database connection closed');
      } catch (error) {
        console.error('❌ Failed to close database connection:', error);
      }
    }
  }

  /**
   * データベースの最適化（定期メンテナンス用）
   */
  public optimize(): void {
    const db = this.getDatabase();

    try {
      console.log('🔧 Optimizing database...');

      // インクリメンタルバキューム
      db.pragma('incremental_vacuum');

      // 統計情報の更新
      db.exec('ANALYZE');

      // WALファイルのチェックポイント
      db.pragma('wal_checkpoint(TRUNCATE)');

      console.log('✅ Database optimization completed');
    } catch (error) {
      console.error('❌ Database optimization failed:', error);
      throw new DatabaseError('Failed to optimize database', { cause: error });
    }
  }

  /**
   * バックアップの作成
   */
  public async backup(backupPath: string): Promise<void> {
    const db = this.getDatabase();

    try {
      console.log(`🔄 Creating database backup: ${backupPath}`);

      // バックアップディレクトリの作成
      const backupDir = path.dirname(backupPath);
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      // SQLiteのbackup APIを使用
      await new Promise<void>((resolve, reject) => {
        const backup = db.backup(backupPath);

        backup.then(() => {
          console.log('✅ Database backup completed');
          resolve();
        }).catch((error) => {
          console.error('❌ Database backup failed:', error);
          reject(new DatabaseError('Failed to create database backup', { cause: error }));
        });
      });
    } catch (error) {
      console.error('❌ Database backup failed:', error);
      throw error;
    }
  }

  /**
   * ヘルスチェック
   */
  public healthCheck(): DatabaseHealthStatus {
    try {
      const db = this.getDatabase();

      // 基本的な接続チェック
      const startTime = Date.now();
      const testResult = db.prepare('SELECT 1 as test').get() as { test: number };
      const responseTime = Date.now() - startTime;

      if (testResult.test !== 1) {
        throw new Error('Database query test failed');
      }

      // データベース情報の取得
      const dbSize = fs.statSync(this.dbPath).size;
      const tableCount = db.prepare(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'"
      ).get() as { count: number };

      return {
        status: 'healthy',
        responseTime,
        dbSize,
        tableCount: tableCount.count,
        path: this.dbPath,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : String(error),
        path: this.dbPath,
      };
    }
  }
}

/**
 * データベース固有のエラークラス
 */
export class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly options?: { cause?: unknown; code?: string }
  ) {
    super(message);
    this.name = 'DatabaseError';
    this.cause = options?.cause;
  }
}

/**
 * データベースヘルスチェック結果の型
 */
export interface DatabaseHealthStatus {
  status: 'healthy' | 'unhealthy';
  responseTime?: number;
  dbSize?: number;
  tableCount?: number;
  path: string;
  error?: string;
}

// シングルトンインスタンスをエクスポート
export const database = DatabaseConnection.getInstance();

// 個別の関数もエクスポート（便利関数として）
export const getDatabase = () => database.getDatabase();
export const closeDatabase = () => database.close();
export const optimizeDatabase = () => database.optimize();
export const backupDatabase = (path: string) => database.backup(path);
export const checkDatabaseHealth = () => database.healthCheck();

// プロセス終了時にデータベース接続を閉じる
if (typeof process !== 'undefined') {
  process.on('exit', () => database.close());
  process.on('SIGINT', () => {
    database.close();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    database.close();
    process.exit(0);
  });
}