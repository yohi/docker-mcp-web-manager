# 開発ワークフロー

## 基本的な開発フロー

### 1. 開発環境のセットアップ
```bash
# リポジトリのクローン
git clone https://github.com/your-org/docker-mcp-web-manager.git
cd docker-mcp-web-manager

# 依存関係のインストール
npm install

# 環境変数の設定
cp .env.example .env.local
# .env.local を適切に編集

# データベースの初期化
npm run db:migrate

# 開発サーバーの起動
npm run dev
```

### 2. タスクベースの開発
- `.specs/tasks.md` に従ってタスクを実行
- 各タスクごとに新しいブランチを作成: `task/{番号}-{説明}`
- 現在のブランチ: `task/11-documentation-and-deployment`

### 3. ブランチ戦略
- main/master: 本番環境用
- task/*: 各タスク専用ブランチ
- feature/*: 機能追加用ブランチ
- fix/*: バグ修正用ブランチ

### 4. コミット戦略
- 意味のある単位でコミット
- コミットメッセージは日本語で明確に
- タスク完了時に tasks.md を更新

### 5. プルリクエスト
- タスク完了後にプルリクエストを作成
- レビュー後にマージ

## 現在の開発状況
- **現在のブランチ**: task/11-documentation-and-deployment
- **進行中のタスク**: Task 11 - 包括的なドキュメント作成
- **プロジェクト段階**: 初期実装前の仕様策定・ドキュメント化段階

## 次のステップ
1. Task 11 の完了（ドキュメント作成）
2. Task 1 から実際の実装開始
3. プロジェクト構造とコア設定のセットアップ
4. データベース層と基本モデルの実装

## 重要な注意事項
- セキュリティ要件は必須（Shell injection prevention、Timeout control等）
- Google TypeScript スタイルガイドに準拠
- すべての変更はテストと品質チェックを通す
- パフォーマンスと監視を重視