# =================================================================
#  Stage 1: Builder
#  - 役割: 依存関係のインストールとNext.jsアプリのビルド
#  - コンテキスト: Node.js 24、ビルドツール群、better-sqlite3
# =================================================================
FROM node:24-slim AS builder

# ビルドに必要なツールをインストール (明確な指示)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    libsqlite3-dev \
    ca-certificates \
    curl \
    coreutils \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

WORKDIR /usr/src/app

# package.jsonとpackage-lock.jsonをコピー
COPY package*.json ./

# npm設定最適化（効率的戦略）
RUN npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-retries 5 && \
    npm config set registry https://registry.npmjs.org/

# 依存関係を一括インストール（タイムアウト対策）
RUN timeout 600 npm ci --legacy-peer-deps --prefer-offline --progress=false --no-optional || \
    (echo "npm ci タイムアウト、fallbackでnpm installを実行..." && \
     npm install --legacy-peer-deps --prefer-offline --progress=false --no-optional)

# アプリケーションソースをコピー
COPY . .

# Next.jsアプリケーションをビルド（ダミー環境変数でビルド時エラーを回避）
ENV NEXTAUTH_SECRET="dummy-build-secret-for-docker-build-only-32chars" \
    NEXTAUTH_URL="http://localhost:3000" \
    JWT_SECRET="dummy-jwt-secret-for-docker-build-only-very-long-secret" \
    DATABASE_URL="file:./dev.db"
RUN npm run build

# better-sqlite3の動作確認
RUN node -e "const Database = require('better-sqlite3'); console.log('✅ better-sqlite3 build successful:', typeof Database === 'function')"

# =================================================================
#  Stage 2: Runner (Development)
#  - 役割: 開発環境でのアプリケーション実行
#  - コンテキスト: 軽量なNode.js 24環境、Bitwarden CLI統合
# =================================================================
FROM node:24-slim AS development

WORKDIR /usr/src/app

# 実行時に必要な最小パッケージ（Bitwarden CLI含む）
RUN apt-get update && apt-get install -y \
    dumb-init \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Bitwarden CLI のインストール（npm経由）
RUN npm install -g @bitwarden/cli || echo "Bitwarden CLI installation failed, but continuing..."

# ビルダーからビルド済みのnode_modulesをコピー
COPY --from=builder /usr/src/app/node_modules ./node_modules
# ビルダーから.nextビルド結果をコピー
COPY --from=builder /usr/src/app/.next ./.next
# アプリケーションファイルをコピー
COPY --from=builder /usr/src/app/package.json ./package.json
COPY --from=builder /usr/src/app/next.config.js ./next.config.js
COPY --from=builder /usr/src/app/tailwind.config.js ./tailwind.config.js
COPY --from=builder /usr/src/app/postcss.config.js ./postcss.config.js
COPY --from=builder /usr/src/app/postcss.config.mjs ./postcss.config.mjs
COPY --from=builder /usr/src/app/tsconfig.json ./tsconfig.json
COPY --from=builder /usr/src/app/public ./public
COPY --from=builder /usr/src/app/src ./src

# 環境設定
RUN cp .env.example .env.local || echo "No .env.example found"

# ユーザー・権限設定 (セキュリティのベストプラクティス)
RUN addgroup --gid 1001 --system nodejs && \
    adduser --system --uid 1001 --ingroup nodejs nextjs && \
    mkdir -p /usr/src/app/data && \
    mkdir -p /home/nextjs/.config && \
    chown -R nextjs:nodejs /usr/src/app && \
    chown -R nextjs:nodejs /home/nextjs && \
    chmod -R 755 /usr/src/app && \
    chmod -R 755 /home/nextjs

# Bitwarden CLIへのアクセス権限設定（既存ファイル対応）
RUN rm -f /usr/local/bin/bw && \
    if [ -f /usr/local/lib/node_modules/@bitwarden/cli/build/bw.js ]; then \
        ln -s /usr/local/lib/node_modules/@bitwarden/cli/build/bw.js /usr/local/bin/bw && \
        chmod +x /usr/local/bin/bw; \
    else \
        echo "Bitwarden CLI not found, skipping symlink creation"; \
    fi

USER nextjs
EXPOSE 3000

ENV NODE_ENV=development
ENV HOME=/home/nextjs

# 開発サーバー起動
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "dev"]

# =================================================================
#  Stage 3: Runner (Production)
#  - 役割: 本番環境でのアプリケーション実行
#  - コンテキスト: 最小限の実行環境
# =================================================================
FROM node:24-slim AS production

WORKDIR /usr/src/app

# 実行時に必要な最小パッケージ
RUN apt-get update && apt-get install -y \
    dumb-init \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 本番用にnode_modules (productionのみ) をコピー
COPY --from=builder /usr/src/app/node_modules ./node_modules
# ビルド結果をコピー
COPY --from=builder /usr/src/app/.next ./.next
COPY --from=builder /usr/src/app/package.json ./package.json
COPY --from=builder /usr/src/app/next.config.js ./next.config.js
COPY --from=builder /usr/src/app/public ./public

# ユーザー・権限設定
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 && \
    mkdir -p /usr/src/app/data && \
    chown -R nextjs:nodejs /usr/src/app && \
    chmod -R 755 /usr/src/app

USER nextjs
EXPOSE 3000

ENV NODE_ENV=production

# 本番サーバー起動
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "start"]
