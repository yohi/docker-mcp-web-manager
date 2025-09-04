# Docker MCP Web Manager

DockerMCPGatewayの包括的なWeb管理ツール。ブラウザベースの管理機能を提供します。

**日本語** | [English README](./README.md)

## 🚀 主な機能

- **サーバー管理**: MCPサーバーの一覧表示、詳細確認、設定管理
- **リアルタイム監視**: ログストリーミング、メトリクス表示、アラート機能
- **テスト機能**: ツール実行テストと履歴追跡
- **カタログ統合**: MCPカタログからのサーバーインストール
- **セキュリティ**: 認証、シークレット管理、アクセス制御
- **設定管理**: 設定のインポート/エクスポート、Bitwarden CLI統合

## 📋 技術スタック

- **フロントエンド**: Next.js 14 + TypeScript、Tailwind CSS、React Query
- **バックエンド**: Next.js API Routes + TypeScript
- **データベース**: SQLite（設定とメタデータ保存）
- **認証**: NextAuth.jsとカスタムプロバイダー
- **コンテナ**: Dockerマルチステージビルド
- **オーケストレーション**: Docker Compose V2

## 🛠️ 開発環境のセットアップ

### 前提条件

- Node.js 18以上
- Docker & Docker Compose V2
- MCP Gateway（完全な機能のため）

### クイックスタート

1. **リポジトリのクローン**

   ```bash
   git clone https://github.com/yohi/docker-mcp-web-manager.git
   cd docker-mcp-web-manager
   ```

2. **依存関係のインストール**

   ```bash
   npm install
   ```

3. **環境設定の作成**

   ```bash
   cp .env.example .env
   # .envファイルを編集して設定を変更
   ```

4. **開発サーバーの起動**

   ```bash
   npm run dev
   ```

   アプリケーションは http://localhost:3000 でアクセス可能になります

### Docker開発環境

1. **Docker Composeでビルド・実行**

   ```bash
   docker compose up --build
   ```

2. **サービス停止**
   ```bash
   docker compose down
   ```

## 🚢 本番環境デプロイ

### Docker Composeを使用

1. **環境準備**

   ```bash
   cp .env.example .env
   # .envファイルで本番環境の値を設定
   ```

2. **データディレクトリの作成**

   ```bash
   mkdir -p ./data
   sudo chown -R 1001:1001 ./data
   ```

3. **デプロイ**

   ```bash
   docker compose up -d
   ```

4. **デプロイメントの確認**
   ```bash
   docker compose ps
   docker compose logs web
   ```

## 📚 スクリプト

- `npm run dev` - 開発サーバーの起動
- `npm run build` - 本番用アプリケーションのビルド
- `npm run start` - 本番サーバーの起動
- `npm run lint` - ESLintの実行
- `npm run type-check` - TypeScript型チェックの実行
- `npm run format` - Prettierでコードフォーマット
- `npm run format:check` - コードフォーマットのチェック

## 🔧 設定

### 環境変数

主要な環境変数（全リストは`.env.example`を参照）：

- `NEXTAUTH_SECRET` - NextAuth.jsの秘密鍵
- `DATABASE_URL` - SQLiteデータベースパス
- `MCP_GATEWAY_URL` - Docker MCP GatewayのURL
- `MCP_GATEWAY_API_KEY` - GatewayのAPIキー

### Docker Compose設定

- ポート: `3000`（PORT環境変数で設定可能）
- データ永続化: `./data`ディレクトリ（DATA_PATHで設定可能）
- セキュリティ: 非rootユーザー実行、capability制限
- ヘルスチェック: 内蔵の健全性監視

## 🏗️ アーキテクチャ

アプリケーションは明確に分離されたクリーンアーキテクチャに従います：

```
src/
├── app/                 # Next.js App Routerのページとレイアウト
├── components/          # Reactコンポーネント
├── lib/                # ユーティリティ関数と設定
├── types/              # TypeScript型定義
└── hooks/              # カスタムReactフック
```

## 🔒 セキュリティ機能

- **非root実行**: 全てのコンテナが非特権ユーザーで実行
- **セキュリティヘッダー**: HSTS、CSP、X-Frame-Optionsなど
- **シークレット管理**: AES-256-GCMによる暗号化ストレージ
- **レート制限**: IPごと・ユーザーごとのリクエスト制限
- **入力検証**: 包括的な入力サニタイゼーション
- **認証**: JWTベースのセッション管理

## 🧪 テスト

テストインフラストラクチャは後のフェーズで実装予定：

- Jest + React Testing Libraryによるユニットテスト
- APIエンドポイントの統合テスト
- Playwrightによるエンドツーエンドテスト

## 📖 API仕様

APIエンドポイントは`/api/v1/`プレフィックスのREST規約に従います：

- `GET /api/health` - ヘルスチェックエンドポイント
- `GET /api/v1/servers` - MCPサーバー一覧（計画中）
- `POST /api/v1/auth/login` - ユーザー認証（計画中）

## 🗺️ 実装計画

プロジェクトは段階的に実装されます：

### ✅ フェーズ1: プロジェクト基盤（完了）
- Next.js 14 + TypeScript + Tailwind CSS
- ESLint + Prettier（Google スタイルガイド）
- Docker マルチステージビルド
- Docker Compose設定
- セキュリティ強化設定

### 🔄 フェーズ2: データベース層（進行中）
- SQLiteスキーマ設計
- Drizzle ORMによるデータベース統合
- データモデルとリポジトリパターン
- マイグレーション戦略

### 📋 今後の予定
- Docker MCP統合レイヤー
- 認証システム
- APIエンドポイント
- フロントエンドコンポーネント
- セキュリティ強化
- テストインフラストラクチャ

## 🤝 コントリビューション

1. リポジトリをフォーク
2. フィーチャーブランチを作成
3. コーディング標準に従って変更を実施
4. テストとリンティングを実行
5. プルリクエストを提出

## 🛡️ セキュリティ

このプロジェクトはセキュリティファーストの設計を採用：

- すべてのコンテナは非root権限で実行
-包括的なセキュリティヘッダー設定
- 暗号化されたシークレット管理
- 入力検証とサニタイゼーション
- レート制限とDoS保護

セキュリティの問題を発見した場合は、公開のissueではなく、プライベートな報告をお願いします。

## 📄 ライセンス

このプロジェクトはMITライセンスの下で公開されています。詳細は[LICENSE](LICENSE)ファイルをご覧ください。

## 🙏 謝辞

- [Next.js](https://nextjs.org/)チーム
- [Docker](https://www.docker.com/)コミュニティ
- [Tailwind CSS](https://tailwindcss.com/)クリエイターたち
- オープンソースコミュニティ

---

**注意**: このプロジェクトは現在活発に開発中です。本番環境での使用前に十分なテストを実施してください。