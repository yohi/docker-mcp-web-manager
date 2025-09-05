# タスク完了時のチェックリスト

## 必須チェック項目

### コード品質
- [ ] TypeScript 型チェック実行: `npm run type-check`
- [ ] ESLint チェック実行: `npm run lint`
- [ ] Prettier フォーマット適用
- [ ] セキュリティ要件の確認（特に DockerMCPClient クラス）

### テスト
- [ ] 単体テスト実行: `npm run test:unit`
- [ ] 結合テスト実行: `npm run test:integration`
- [ ] E2E テスト実行: `npm run test:e2e`
- [ ] テストカバレッジ確認: `npm run test:coverage`

### セキュリティ
- [ ] セキュリティスキャン実行: `npm run security:scan`
- [ ] 依存関係の脆弱性チェック: `npm audit`
- [ ] Shell injection 対策の確認
- [ ] 入力値検証の実装確認

### データベース
- [ ] マイグレーション実行: `npm run db:migrate`
- [ ] データベース整合性チェック
- [ ] Foreign keys の有効化確認

### 監視・ログ
- [ ] 構造化ログの実装確認
- [ ] エラーハンドリングの実装確認
- [ ] メトリクス収集の動作確認

### Docker
- [ ] Docker ビルドテスト: `docker build .`
- [ ] Docker Compose 起動テスト: `docker-compose up --build`
- [ ] コンテナのヘルスチェック確認

## Git フロー
- [ ] 適切なブランチでの作業確認
- [ ] コミットメッセージの品質確認
- [ ] 変更差分のレビュー
- [ ] タスク完了後の tasks.md 更新

## ドキュメント
- [ ] README.md の更新（必要に応じて）
- [ ] API ドキュメントの更新
- [ ] コードコメントの適切性確認

## パフォーマンス
- [ ] ビルド時間の確認
- [ ] 実行時パフォーマンスの確認
- [ ] メモリ使用量の確認

## 本番環境準備
- [ ] 環境変数の設定確認
- [ ] HTTPS 設定の確認（本番時）
- [ ] ログローテーション設定
- [ ] 監視システム統合確認