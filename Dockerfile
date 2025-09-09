# Multi-stage Dockerfile for Docker MCP Web Manager
# 戦略: Ubuntu/Debianベースでbetter-sqlite3をビルドし、軽量Alpineにコピー

# Stage 1: Builder (Ubuntu/Debianベースで依存関係とビルド)
FROM node:20-bookworm AS builder
WORKDIR /app

# システム依存関係をインストール（better-sqlite3ビルド用）
RUN apt-get update && apt-get install -y \
    sqlite3 \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# package.json をコピー
COPY package*.json ./

# 全依存関係をインストール（better-sqlite3含む）
RUN npm install --legacy-peer-deps

# better-sqlite3のビルドテスト
RUN node -e "console.log('Testing better-sqlite3...'); const db = require('better-sqlite3')(':memory:'); console.log('better-sqlite3 build successful!');"

# Stage 2: Production Dependencies（本番用依存関係のみ）
FROM node:20-bookworm AS prod-deps
WORKDIR /app

# システム依存関係をインストール
RUN apt-get update && apt-get install -y \
    sqlite3 \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# package.json をコピー
COPY package*.json ./

# 本番用依存関係のみインストール
RUN npm install --only=production --legacy-peer-deps

# Stage 3: Development (Ubuntu/Debianベース - ビルドと実行環境を統一)
FROM node:20-bookworm-slim AS development
WORKDIR /app

# 軽量システム依存関係をインストール（better-sqlite3実行に必要）
RUN apt-get update && apt-get install -y --no-install-recommends \
    sqlite3 \
    curl \
    dumb-init \
    && rm -rf /var/lib/apt/lists/*

# ビルド済みnode_modulesをコピー（同じLinux環境なので互換性あり）
COPY --from=builder /app/node_modules ./node_modules

# パッケージファイルをコピー
COPY package*.json ./

# ソースコードをコピー
COPY . .
COPY .env.example .env.local

# スクリプトディレクトリに実行権限を付与
RUN chmod +x /app/scripts/*.sh

# better-sqlite3の動作テスト
RUN node -e "console.log('Testing better-sqlite3 in Debian...'); const db = require('better-sqlite3')(':memory:'); console.log('better-sqlite3 works in Debian!');"

# データディレクトリを作成し、権限を設定（rootユーザーで実行）
RUN mkdir -p /app/data && \
    chown -R node:node /app && \
    chmod -R 755 /app && \
    chmod 777 /app/data

# ユーザー切り替え前にnodeユーザーでアクセス可能な状態を確保
USER node

# nodeユーザーでデータベースファイルの作成テスト
RUN touch /app/data/test.db && rm /app/data/test.db && echo "データベースディレクトリへの書き込み権限確認完了"

# 開発用ポートを公開
EXPOSE 3000

# 開発サーバーを起動（ホットリロード対応）
CMD ["npm", "run", "dev"]

# Stage 4: Production (本番環境)
FROM node:20-alpine AS production
WORKDIR /app

# 本番環境で必要な最小限のパッケージをインストール
RUN apk add --no-cache \
    sqlite \
    curl \
    dumb-init

# 本番用依存関係をコピー
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# 必要なファイルをコピー
COPY package*.json ./
COPY next.config.js ./
COPY drizzle.config.ts ./

# データディレクトリを作成し、権限を設定
RUN mkdir -p /app/data && \
    chown -R node:node /app && \
    chmod -R 755 /app

# セキュリティ強化: 不要な権限を削除
USER node

# ヘルスチェック設定
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=40s \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# 本番用ポートを公開
EXPOSE 3000

# 環境変数を設定
ENV NODE_ENV=production
ENV PORT=3000

# dumb-initを使用してプロセスを安全に管理
ENTRYPOINT ["dumb-init", "--"]

# 本番サーバーを起動
CMD ["npm", "start"]