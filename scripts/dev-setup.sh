#!/bin/bash
# 開発環境セットアップスクリプト

set -e

echo "🚀 Docker MCP Web Manager v2 - 開発環境セットアップ"

# 必要なサービスのみ起動（Redis、SQLite）
echo "📦 必要なサービスを起動中..."
docker-compose -f docker-compose.dev.yml up -d

# データベースディレクトリを作成
echo "🗄️ データベース初期化中..."
mkdir -p data
touch data/app.db

# 環境変数ファイルを確認・作成
echo "⚙️ 環境設定を確認中..."
if [ ! -f .env.local ]; then
    cp .env.example .env.local
    echo "✅ .env.local を作成しました"
fi

# 依存関係の確認（ローカル環境）
echo "📋 依存関係を確認中..."
if [ ! -d "node_modules" ]; then
    echo "🔧 依存関係をインストール中..."
    npm install --legacy-peer-deps
fi

# データベースマイグレーション（必要に応じて）
echo "🔄 データベース設定中..."
npm run db:push || echo "⚠️ データベース設定は後で手動実行してください"

echo "✅ 開発環境のセットアップが完了しました!"
echo ""
echo "🎯 次のステップ:"
echo "   1. npm run dev    # 開発サーバー起動"
echo "   2. http://localhost:3000 でアクセス"
echo ""
echo "🛠️ Docker管理コマンド:"
echo "   docker-compose -f docker-compose.dev.yml logs   # ログ確認"
echo "   docker-compose -f docker-compose.dev.yml down   # サービス停止"