// データベース関連の統合エクスポート
export * from './schema';
export * from './connection';
export * from './migrations';
export * from './repositories';

// 主要な関数のエイリアス
export { getDatabase as db } from './connection';
export { initializeDatabase } from './connection';
export { getServerRepository, getJobRepository } from './repositories';

// 初期化とセットアップのヘルパー関数
import { initializeDatabase } from './connection';
import { createTablesManually, createIndexes } from './migrations';
import { runMigrations } from './migrations';

/**
 * データベースの完全初期化
 * アプリケーション起動時に呼び出す
 */
export async function setupDatabase(): Promise<void> {
  try {
    console.log('データベースセットアップを開始...');
    
    // データベース接続を初期化
    initializeDatabase();
    
    try {
      // Drizzle-kitマイグレーションを試行
      await runMigrations();
    } catch (migrationError) {
      console.warn('Drizzle-kitマイグレーションが失敗しました、手動セットアップにフォールバック:', migrationError);
      
      // フォールバック: 手動でテーブルを作成
      await createTablesManually();
    }
    
    console.log('データベースセットアップ完了');
  } catch (error) {
    console.error('データベースセットアップ中にエラーが発生しました:', error);
    throw error;
  }
}