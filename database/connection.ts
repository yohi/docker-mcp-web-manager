// database/connection.ts
// データベース接続とSQLite最適化設定

import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

// データベースファイルのパス
const DATABASE_PATH = process.env.DATABASE_PATH || './data/app.db';

// SQLiteデータベースインスタンスの作成
const sqlite = new Database(DATABASE_PATH);

// SQLite最適化設定の適用
export function optimizeSQLite() {
  // 外部キー制約の有効化（セキュリティ向上）
  sqlite.pragma('foreign_keys = ON');
  
  // WALモードの有効化（同時アクセス性能向上）
  sqlite.pragma('journal_mode = WAL');
  
  // 同期設定（パフォーマンスと安全性のバランス）
  sqlite.pragma('synchronous = NORMAL');
  
  // キャッシュサイズの最適化
  sqlite.pragma('cache_size = -64000'); // 64MB
  
  // テンポラリファイルをメモリに保存
  sqlite.pragma('temp_store = MEMORY');
  
  // ページサイズの最適化
  sqlite.pragma('page_size = 4096');
  
  // 自動バキュームの有効化
  sqlite.pragma('auto_vacuum = INCREMENTAL');
  
  // 接続タイムアウトの設定
  sqlite.pragma('busy_timeout = 30000'); // 30秒
  
  console.log('SQLite optimization settings applied');
}

// 最適化設定を適用
optimizeSQLite();

// Drizzle ORMインスタンスの作成
export const db = drizzle(sqlite, { schema });

// マイグレーション実行関数
export async function runMigrations() {
  try {
    console.log('Running database migrations...');
    migrate(db, { migrationsFolder: './database/migrations' });
    console.log('Database migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

// データベース接続のテスト
export function testConnection() {
  try {
    const result = sqlite.prepare('SELECT 1 as test').get() as { test: number };
    if (result.test === 1) {
      console.log('Database connection test successful');
      return true;
    }
    return false;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}

// データベース統計情報の取得
export function getDatabaseStats() {
  try {
    const stats = {
      pageCount: sqlite.pragma('page_count', { simple: true }) as number,
      pageSize: sqlite.pragma('page_size', { simple: true }) as number,
      freelistCount: sqlite.pragma('freelist_count', { simple: true }) as number,
      cacheSize: sqlite.pragma('cache_size', { simple: true }) as number,
      journalMode: sqlite.pragma('journal_mode', { simple: true }) as string,
      foreignKeys: sqlite.pragma('foreign_keys', { simple: true }) as number,
    };
    
    return {
      ...stats,
      totalSize: stats.pageCount * stats.pageSize,
      usedSize: (stats.pageCount - stats.freelistCount) * stats.pageSize,
    };
  } catch (error) {
    console.error('Failed to get database stats:', error);
    return null;
  }
}

// データベースの最適化（VACUUM）
export function optimizeDatabase() {
  try {
    console.log('Starting database optimization...');
    sqlite.pragma('incremental_vacuum');
    console.log('Database optimization completed');
  } catch (error) {
    console.error('Database optimization failed:', error);
    throw error;
  }
}

// 接続のクリーンアップ
export function closeConnection() {
  try {
    sqlite.close();
    console.log('Database connection closed');
  } catch (error) {
    console.error('Error closing database connection:', error);
  }
}

// プロセス終了時のクリーンアップ
process.on('SIGINT', closeConnection);
process.on('SIGTERM', closeConnection);
