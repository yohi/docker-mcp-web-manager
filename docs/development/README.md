# Docker MCP Web Manager v2 - 開発者ガイド

## 概要

このドキュメントでは、Docker MCP Web Manager v2の開発、拡張、メンテナンスに関する包括的な情報を提供します。

## 目次

- [開発環境のセットアップ](#開発環境のセットアップ)
- [プロジェクト構造](#プロジェクト構造)
- [技術スタック](#技術スタック)
- [開発ワークフロー](#開発ワークフロー)
- [テスト](#テスト)
- [デバッグ](#デバッグ)
- [セキュリティ](#セキュリティ)
- [パフォーマンス](#パフォーマンス)
- [デプロイメント](#デプロイメント)
- [トラブルシューティング](#トラブルシューティング)

## 開発環境のセットアップ

### 前提条件

- **Node.js**: 24.7.0+
- **Docker**: 20.10+
- **Docker Compose**: V2
- **Git**: 2.30+

### 環境変数

`.env.local`ファイルを作成し、以下の環境変数を設定してください：

```bash
# NextAuth.js設定
NEXTAUTH_SECRET=your-secret-key-here
NEXTAUTH_URL=http://localhost:3000

# データベース設定
DATABASE_URL=file:./dev.db

# 暗号化設定
ENCRYPTION_MASTER_KEY=base64-encoded-32-byte-key

# Bitwarden設定（オプション）
BITWARDEN_SERVER_URL=https://vault.bitwarden.com
BITWARDEN_SESSION_TOKEN=your-session-token

# Docker設定
DOCKER_HOST=unix:///var/run/docker.sock

# ログレベル
LOG_LEVEL=debug
```

### インストール

```bash
# リポジトリのクローン
git clone https://github.com/your-org/docker-mcp-web-manager-v2.git
cd docker-mcp-web-manager-v2

# 依存関係のインストール
npm install

# データベースのセットアップ
npm run db:push
npm run db:seed

# 開発サーバーの起動
npm run dev
```

## プロジェクト構造

```
src/
├── app/                    # Next.js App Router
│   ├── api/                # API Routes
│   │   └── v1/             # API v1 エンドポイント
│   ├── auth/               # 認証ページ
│   ├── dashboard/          # ダッシュボード
│   ├── servers/            # サーバー管理画面
│   ├── catalog/            # カタログ画面
│   ├── secrets/            # シークレット管理画面
│   └── logs/               # ログ・監視画面
├── components/             # React コンポーネント
│   ├── layout/             # レイアウト コンポーネント
│   ├── common/             # 共通 コンポーネント
│   └── ui/                 # UI コンポーネント
├── lib/                    # ユーティリティ・ライブラリ
│   ├── api/                # API 関連ユーティリティ
│   ├── auth/               # 認証・認可
│   ├── crypto/             # 暗号化ユーティリティ
│   ├── docker-mcp/         # Docker MCP クライアント
│   └── bitwarden/          # Bitwarden 統合
├── db/                     # データベース関連
│   ├── schema/             # Drizzle ORM スキーマ
│   ├── repositories/       # Repository パターン
│   └── migrations/         # マイグレーションファイル
├── types/                  # TypeScript 型定義
└── __tests__/              # テストファイル
```

## 技術スタック

### フロントエンド
- **Next.js 15.5.2**: React フレームワーク
- **React 18**: UI ライブラリ
- **TypeScript 5.9**: 型安全性
- **Tailwind CSS 4.1.13**: スタイリング
- **Heroicons**: アイコンライブラリ

### バックエンド
- **Next.js API Routes**: サーバーサイド API
- **NextAuth.js 4.24.11**: 認証システム
- **Drizzle ORM 0.44.5**: データベース ORM
- **SQLite 3.50.4**: データベース
- **Zod**: スキーマ検証

### インフラストラクチャ
- **Docker**: コンテナ化
- **Docker Compose**: オーケストレーション
- **Node.js 24.7.0**: ランタイム

### テスト・品質管理
- **Jest**: ユニットテスト
- **React Testing Library**: React コンポーネントテスト
- **ESLint**: Linting
- **Prettier**: コードフォーマット
- **TypeScript**: 型チェック

## 開発ワークフロー

### ブランチ戦略

```
main
├── develop
│   ├── feature/task-XX-description
│   ├── bugfix/issue-description
│   └── hotfix/critical-issue
└── release/vX.X.X
```

### コミットメッセージ

```
feat: 新機能追加
fix: バグ修正
docs: ドキュメント更新
style: コードスタイル修正
refactor: リファクタリング
test: テスト追加・修正
chore: その他のメンテナンス
```

### プルリクエスト

1. **ブランチ作成**: `feature/task-XX-description`
2. **実装**: 機能実装とテスト作成
3. **コード品質チェック**: 
   ```bash
   npm run lint
   npm run typecheck
   npm run test
   ```
4. **プルリクエスト作成**: テンプレートに従って詳細を記載
5. **コードレビュー**: 最低2名のレビュー
6. **マージ**: レビュー承認後にマージ

## テスト

### テスト戦略

#### ユニットテスト
```bash
# 全テスト実行
npm run test

# 特定ファイルのテスト
npm run test -- encryption.test.ts

# ウォッチモード
npm run test:watch

# カバレッジ
npm run test:coverage
```

#### 統合テスト
```bash
# API統合テスト
npm run test:integration

# E2Eテスト
npm run test:e2e
```

### テストファイル構造

```typescript
// src/lib/__tests__/crypto/encryption.test.ts
describe('Encryption Utilities', () => {
  beforeEach(() => {
    // セットアップ
  });

  afterEach(() => {
    // クリーンアップ
  });

  describe('encryptData', () => {
    test('should encrypt data correctly', () => {
      // テスト実装
    });
  });
});
```

### モック

```typescript
// __mocks__/next-auth.ts
export const getServerSession = jest.fn();

// テストファイル内
import { getServerSession } from 'next-auth';
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
```

## デバッグ

### ローカルデバッグ

#### VS Code設定 (`.vscode/launch.json`)
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Next.js: debug server-side",
      "type": "node-terminal",
      "request": "launch",
      "command": "npm run dev"
    },
    {
      "name": "Next.js: debug client-side",
      "type": "chrome",
      "request": "launch",
      "url": "http://localhost:3000"
    }
  ]
}
```

#### ログレベル設定
```typescript
// src/lib/logger.ts
export const logger = {
  debug: (message: string, ...args: any[]) => {
    if (process.env.LOG_LEVEL === 'debug') {
      console.debug(`[DEBUG] ${message}`, ...args);
    }
  },
  info: (message: string, ...args: any[]) => {
    console.info(`[INFO] ${message}`, ...args);
  },
  error: (message: string, ...args: any[]) => {
    console.error(`[ERROR] ${message}`, ...args);
  }
};
```

### Docker環境デバッグ

```bash
# コンテナログ確認
docker-compose logs -f web

# コンテナ内でシェル実行
docker-compose exec web sh

# データベース確認
docker-compose exec web npm run db:studio
```

## セキュリティ

### セキュリティガイドライン

1. **認証・認可**
   - すべてのAPIエンドポイントで認証チェック
   - 最小権限の原則
   - セッション管理の適切な実装

2. **データ保護**
   - 機密データの暗号化（AES-256-GCM）
   - SQL インジェクション対策
   - XSS 対策

3. **ネットワークセキュリティ**
   - HTTPS の強制
   - CORS の適切な設定
   - CSP ヘッダーの実装

### セキュリティテスト

```bash
# セキュリティ監査
npm audit

# 依存関係脆弱性チェック
npm run security:check

# SAST（静的解析）
npm run security:sast
```

### セキュリティベストプラクティス

```typescript
// 機密データのログ出力回避
const sanitizeForLog = (data: any) => {
  const sanitized = { ...data };
  delete sanitized.password;
  delete sanitized.token;
  delete sanitized.secret;
  return sanitized;
};

// 暗号化キーの安全な取得
const getEncryptionKey = () => {
  const key = process.env.ENCRYPTION_MASTER_KEY;
  if (!key) {
    throw new Error('Encryption key not configured');
  }
  return Buffer.from(key, 'base64');
};
```

## パフォーマンス

### 最適化戦略

1. **フロントエンド最適化**
   - React.memo の活用
   - useMemo, useCallback の適切な使用
   - 画像最適化
   - バンドルサイズの最小化

2. **API最適化**
   - データベースクエリ最適化
   - キャッシュ戦略
   - ページネーション

3. **データベース最適化**
   - インデックスの適切な設定
   - クエリ最適化
   - 接続プールの設定

### パフォーマンス監視

```bash
# ビルド解析
npm run analyze

# パフォーマンステスト
npm run test:performance

# ライトハウス監査
npm run lighthouse
```

### メトリクス収集

```typescript
// パフォーマンスメトリクス
export const trackPerformance = (name: string, startTime: number) => {
  const duration = Date.now() - startTime;
  console.log(`[PERF] ${name}: ${duration}ms`);
  
  // メトリクス収集サービスに送信
  if (process.env.NODE_ENV === 'production') {
    sendMetric(name, duration);
  }
};
```

## デプロイメント

### 本番環境準備

```bash
# 本番ビルド
npm run build

# 本番環境テスト
npm run start

# Docker イメージビルド
docker build -t docker-mcp-web-manager-v2 .

# Docker Compose 本番設定
docker-compose -f docker-compose.prod.yml up -d
```

### 環境別設定

#### 開発環境 (`.env.local`)
```bash
NODE_ENV=development
LOG_LEVEL=debug
DATABASE_URL=file:./dev.db
```

#### ステージング環境 (`.env.staging`)
```bash
NODE_ENV=production
LOG_LEVEL=info
DATABASE_URL=postgresql://user:pass@staging-db:5432/dbname
```

#### 本番環境 (`.env.production`)
```bash
NODE_ENV=production
LOG_LEVEL=error
DATABASE_URL=postgresql://user:pass@prod-db:5432/dbname
```

### CI/CD パイプライン

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '24.7.0'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test
      - run: npm run test:integration

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: docker build -t app .
      - run: docker push registry/app:${{ github.sha }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - run: |
          ssh deploy@server "
            docker pull registry/app:${{ github.sha }}
            docker-compose up -d
          "
```

## トラブルシューティング

### よくある問題と解決方法

#### データベース接続エラー
```bash
# SQLite ファイルの権限確認
ls -la *.db

# データベースマイグレーション
npm run db:push

# データベースリセット
npm run db:reset
```

#### Docker関連の問題
```bash
# Docker デーモン状態確認
systemctl status docker

# コンテナ状態確認
docker ps -a

# ログ確認
docker logs container-name

# コンテナ再起動
docker-compose restart service-name
```

#### 認証・認可エラー
```typescript
// JWT デバッグ
import jwt from 'jsonwebtoken';

const debugToken = (token: string) => {
  try {
    const decoded = jwt.decode(token, { complete: true });
    console.log('Token payload:', decoded?.payload);
    console.log('Token header:', decoded?.header);
  } catch (error) {
    console.error('Invalid token:', error);
  }
};
```

#### パフォーマンス問題
```bash
# メモリ使用量確認
node --inspect-brk npm run dev

# CPU プロファイリング
node --prof npm run start

# ヒープダンプ
node --heapsnapshot-signal=SIGUSR2 npm run start
```

### ログ分析

```bash
# アプリケーションログ
tail -f logs/application.log

# エラーログのみ
grep -i error logs/application.log

# 特定期間のログ
grep "2024-01-01" logs/application.log
```

### デバッグツール

```typescript
// デバッグヘルパー
export const debugAPI = {
  logRequest: (req: NextRequest) => {
    console.debug('[API] Request:', {
      method: req.method,
      url: req.url,
      headers: Object.fromEntries(req.headers),
    });
  },

  logResponse: (response: any, duration: number) => {
    console.debug('[API] Response:', {
      status: response.status,
      duration: `${duration}ms`,
    });
  }
};
```

## 貢献ガイドライン

### 開発参加方法

1. **Issue確認**: 既存のIssueを確認し、重複を避ける
2. **フォーク**: リポジトリをフォーク
3. **ブランチ作成**: `feature/issue-number-description`
4. **実装**: 機能実装とテスト作成
5. **プルリクエスト**: 詳細な説明付きでPR作成

### コード規約

- **ESLint設定**: プロジェクトの ESLint 設定に従う
- **TypeScript**: 厳格な型定義を心がける
- **コメント**: 複雑な処理には日本語コメントを追加
- **テスト**: 新機能には必ずテストを追加

### レビュープロセス

1. **自己レビュー**: PR作成前に自分でコードを確認
2. **自動チェック**: CI/CDパイプラインの通過
3. **コードレビュー**: 最低2名のレビュアーによる確認
4. **修正対応**: レビューコメントへの対応
5. **マージ**: 承認後のマージ

## 参考資料

- [Next.js Documentation](https://nextjs.org/docs)
- [NextAuth.js Documentation](https://next-auth.js.org)
- [Drizzle ORM Documentation](https://orm.drizzle.team)
- [Docker Documentation](https://docs.docker.com)
- [TypeScript Documentation](https://www.typescriptlang.org/docs)

## サポート・問い合わせ

- **Issues**: [GitHub Issues](https://github.com/your-org/docker-mcp-web-manager-v2/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/docker-mcp-web-manager-v2/discussions)
- **Email**: dev-team@your-domain.com

---

このドキュメントは継続的に更新されます。最新情報については、GitHubリポジトリを確認してください。