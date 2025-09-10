#!/bin/bash
set -e

echo "🚀 データベース初期化を開始します..."

# データベースディレクトリの準備（エラー対応強化）
echo "📁 データベースディレクトリの準備..."
mkdir -p /app/data

# 権限設定をしてからアクセスを試行（エラー無視）
chown 1000:1000 /app/data 2>/dev/null || echo "所有者変更をスキップ（権限制限）"
chmod 777 /app/data 2>/dev/null || echo "権限変更をスキップ（権限制限）"

# データベースファイルの作成（存在しない場合のみ）
if [ ! -f /app/data/app.db ]; then
  echo "📄 データベースファイルを作成..."
  touch /app/data/app.db
  chown 1000:1000 /app/data/app.db || echo "ファイル所有者変更をスキップ"
  chmod 664 /app/data/app.db
else
  echo "✅ データベースファイルは既に存在します"
fi

# マイグレーションの実行（権限を調整してから実行）
echo "🔄 データベースマイグレーションを実行..."
export DATABASE_URL=file:/app/data/app.db

# データベースファイルが存在しない場合は作成
if [ ! -f /app/data/app.db ]; then
  echo "空のデータベースファイルを作成..."
  touch /app/data/app.db
fi

# 全てのユーザーがアクセス可能にする（権限エラー対応）
chmod 666 /app/data/app.db 2>/dev/null || echo "ファイル権限設定をスキップ（権限制限）"
chmod 777 /app/data 2>/dev/null || echo "ディレクトリ権限設定をスキップ（権限制限）"

# データベースファイルが読み書き可能かテスト
if [ -r /app/data/app.db ] && [ -w /app/data/app.db ]; then
  echo "✅ データベースファイルアクセス確認済み"
else
  echo "⚠️  データベースファイルアクセスに制限があります"
fi

# マイグレーション実行
npx drizzle-kit push --force

# 初期データの投入（オプション）
if [ "${SEED_DATABASE:-}" = "true" ]; then
  echo "🌱 初期データを投入..."
  npm run db:seed
fi

echo "✅ データベース初期化が完了しました"
