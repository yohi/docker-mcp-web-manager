# 🐳 Docker MCP Web Manager

モダンな Web インターフェースによる Docker MCP (Model Context Protocol) サーバー管理システム

[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-green)](./LICENSE)

## 📋 目次

- [概要](#概要)
- [主要機能](#主要機能)
- [技術スタック](#技術スタック)
- [セットアップ](#セットアップ)
- [使用方法](#使用方法)
- [API ドキュメント](#api-ドキュメント)
- [デプロイ](#デプロイ)
- [開発](#開発)
- [トラブルシューティング](#トラブルシューティング)
- [ライセンス](#ライセンス)

## 🎯 概要

Docker MCP Web Manager は、Docker コンテナで実行される MCP (Model Context Protocol) サーバーを統合管理するための Web アプリケーションです。直感的な UI とセキュアな認証システムにより、複数の MCP サーバーの監視、管理、テストを効率的に行えます。

### 🌟 主要機能

#### 🔐 認証・認可
- **NextAuth.js v5** による堅牢な認証システム
- **JWT ベース**のセッション管理
- **ロールベースアクセス制御** (RBAC)
- **Bitwarden CLI** 統合対応

#### 🏗️ サーバー管理
- **リアルタイム状態監視**
- **ワンクリック起動/停止**
- **設定管理とバックアップ**
- **ログストリーミング**

#### 🧪 テスト・監視
- **統合テストランナー**
- **パフォーマンス監視**
- **ヘルスチェック**
- **メトリクス収集**

#### 🛡️ セキュリティ
- **レート制限**
- **CSRF 保護**
- **Bot 検出**
- **包括的セキュリティヘッダー**

#### 📊 監視・ログ
- **構造化ログ**
- **リアルタイム監視**
- **Prometheus メトリクス**
- **アラート機能**

## 🛠️ 技術スタック

### フロントエンド
- **Next.js 14** (App Router)
- **TypeScript**
- **React 18**
- **Tailwind CSS**
- **React Query (TanStack Query)**

### バックエンド
- **Next.js API Routes**
- **NextAuth.js v5**
- **Zod** (バリデーション)
- **SQLite** (開発環境)

### インフラストラクチャ
- **Docker & Docker Compose**
- **Docker MCP CLI**
- **Bitwarden CLI**

### テスト
- **Jest** (単体テスト)
- **React Testing Library**
- **Playwright** (E2E テスト)

### 監視・ログ
- **構造化ログシステム**
- **Prometheus メトリクス**
- **ヘルスチェック API**

## 🚀 セットアップ

### 前提条件

- **Node.js** 18.0.0 以上
- **Docker** 20.10.0 以上
- **Docker Compose** 2.0.0 以上
- **Git**

### インストール

1. **リポジトリのクローン**
   ```bash
   git clone https://github.com/your-org/docker-mcp-web-manager.git
   cd docker-mcp-web-manager
   ```

2. **依存関係のインストール**
   ```bash
   npm install
   ```

3. **環境変数の設定**
   ```bash
   cp .env.example .env.local
   ```

   `.env.local` を編集:
   ```env
   # 基本設定
   NODE_ENV=development
   NEXT_PUBLIC_APP_URL=http://localhost:3000

   # NextAuth.js 設定
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=your-secret-key-here

   # データベース設定
   DATABASE_URL=sqlite:./data/app.db

   # Docker MCP CLI 設定
   DOCKER_HOST=unix:///var/run/docker.sock
   DOCKER_API_VERSION=1.41

   # セキュリティ設定
   CSRF_SECRET_KEY=your-csrf-secret-key

   # ログ設定 (オプション)
   LOG_LEVEL=INFO
   LOG_ENDPOINT=https://your-log-service.com/api/logs
   LOG_API_KEY=your-log-api-key
   ```

4. **データベースの初期化**
   ```bash
   npm run db:migrate
   ```

5. **開発サーバーの起動**
   ```bash
   npm run dev
   ```

   ブラウザで [http://localhost:3000](http://localhost:3000) を開く

## 📖 使用方法

### 基本操作

1. **初回ログイン**
   - `/login` にアクセス
   - 認証プロバイダーを選択 (Credentials または Bitwarden)
   - 認証情報を入力

2. **ダッシュボード**
   - サーバー一覧の表示
   - リアルタイム状態監視
   - 統計情報の表示

3. **サーバー管理**
   - 新規サーバー作成: `新規サーバー` ボタン
   - サーバー操作: カード上の操作ボタン
   - 詳細表示: サーバーカードをクリック

4. **設定管理**
   - 設定エクスポート: `/dashboard/config` 画面
   - 設定インポート: 設定ファイルをアップロード
   - Bitwarden 統合: 認証情報の安全な管理

### 管理者機能

管理者ロールのユーザーは以下の追加機能を利用できます:

- **サーバー作成・削除**
- **全ユーザーのアクティビティ監視**
- **システム設定の変更**
- **ログ・メトリクスへのフルアクセス**

### API の使用

REST API エンドポイント:

```bash
# サーバー一覧取得
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/api/v1/servers

# サーバー作成
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Server","image":"nginx:latest"}' \
  http://localhost:3000/api/v1/servers

# ヘルスチェック
curl http://localhost:3000/api/v1/health

# メトリクス取得
curl http://localhost:3000/api/v1/metrics
```

詳細な API 仕様は [API ドキュメント](./docs/api.md) を参照してください。

## 🐳 デプロイ

### Docker Compose でのデプロイ

1. **本番用設定ファイルの準備**
   ```bash
   cp docker-compose.yml docker-compose.prod.yml
   ```

2. **環境変数の設定**
   ```bash
   cp .env.example .env.production
   # .env.production を本番環境用に編集
   ```

3. **デプロイの実行**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

### 本番環境での推奨設定

- **HTTPS の有効化** (Let's Encrypt など)
- **データベースのバックアップ設定**
- **ログローテーション設定**
- **監視システム統合**
- **セキュリティスキャン実行**

詳細は [デプロイガイド](./docs/deployment.md) を参照してください。

## 🔧 開発

### 開発環境のセットアップ

```bash
# 開発依存関係のインストール
npm install

# 開発サーバー起動
npm run dev

# TypeScript 型チェック
npm run type-check

# ESLint 実行
npm run lint

# テスト実行
npm run test
npm run test:e2e
```

### テスト

```bash
# 全テストの実行
npm run test:all

# 単体テスト
npm run test:unit

# 結合テスト
npm run test:integration

# E2E テスト
npm run test:e2e

# カバレッジ取得
npm run test:coverage
```

### コード品質

プロジェクトでは以下のツールを使用してコード品質を維持しています:

- **TypeScript**: 型安全性
- **ESLint**: コード品質チェック
- **Prettier**: コードフォーマット
- **Husky**: Git フック
- **Jest**: テストフレームワーク

## 🔍 トラブルシューティング

### よくある問題

#### Docker 接続エラー
```bash
# Docker デーモンの状態確認
docker version

# Docker サービスの再起動
sudo systemctl restart docker

# 権限の確認
sudo usermod -aG docker $USER
```

#### 認証エラー
```bash
# NextAuth.js のセッション確認
curl -b "cookies.txt" http://localhost:3000/api/v1/auth/session

# JWT トークンの確認
npm run debug:auth
```

#### データベースエラー
```bash
# データベースファイルの確認
ls -la ./data/

# データベースの再初期化
npm run db:reset
npm run db:migrate
```

### ログの確認

```bash
# アプリケーションログ
docker-compose logs app

# Docker MCP CLI ログ
docker-compose logs docker-mcp

# システムログ
journalctl -f -u docker
```

### パフォーマンス問題

```bash
# メモリ使用量確認
npm run debug:memory

# パフォーマンスプロファイル
npm run profile

# メトリクス確認
curl http://localhost:3000/api/v1/metrics
```

### セキュリティ問題

```bash
# セキュリティスキャン実行
npm run security:scan

# 依存関係の脆弱性チェック
npm audit

# セキュリティヘッダー確認
curl -I http://localhost:3000
```

### サポート

問題が解決しない場合は:

1. **[Issues](https://github.com/your-org/docker-mcp-web-manager/issues)** で同様の問題を検索
2. **新しい Issue** を作成 (テンプレートに従って情報を提供)
3. **[Wiki](https://github.com/your-org/docker-mcp-web-manager/wiki)** で詳細情報を確認
4. **[Discussions](https://github.com/your-org/docker-mcp-web-manager/discussions)** でコミュニティに質問

## 🤝 コントリビューション

プロジェクトへの貢献を歓迎しています！

1. **Fork** してください
2. **Feature ブランチ**を作成 (`git checkout -b feature/amazing-feature`)
3. **変更をコミット** (`git commit -m 'Add amazing feature'`)
4. **Push** (`git push origin feature/amazing-feature`)
5. **Pull Request** を作成

詳細は [CONTRIBUTING.md](./CONTRIBUTING.md) を参照してください。

## 📄 ライセンス

このプロジェクトは MIT ライセンスの下で公開されています。詳細は [LICENSE](./LICENSE) ファイルを参照してください。

## 🙏 謝辞

このプロジェクトは以下のオープンソースプロジェクトを使用しています:

- [Next.js](https://nextjs.org/)
- [React](https://reactjs.org/)
- [TypeScript](https://www.typescriptlang.org/)
- [Docker](https://www.docker.com/)
- [NextAuth.js](https://next-auth.js.org/)
- [Tailwind CSS](https://tailwindcss.com/)

---

**Docker MCP Web Manager** で効率的なコンテナ管理を実現しましょう！ 🚀
