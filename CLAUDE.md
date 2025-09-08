# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

Docker MCP Web Manager v2は、MCP（Model Context Protocol）サーバーの包括的な管理を提供するNext.js製Webアプリケーションです。DockerコンテナとしてパッケージされたMCPサーバーの管理、監視、構成を行います。

## 技術スタック

- **フロントエンド**: Next.js 15.5.2, React 18, TypeScript 5.9, Tailwind CSS
- **バックエンド**: Next.js API Routes, NextAuth.js 4.24.11
- **データベース**: SQLite + Drizzle ORM 0.44.5
- **認証**: NextAuth.js
- **暗号化**: Node.js crypto (AES-256-GCM)
- **テスト**: Jest + React Testing Library

## 開発コマンド

```bash
# 開発サーバー起動
npm run dev

# テスト実行
npm run test
npm run test:watch
npm run test:coverage
npm run test:integration
npm run test:e2e

# コード品質チェック
npm run lint
npm run typecheck

# データベース操作
npm run db:push      # マイグレーション実行
npm run db:seed      # 初期データ投入

# 本番ビルド
npm run build
npm run start
```

## アーキテクチャ

### ディレクトリ構造

- `src/app/` - Next.js App Router (ページとAPIルート)
  - `api/v1/` - REST API エンドポイント
- `src/components/` - React コンポーネント
- `src/lib/` - ユーティリティライブラリ
  - `auth/` - 認証・認可システム
  - `crypto/` - 暗号化機能
  - `docker-mcp/` - Docker MCP統合
  - `bitwarden/` - Bitwarden統合
- `src/db/` - データベース関連 (Drizzle ORM)
- `tests/` - テストファイル

### 主要システム

1. **認証システム**: NextAuth.jsベースの認証、RBAC（ロールベースアクセス制御）
2. **暗号化システム**: AES-256-GCMによる機密データ保護、KMS統合
3. **Docker統合**: MCP Gatewayを介したコンテナ管理（直接Docker APIアクセスなし）
4. **非同期ジョブ**: サーバー操作（起動/停止/インストール）の非同期実行
5. **データマスキング**: テスト結果・ログの機密データ自動マスキング

### API設計パターン

- **非同期操作**: POST操作は202 Acceptedで即座に応答、ジョブIDを返却
- **べき等性**: Idempotency-Keyヘッダーサポート（24時間TTL）
- **エラーハンドリング**: 構造化エラーレスポンス、適切なHTTPステータス
- **セキュリティ**: CSRF保護、レート制限、入力検証

## 重要な実装詳細

### セキュリティ要件

1. **データ保護**:
   - 機密データのAES-256-GCM暗号化
   - データベースレベルでのIV再利用防止
   - テスト結果の自動マスキング（PII、トークン、APIキー）

2. **認証・認可**:
   - NextAuth.jsセッション管理
   - パーミッションベースのアクセス制御
   - CSRF トークン検証

3. **ネットワークセキュリティ**:
   - CSP (Content Security Policy) 実装
   - CORS 設定
   - レート制限

### データベース設計

- **SQLiteベース**: 開発環境、本番はPostgreSQL移行可能
- **外部キー制約**: データ整合性確保
- **JSON列**: 設定データの柔軟な格納
- **インデックス最適化**: クエリパフォーマンス向上

### Docker統合

- **MCP Gateway経由**: Webサービスは直接Dockerにアクセスしない
- **セキュリティ**: 非rootユーザー実行、最小権限
- **ヘルスチェック**: 内蔵HTTP モジュール使用

## テスト戦略

### テスト種別

1. **ユニットテスト**: `src/lib/__tests__/`
2. **統合テスト**: `src/app/api/__tests__/`
3. **E2Eテスト**: `tests/e2e/`
4. **セキュリティテスト**: `tests/security/`

### テスト実行

```bash
# 特定ファイルのテスト
npm run test -- encryption.test.ts

# カバレッジ付きテスト
npm run test:coverage

# 統合テスト
npm run test:integration
```

## 開発時の注意事項

### コーディング規約

- **TypeScript**: 厳格型チェック必須
- **エラーハンドリング**: 構造化エラーレスポンス
- **セキュリティ**: 機密データのログ出力禁止
- **パフォーマンス**: React.memo、useMemo適切な使用

### データベース操作

- **Drizzle ORM**: 必ず型安全なクエリ使用
- **マイグレーション**: `npm run db:push`でスキーマ更新
- **外部キー**: CASCADE設定でデータ整合性確保

### Docker開発

- **MCP Gateway**: 全Docker操作はGateway API経由
- **セキュリティ**: 最小権限での実行
- **ログ**: 構造化ログ出力

## 環境設定

### 必須環境変数

```bash
NEXTAUTH_SECRET=           # NextAuth.jsシークレット
DATABASE_URL=              # データベースURL  
ENCRYPTION_MASTER_KEY=     # 暗号化マスターキー (Base64)
```

### オプション環境変数

```bash
BITWARDEN_SERVER_URL=      # Bitwardenサーバー
LOG_LEVEL=                 # ログレベル (debug/info/error)
DOCKER_HOST=               # Dockerホスト
```

## デプロイメント

### Docker Compose

```bash
# 本番デプロイ
docker compose -f docker-compose.prod.yml up -d

# ヘルスチェック
curl http://localhost:3000/api/health
```

### セキュリティ

- **Non-root**: ユーザー1000:1000で実行
- **Capabilities**: 最小権限（NET_BIND_SERVICEのみ）
- **No new privileges**: 権限昇格防止