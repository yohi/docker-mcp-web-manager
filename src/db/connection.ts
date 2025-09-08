import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sql } from 'drizzle-orm';
import * as schema from './schema';

// データベース接続の設定
const DATABASE_URL = process.env.DATABASE_URL || 'file:/app/data/app.db';

// SQLiteデータベースのインスタンス作成
const sqlite = new Database(DATABASE_URL.replace('file:', ''), {
  verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
});

// SQLiteのパフォーマンスとセキュリティ設定
sqlite.exec(`
  -- 外部キー制約を有効化（セキュリティ強化）
  PRAGMA foreign_keys = ON;
  
  -- WALモードを有効化（パフォーマンス向上）
  PRAGMA journal_mode = WAL;
  
  -- 書き込み専用原則のためのbusyタイムアウト設定
  PRAGMA busy_timeout = 30000;
  
  -- パフォーマンス最適化設定
  PRAGMA synchronous = NORMAL;
  PRAGMA cache_size = -64000;
  PRAGMA temp_store = MEMORY;
  PRAGMA mmap_size = 268435456;
  
  -- セキュリティ設定
  PRAGMA secure_delete = ON;
`);

// Drizzle ORM インスタンス作成
export const db = drizzle(sqlite, {
  schema,
  logger: process.env.NODE_ENV === 'development',
});

// データベース接続ヘルスチェック
export async function healthCheck(): Promise<{
  status: 'healthy' | 'unhealthy';
  message: string;
  timestamp: Date;
}> {
  try {
    // 基本的な接続テスト
    const result = await db
      .select({ test: sql`1` })
      .from(schema.servers)
      .limit(1)
      .execute();

    return {
      status: 'healthy',
      message: 'Database connection is healthy',
      timestamp: new Date(),
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      timestamp: new Date(),
    };
  }
}

// データベース初期化関数
export async function initializeDatabase(): Promise<void> {
  try {
    // データディレクトリの存在確認
    console.log('Initializing database...');
    
    // WALモードとforeign_keysの再確認
    sqlite.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
    `);

    console.log('Database initialization completed successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
}

// データベースクリーンアップ関数（プロセス終了時に呼び出し）
export function closeDatabase(): void {
  try {
    sqlite.close();
    console.log('Database connection closed successfully');
  } catch (error) {
    console.error('Error closing database connection:', error);
  }
}

// プロセス終了時の自動クリーンアップ
process.on('exit', closeDatabase);
process.on('SIGINT', () => {
  closeDatabase();
  process.exit(0);
});
process.on('SIGTERM', () => {
  closeDatabase();
  process.exit(0);
});

export { sqlite };
export default db;