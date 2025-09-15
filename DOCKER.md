# Docker MCP Web Manager v2 - Docker ガイド

## 概要

このプロジェクトでは、効率的なマルチステージDockerfileと環境別docker-composeファイルを使用して、開発環境と本番環境の両方をサポートしています。

## 📁 ファイル構成

```
.
├── Dockerfile                    # 統合マルチステージDockerfile
├── docker-compose.yml           # 本番環境用設定
├── docker-compose-dev.yml       # 開発環境用オーバーライド設定
├── .env.example                  # 環境変数設定例
└── DOCKER.md                     # このファイル
```

## 🚀 クイックスタート

### 開発環境での起動

```bash
# 環境変数ファイルをコピー
cp .env.example .env.local

# 開発環境でアプリケーションを起動（ホットリロード有効）
docker compose -f docker-compose.yml -f docker-compose-dev.yml up --build

# バックグラウンドで起動
docker compose -f docker-compose.yml -f docker-compose-dev.yml up -d --build

# アプリケーションにアクセス
# Web: http://localhost:3003
# Redis: localhost:6381
```

### 本番環境での起動

```bash
# 環境変数ファイルをコピーして編集
cp .env.example .env
# .envファイルを本番環境に合わせて編集

# 本番環境でアプリケーションを起動
docker compose up --build

# バックグラウンドで起動
docker compose up -d --build

# アプリケーションにアクセス
# Web: http://localhost:3000
# Redis: localhost:6379
```

## 🔧 Dockerステージの説明

### マルチステージDockerfile構成

1. **deps**: 依存関係インストール（キャッシュ最適化）
2. **config**: 設定ファイル処理（キャッシュ最適化）
3. **builder**: アプリケーションビルド
4. **runtime-base**: 実行時共通ベース
5. **development**: 開発環境用（ホットリロード対応）
6. **production**: 本番環境用（最小構成）

### ターゲット選択

```bash
# 開発環境用イメージをビルド
docker build --target development -t mcp-web-manager:dev .

# 本番環境用イメージをビルド
docker build --target production -t mcp-web-manager:prod .
```

## 🛠️ 開発環境の特徴

### ホットリロード対応

開発環境では以下のディレクトリがボリュームマウントされ、ファイル変更時に自動的にリロードされます：

```yaml
volumes:
  - ./src:/usr/src/app/src                    # ソースコード
  - ./middleware.ts:/usr/src/app/middleware.ts # ミドルウェア
  - ./public:/usr/src/app/public              # 静的ファイル
  - ./next.config.js:/usr/src/app/next.config.js  # Next.js設定
  # その他設定ファイル...
```

### 開発環境の特別機能

- **ボリュームマウント**: ソースコード変更時の自動リロード
- **デバッグ設定**: `LOG_LEVEL=debug`, `NEXT_PUBLIC_SKIP_AUTH=true`
- **緩いセキュリティ**: 開発用の認証設定
- **Bitwarden CLI**: 開発用ツールとして利用可能

## 🏭 本番環境の特徴

### セキュリティ強化

- **必須環境変数**: `NEXTAUTH_SECRET`, `JWT_SECRET`, `ENCRYPTION_MASTER_KEY`
- **最小権限**: non-rootユーザー、capability制限
- **最小構成**: devDependenciesなし、最小パッケージ

### パフォーマンス最適化

- **制限されたリソース**: メモリ・CPU制限
- **Redis統合**: レート制限・セッション管理
- **Nginx対応**: リバースプロキシ（オプション）

## 🌐 サービス構成

### 基本サービス

1. **web**: メインアプリケーション
2. **redis**: キャッシュ・セッション管理

### オプションサービス

3. **nginx**: リバースプロキシ（本番環境）
4. **postgres**: PostgreSQL（dev-toolsプロファイル）
5. **adminer**: DB管理ツール（dev-toolsプロファイル）

### プロファイル使用例

```bash
# Nginxを含めて起動（本番環境）
docker-compose --profile nginx up

# 開発ツールを含めて起動
docker-compose -f docker-compose.yml -f docker-compose-dev.yml --profile dev-tools up
```

## 🔐 環境変数設定

### 必須設定（本番環境）

```bash
# セキュリティ関連（必須）
NEXTAUTH_SECRET=your-secret-key-32-characters-long
JWT_SECRET=your-jwt-secret-key-change-in-production
ENCRYPTION_MASTER_KEY=your-encryption-master-key-32-chars
DEFAULT_ADMIN_PASSWORD=strong-admin-password

# アプリケーション設定
NEXTAUTH_URL=https://your-domain.com
CORS_ORIGIN=https://your-domain.com
```

### 開発環境設定

```bash
# 開発用ポート（本番とポート競合回避）
WEB_DEV_PORT=3002
REDIS_DEV_PORT=6380

# デバッグ設定
NEXT_PUBLIC_SKIP_AUTH=true
LOG_LEVEL=debug
```

## 🗄️ データ管理

### 共有データボリューム

開発環境と本番環境で同じデータを参照するように設定されています：

```yaml
volumes:
  app-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: ${DATA_PATH:-./data}
```

### データベースファイル

- **場所**: `./data/app.db`
- **形式**: SQLite
- **共有**: 開発・本番環境で同じファイルを使用

## 🚨 トラブルシューティング

### よくある問題

1. **ポート競合**
   ```bash
   # 開発環境用の別ポートを使用
   WEB_DEV_PORT=3002 docker-compose -f docker-compose.yml -f docker-compose-dev.yml up
   ```

2. **権限エラー**
   ```bash
   # データディレクトリの権限を設定
   sudo chown -R 1001:1001 ./data
   ```

3. **ビルドエラー**
   ```bash
   # キャッシュをクリアしてリビルド
   docker-compose build --no-cache
   ```

### ログ確認

```bash
# サービスのログを確認
docker-compose logs web
docker-compose logs redis

# リアルタイムでログを監視
docker-compose logs -f web
```

### コンテナ管理

```bash
# 実行中のコンテナを確認
docker-compose ps

# コンテナに入る
docker-compose exec web /bin/sh

# サービスを再起動
docker-compose restart web
```

## 📊 ヘルスチェック

各サービスにヘルスチェックが設定されています：

```bash
# ヘルスチェック状況を確認
docker-compose ps
docker inspect <container_name> | jq '.[0].State.Health'
```

## 🔄 更新・メンテナンス

### イメージ更新

```bash
# 最新のベースイメージを取得
docker-compose pull

# アプリケーションを再ビルド
docker-compose build --pull
```

### クリーンアップ

```bash
# 停止してコンテナを削除
docker-compose down

# ボリュームも含めて削除
docker-compose down -v

# 未使用のDockerリソースをクリーンアップ
docker system prune -a
```

## 🔗 便利なコマンド

```bash
# 開発環境起動
alias dev-up="docker-compose -f docker-compose.yml -f docker-compose-dev.yml up -d"

# 開発環境停止
alias dev-down="docker-compose -f docker-compose.yml -f docker-compose-dev.yml down"

# 本番環境起動
alias prod-up="docker-compose up -d"

# ログ監視
alias logs="docker-compose logs -f web"
```