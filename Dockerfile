# Multi-stage Dockerfile for Docker MCP Web Manager
# Node.js 24.7.0 Alpine base image for minimal footprint

# Stage 1: Dependencies (開発・ビルド時の依存関係)
FROM node:24.7.0-alpine AS deps
WORKDIR /app

# Alpine Linuxでのbetter-sqlite3ビルドに必要な依存関係をインストール
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    linux-headers \
    build-base

# package.json と package-lock.json をコピー（キャッシュ最適化）
COPY package*.json ./

# 依存関係をインストール
RUN npm ci --only=production --omit=dev

# Stage 2: Builder (アプリケーションのビルド)
FROM node:24.7.0-alpine AS builder
WORKDIR /app

# Alpine Linuxでのbetter-sqlite3ビルドに必要な依存関係をインストール
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    linux-headers \
    build-base

# package.json をコピー
COPY package*.json ./

# 開発用依存関係を含めてインストール
RUN npm ci

# ソースコードをコピー
COPY . .
COPY .env.example .env.local

# TypeScript型チェックとビルド
RUN npm run type-check
RUN npm run build

# Stage 3: Development (開発環境)
FROM node:24.7.0-alpine AS development
WORKDIR /app

# Alpine Linuxでのbetter-sqlite3ビルドに必要な依存関係をインストール
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    linux-headers \
    build-base \
    sqlite

# 開発用の非rootユーザーを作成
RUN addgroup -g 1000 -S appuser && \
    adduser -u 1000 -S appuser -G appuser

# パッケージファイルをコピーして依存関係をインストール
COPY package*.json ./
RUN npm ci

# ソースコードをコピー
COPY . .
COPY .env.example .env.local

# データディレクトリを作成し、権限を設定
RUN mkdir -p /app/data && \
    chown -R appuser:appuser /app && \
    chmod -R 755 /app

USER appuser

# 開発用ポートを公開
EXPOSE 3000

# 開発サーバーを起動（ホットリロード対応）
CMD ["npm", "run", "dev"]

# Stage 4: Production (本番環境)
FROM node:24.7.0-alpine AS production
WORKDIR /app

# 本番環境で必要な最小限のパッケージをインストール
RUN apk add --no-cache \
    sqlite \
    curl \
    dumb-init

# 本番用の非rootユーザーを作成
RUN addgroup -g 1000 -S appuser && \
    adduser -u 1000 -S appuser -G appuser

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
    chown -R appuser:appuser /app && \
    chmod -R 755 /app

# セキュリティ強化: 不要な権限を削除
USER appuser

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