# Multi-stage build for Docker MCP Web Manager
FROM node:18-alpine AS base

# 作業ディレクトリの設定
WORKDIR /app

# 依存関係のインストール（キャッシュの最適化）
FROM base AS deps
# セキュリティ更新
RUN apk add --no-cache libc6-compat

# 依存関係ファイルのコピー
COPY package.json package-lock.json* ./

# 依存関係のインストール
RUN npm ci --only=production && npm cache clean --force

# 開発用依存関係のビルダー段階
FROM base AS builder
COPY package.json package-lock.json* ./
RUN npm ci

# ソースコードのコピー
COPY . .

# 環境変数の設定
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# ビルドの実行
RUN npm run build

# 本番環境用イメージ
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# セキュリティ：非特権ユーザーの作成
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 必要なファイルのコピー
COPY --from=builder /app/public ./public

# パフォーマンス最適化：standalone出力を使用
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# データディレクトリの作成と権限設定
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

# 非特権ユーザーに切り替え
USER nextjs

# ポートの公開
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node --eval "require('http').get('http://localhost:3000/api/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# アプリケーションの起動
CMD ["node", "server.js"]