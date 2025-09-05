#!/usr/bin/env node

/**
 * データベースリセットスクリプト
 * 開発環境でデータベースを完全にリセットする
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// 環境チェック
const isProduction = process.env.NODE_ENV === 'production';

async function main() {
  console.log('⚠️  Database Reset Script\n');

  // 本番環境では実行を拒否
  if (isProduction) {
    console.error('❌ This script cannot be run in production environment!');
    process.exit(1);
  }

  // ユーザー確認
  const confirmed = await confirmReset();
  if (!confirmed) {
    console.log('🚫 Database reset cancelled.');
    return;
  }

  try {
    // データベースファイルのパスを取得
    const databaseUrl = process.env.DATABASE_URL || 'sqlite:./data/app.db';
    const dbPath = databaseUrl.replace('sqlite:', '');
    const absoluteDbPath = path.resolve(dbPath);

    console.log(`🗂️  Database path: ${absoluteDbPath}`);

    // データベースファイルが存在するか確認
    if (fs.existsSync(absoluteDbPath)) {
      console.log('🗑️  Removing existing database file...');
      fs.unlinkSync(absoluteDbPath);
      console.log('✅ Database file removed');
    } else {
      console.log('ℹ️  Database file does not exist');
    }

    // WALファイルとSHMファイルも削除
    const walPath = `${absoluteDbPath}-wal`;
    const shmPath = `${absoluteDbPath}-shm`;

    if (fs.existsSync(walPath)) {
      fs.unlinkSync(walPath);
      console.log('✅ WAL file removed');
    }

    if (fs.existsSync(shmPath)) {
      fs.unlinkSync(shmPath);
      console.log('✅ SHM file removed');
    }

    // データベースを再初期化
    console.log('\n🔄 Reinitializing database...');
    const { main: migrate } = require('./migrate');
    await migrate();

    console.log('\n🎉 Database reset completed successfully!');
    console.log('\n💡 Next steps:');
    console.log('   1. Run `npm run db:seed` to add sample data');
    console.log('   2. Start the development server with `npm run dev`');

  } catch (error) {
    console.error('\n❌ Database reset failed:', error.message);
    if (error.cause) {
      console.error('   Cause:', error.cause.message || error.cause);
    }
    process.exit(1);
  }
}

/**
 * ユーザーに確認を求める
 */
async function confirmReset() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log('⚠️  This will completely remove all data from the database!');
    console.log('   - All servers will be deleted');
    console.log('   - All configurations will be lost');
    console.log('   - All user data will be removed');
    console.log('   - All test results will be deleted\n');

    rl.question('Are you sure you want to continue? (yes/no): ', (answer) => {
      rl.close();
      const confirmed = answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y';
      resolve(confirmed);
    });
  });
}

// スクリプトが直接実行された場合のみメイン関数を実行
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}

module.exports = { main };