# コードスタイルと規約

## コード品質ツール
- **TypeScript**: 型安全性を保証
- **ESLint**: コード品質チェック
- **Prettier**: コードフォーマット
- **Husky**: Git フック

## コーディング規約

### TypeScript
- 厳格な型安全性を維持
- インターフェースを適切に定義
- Zod を使用したバリデーション

### Next.js 14 App Router 規約
- App Router アーキテクチャに従う
- API Routes を適切に実装
- Server Components と Client Components を適切に分離

### セキュリティ要件（必須）
- **Shell Injection Prevention**: 
  - `spawn`/`execFile` を引数配列で使用、shell無効化
  - すべてのコマンド引数の検証とサニタイズ
  - docker mcp サブコマンドのホワイトリストベース検証
- **Timeout & Cancellation**: 
  - AbortController を使用したタイムアウト・リトライ・キャンセル
  - 設定可能なタイムアウト制限
  - 指数バックオフリトライ戦略
- **Structured Error Handling**: 
  - 終了コードとstderrを含む構造化エラー
  - エラー分類とコンテキスト保持
- **JSON Validation**: 
  - Zod スキーマバリデーションによる厳密なJSONパース
  - 不正なJSONの適切な処理

### データベース
- SQLite を開発環境で使用
- PRAGMA foreign_keys=ON および journal_mode=WAL
- Repository パターンでデータアクセス層を実装

### 認証・認可
- NextAuth.js v5 を使用
- JWT ベースのセッション管理
- ロールベースアクセス制御 (RBAC)

### テスト
- Jest による単体テスト
- React Testing Library によるコンポーネントテスト
- Playwright による E2E テスト
- カバレッジ閾値の維持

### ログ・監視
- 構造化ログの実装
- Prometheus メトリクスの収集
- エラーコンテキストの保持