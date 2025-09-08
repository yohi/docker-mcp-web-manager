import { FullConfig } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Playwright グローバルティアダウン
 * テスト実行後のクリーンアップ処理
 */
async function globalTeardown(config: FullConfig) {
  console.log('🧹 E2Eテスト環境をクリーンアップ中...');

  try {
    // 認証状態ファイルをクリーンアップ
    cleanupAuthFiles();
    
    // テストファイルをクリーンアップ
    cleanupTestFiles();
    
    console.log('✅ E2Eテスト環境のクリーンアップが完了しました');
  } catch (error) {
    console.error('❌ E2Eテスト環境のクリーンアップに失敗しました:', error);
  }
}

/**
 * 認証状態ファイルのクリーンアップ
 */
function cleanupAuthFiles() {
  const authDir = path.join(__dirname, '.auth');
  
  if (fs.existsSync(authDir)) {
    const authFiles = fs.readdirSync(authDir);
    
    for (const file of authFiles) {
      const filePath = path.join(authDir, file);
      try {
        fs.unlinkSync(filePath);
        console.log(`🗑️  認証ファイルを削除: ${file}`);
      } catch (error) {
        console.warn(`⚠️  認証ファイルの削除に失敗: ${file}`, error);
      }
    }
    
    try {
      fs.rmdirSync(authDir);
      console.log('🗑️  認証ディレクトリを削除');
    } catch (error) {
      console.warn('⚠️  認証ディレクトリの削除に失敗', error);
    }
  }
}

/**
 * テストファイルのクリーンアップ
 */
function cleanupTestFiles() {
  const filesToCleanup = [
    'test.db',
    'test.db-journal',
    'test.db-shm',
    'test.db-wal',
  ];

  for (const file of filesToCleanup) {
    const filePath = path.join(process.cwd(), file);
    
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log(`🗑️  テストファイルを削除: ${file}`);
      } catch (error) {
        console.warn(`⚠️  テストファイルの削除に失敗: ${file}`, error);
      }
    }
  }

  // テスト結果ディレクトリのクリーンアップ（オプション）
  const testResultsDir = path.join(process.cwd(), 'test-results');
  if (fs.existsSync(testResultsDir) && process.env.CLEANUP_TEST_RESULTS === 'true') {
    try {
      fs.rmSync(testResultsDir, { recursive: true, force: true });
      console.log('🗑️  テスト結果ディレクトリを削除');
    } catch (error) {
      console.warn('⚠️  テスト結果ディレクトリの削除に失敗', error);
    }
  }
}

export default globalTeardown;