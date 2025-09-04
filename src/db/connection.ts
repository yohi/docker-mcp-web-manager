import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

// データベースファイルのパス
const DB_PATH = process.env.DB_PATH || './data/database.sqlite';

// グローバルでデータベース接続を管理
let db: Database.Database | undefined;
let drizzleDb: ReturnType<typeof drizzle> | undefined;

/**
 * SQLiteデータベース接続を初期化します
 */
export function initializeDatabase(): ReturnType<typeof drizzle> {
  if (drizzleDb) {
    return drizzleDb;
  }

  // better-sqlite3のインスタンスを作成
  db = new Database(DB_PATH);

  // 外部キー制約を有効化
  db.pragma('foreign_keys = ON');

  // WALモードを有効化（パフォーマンス向上）
  db.pragma('journal_mode = WAL');

  // 適切な同期レベルを設定
  db.pragma('synchronous = NORMAL');

  // タイムアウトを設定
  db.pragma('busy_timeout = 5000');

  // Drizzle ORMインスタンスを作成
  drizzleDb = drizzle(db, { schema });

  return drizzleDb;
}

/**
 * データベース接続を取得します
 */
export function getDatabase(): ReturnType<typeof drizzle> {
  if (!drizzleDb) {
    return initializeDatabase();
  }
  return drizzleDb;
}

/**
 * データベース接続をクリーンアップします
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = undefined;
    drizzleDb = undefined;
  }
}

/**
 * データベースの健康状態をチェックします
 */
export function checkDatabaseHealth(): boolean {
  try {
    if (!db) {
      return false;
    }

    // 簡単なクエリを実行してデータベースが応答するかチェック
    const result = db.prepare('SELECT 1 as health').get() as { health: number };
    return result?.health === 1;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

// プロセス終了時のクリーンアップ
process.on('exit', () => {
  closeDatabase();
});

process.on('SIGINT', () => {
  closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', () => {
  closeDatabase();
  process.exit(0);
});