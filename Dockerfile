# =================================================================
#  Docker MCP Web Manager v2 - 統合マルチステージDockerfile
#  本番環境 (production) と開発環境 (development) をサポート
# =================================================================

# =================================================================
#  Stage 1: Dependencies (依存関係インストール)
#  - package.jsonの変更時のみ実行されるキャッシュ最適化レイヤー
# =================================================================
FROM node:24-slim AS deps

# ビルドに必要なツールをインストール
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

# package.jsonとpackage-lock.jsonのみをコピー（キャッシュ効率化）
COPY package*.json ./

# npm設定最適化
RUN npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-retries 5 && \
    npm config set registry https://registry.npmjs.org/

# 依存関係を一括インストール（キャッシュレイヤー）
RUN timeout 600 npm ci --legacy-peer-deps --prefer-offline --progress=false --no-optional || \
    (echo "npm ci タイムアウト、fallbackでnpm installを実行..." && \
     npm install --legacy-peer-deps --prefer-offline --progress=false --no-optional)

# =================================================================
#  Stage 2: Config Layer (設定ファイル専用)
#  - 設定ファイルの変更時のみ実行されるキャッシュ最適化レイヤー
# =================================================================
FROM node:24-slim AS config

WORKDIR /usr/src/app

# 前ステージから依存関係をコピー
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --from=deps /usr/src/app/package*.json ./

# 設定ファイルをコピー（キャッシュ最適化）
COPY next.config.js ./
COPY tailwind.config.js ./
COPY postcss.config.js ./
COPY postcss.config.mjs ./
COPY tsconfig.json ./
COPY drizzle.config.ts ./

# 静的ファイル（変更頻度低）
COPY public ./public

# =================================================================
#  Stage 3: Builder (ビルド専用)
#  - ソースコード変更時のビルド処理
# =================================================================
FROM config AS builder

# ソースコードをコピー（最後にコピーしてキャッシュ効率最大化）
COPY src ./src
COPY middleware.ts ./

# Next.jsアプリケーションをビルド（ダミー環境変数でビルドエラー回避）
ENV NEXTAUTH_SECRET="dummy-build-secret-for-docker-build-only-32chars" \
    NEXTAUTH_URL="http://localhost:3000" \
    JWT_SECRET="dummy-jwt-secret-for-docker-build-only-very-long-secret" \
    DATABASE_URL="file:./dev.db"

# Next.jsキャッシュディレクトリを作成
RUN mkdir -p .next/cache

# ビルド実行
RUN npm run build

# better-sqlite3の動作確認
RUN node -e "const Database = require('better-sqlite3'); console.log('✅ better-sqlite3 build successful:', typeof Database === 'function')"

# =================================================================
#  Stage 4: Runtime Base (実行時共通ベース)
#  - development/productionで共通する部分を統合
# =================================================================
FROM node:24-slim AS runtime-base

WORKDIR /usr/src/app

# 実行時に必要な最小パッケージ
RUN apt-get update && apt-get install -y \
    dumb-init \
    curl \
    unzip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# ユーザー・権限設定（セキュリティベストプラクティス）
RUN addgroup --gid 1001 --system nodejs && \
    adduser --system --uid 1001 --ingroup nodejs nextjs && \
    mkdir -p /usr/src/app/data && \
    mkdir -p /home/nextjs/.config

# =================================================================
#  Stage 5: Development (開発環境)
#  - ホットリロード対応、ボリュームマウント前提
# =================================================================
FROM runtime-base AS development

# Bitwarden CLI のインストール（開発環境用）
RUN npm install -g @bitwarden/cli || echo "Bitwarden CLI installation failed, but continuing..."

# 開発用依存関係を含むnode_modulesをコピー
COPY --from=deps /usr/src/app/node_modules ./node_modules

# ネイティブモジュールを再ビルド（開発環境でのマウント対応）
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    libsqlite3-dev \
    && npm rebuild better-sqlite3 \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# ビルド結果をコピー（初期状態、ホットリロードで更新される）
COPY --from=builder /usr/src/app/.next ./.next

# 設定・メタファイルをコピー（ホットリロードで必要）
COPY --from=builder /usr/src/app/package.json ./package.json
COPY --from=config /usr/src/app/next.config.js ./next.config.js
COPY --from=config /usr/src/app/tailwind.config.js ./tailwind.config.js
COPY --from=config /usr/src/app/postcss.config.js ./postcss.config.js
COPY --from=config /usr/src/app/postcss.config.mjs ./postcss.config.mjs
COPY --from=config /usr/src/app/tsconfig.json ./tsconfig.json
COPY --from=config /usr/src/app/drizzle.config.ts ./drizzle.config.ts
COPY --from=config /usr/src/app/public ./public

# 初期ソースコードをコピー（ボリュームマウントで上書きされる）
COPY --from=builder /usr/src/app/src ./src
COPY --from=builder /usr/src/app/middleware.ts ./middleware.ts

# 環境設定
RUN cp .env.example .env.local 2>/dev/null || echo "No .env.example found"

# 権限設定
RUN chown -R nextjs:nodejs /usr/src/app && \
    chown -R nextjs:nodejs /home/nextjs && \
    chmod -R 755 /usr/src/app && \
    chmod -R 755 /home/nextjs

# Bitwarden CLIへのアクセス権限設定
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

# 開発サーバー起動（ホットリロード有効）
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "dev"]

# =================================================================
#  Stage 6: Production (本番環境)
#  - 本番用最適化、最小構成
# =================================================================
FROM runtime-base AS production

# 本番用依存関係のみをインストール（devDependenciesを除外）
COPY --from=builder /usr/src/app/package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps --prefer-offline --progress=false

# ビルド結果をコピー
COPY --from=builder /usr/src/app/.next ./.next
COPY --from=config /usr/src/app/next.config.js ./next.config.js
COPY --from=config /usr/src/app/public ./public

# 権限設定
RUN chown -R nextjs:nodejs /usr/src/app && \
    chmod -R 755 /usr/src/app

USER nextjs
EXPOSE 3000

ENV NODE_ENV=production

# 本番サーバー起動
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "run", "start"]