#!/usr/bin/env node

/**
 * データベースマイグレーションスクリプト
 * データベースの初期化とマイグレーションを実行
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// TypeScriptファイルをコンパイルしてから実行
const isTS = process.env.NODE_ENV === 'development' && fs.existsSync('tsconfig.json');

async function main() {
  console.log('🚀 Starting database migration...\n');

  try {
    // TypeScript環境の場合はts-nodeを使用
    if (isTS) {
      console.log('📦 Using TypeScript environment...');
      // ts-nodeがインストールされているか確認
      try {
        require.resolve('ts-node');
        require('ts-node/register');
      } catch (error) {
        console.log('⚠️  ts-node not found, compiling TypeScript first...');
        execSync('npm run build', { stdio: 'inherit' });
      }
    }

    // データベース接続クラスをインポート
    const { database } = require('../src/lib/database/connection');

    // データベース接続とスキーマ初期化
    console.log('🔌 Connecting to database...');
    const db = database.getDatabase();
    console.log('✅ Database connected successfully');

    // マイグレーションディレクトリのパス
    const migrationDir = path.join(__dirname, '..', 'src', 'lib', 'database', 'migrations');

    // マイグレーション実行
    console.log('🔧 Running migrations...');
    await database.runMigrations(migrationDir);

    // データベース最適化
    console.log('⚡ Optimizing database...');
    database.optimize();

    // ヘルスチェック
    console.log('🏥 Running health check...');
    const healthStatus = database.healthCheck();

    if (healthStatus.status === 'healthy') {
      console.log('✅ Database health check passed');
      console.log(`   - Response time: ${healthStatus.responseTime}ms`);
      console.log(`   - Database size: ${formatBytes(healthStatus.dbSize || 0)}`);
      console.log(`   - Table count: ${healthStatus.tableCount}`);
      console.log(`   - Database path: ${healthStatus.path}`);
    } else {
      console.error('❌ Database health check failed:', healthStatus.error);
      process.exit(1);
    }

    console.log('\n🎉 Database migration completed successfully!');
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    if (error.cause) {
      console.error('   Cause:', error.cause.message || error.cause);
    }
    process.exit(1);
  }
}

/**
 * バイト数を人間が読みやすい形式にフォーマット
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// スクリプトが直接実行された場合のみメイン関数を実行
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}

module.exports = { main };