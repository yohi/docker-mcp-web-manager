# 推奨コマンド一覧

## 開発コマンド
```bash
# 依存関係のインストール
npm install

# 開発サーバー起動
npm run dev

# TypeScript 型チェック
npm run type-check

# ESLint 実行
npm run lint

# 開発サーバー起動（ブラウザで http://localhost:3000 を開く）
npm run dev
```

## テストコマンド
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

# テスト実行（基本）
npm run test
```

## データベースコマンド
```bash
# データベースの初期化
npm run db:migrate

# データベースの再初期化
npm run db:reset
npm run db:migrate
```

## Docker関連コマンド
```bash
# Docker Compose でのデプロイ
docker-compose -f docker-compose.prod.yml up -d

# アプリケーションログ
docker-compose logs app

# Docker MCP CLI ログ
docker-compose logs docker-mcp

# Docker デーモンの状態確認
docker version

# Docker サービスの再起動
sudo systemctl restart docker
```

## デバッグ・監視コマンド
```bash
# NextAuth.js のセッション確認
curl -b "cookies.txt" http://localhost:3000/api/v1/auth/session

# JWT トークンの確認
npm run debug:auth

# メモリ使用量確認
npm run debug:memory

# パフォーマンスプロファイル
npm run profile

# メトリクス確認
curl http://localhost:3000/api/v1/metrics

# ヘルスチェック
curl http://localhost:3000/api/v1/health
```

## セキュリティ関連コマンド
```bash
# セキュリティスキャン実行
npm run security:scan

# 依存関係の脆弱性チェック
npm audit

# セキュリティヘッダー確認
curl -I http://localhost:3000
```

## Git コマンド
```bash
# 現在の状態確認
git status

# ブランチの確認
git branch

# 変更のコミット
git add .
git commit -m "message"

# プッシュ
git push origin branch-name
```

## システム関連コマンド
```bash
# システムログ
journalctl -f -u docker

# データベースファイルの確認
ls -la ./data/

# 権限の確認
sudo usermod -aG docker $USER
```