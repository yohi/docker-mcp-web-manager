#!/bin/bash
set -e

echo "🚀 データベース初期化を開始します..."

# データベースディレクトリの準備（rootユーザーで実行）
echo "📁 データベースディレクトリの準備..."
mkdir -p /app/data
chown 1000:1000 /app/data || echo "所有者変更をスキップ"
chmod 755 /app/data

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

# 全てのユーザーがアクセス可能にする（一時的解決策）
chmod 666 /app/data/app.db || echo "ファイル権限設定をスキップ"
chmod 777 /app/data || echo "ディレクトリ権限設定をスキップ"

# マイグレーション実行
npx drizzle-kit push --force

# 初期データの投入（オプション）
if [ "${SEED_DATABASE:-}" = "true" ]; then
  echo "🌱 初期データを投入..."
  npm run db:seed
fi

echo "✅ データベース初期化が完了しました"