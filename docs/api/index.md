# Docker MCP Web Manager - API ドキュメント

Docker MCP Web Manager の REST API 仕様書へようこそ。このドキュメントでは、システムの API エンドポイントの詳細な使用方法を説明します。

## 📚 ドキュメント一覧

### 📖 [API仕様書概要](./README.md)
- API の基本情報と概要
- 認証・認可システム
- 共通レスポンス形式
- エラーコード一覧
- 全エンドポイントの概要

### 🔧 [OpenAPI仕様](./openapi.yaml)
- OpenAPI 3.0.3 形式の詳細API仕様
- スキーマ定義
- リクエスト/レスポンス形式
- パラメータ仕様
- Swagger UI 対応

### 💡 [使用例集](./examples.md)
- 具体的な API 使用例
- cURL コマンド例
- クライアントライブラリの使用方法
- WebSocket 接続例
- エラーハンドリング例

### 🔗 [エンドポイント詳細](./endpoints/)
各エンドポイントの詳細ドキュメント：
- [サーバー管理API](./endpoints/servers.md)
- [カタログAPI](./endpoints/catalog.md)
- [シークレット管理API](./endpoints/secrets.md)
- [ジョブ管理API](./endpoints/jobs.md)
- [監視API](./endpoints/monitoring.md)
- [設定API](./endpoints/config.md)

## 🚀 クイックスタート

### 1. 認証
API を使用するには、まずセッション認証が必要です：

```bash
# ヘルスチェック（認証不要）
curl -X GET "http://localhost:3000/api/health"

# 認証が必要なエンドポイント
curl -X GET "http://localhost:3000/api/v1/servers" \
  -H "Cookie: next-auth.session-token=your-session-token"
```

### 2. 基本的な操作
```bash
# サーバー一覧の取得
curl -X GET "http://localhost:3000/api/v1/servers"

# 新しいサーバーの作成
curl -X POST "http://localhost:3000/api/v1/servers" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-server", "image": "node:latest", "port": 3000}'
```

### 3. WebSocket 接続
```javascript
const ws = new WebSocket('ws://localhost:3000/api/ws');
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('リアルタイム更新:', message);
};
```

## 🔍 API 機能概要

### 🖥️ サーバー管理
- MCP サーバーの作成、更新、削除
- ステータス監視とログ閲覧
- 設定管理とボリューム管理

### 📖 カタログ
- 利用可能な MCP サーバーの検索
- カテゴリとタグによるフィルタリング
- 人気度と更新日による並び替え

### 🔐 シークレット管理
- 暗号化されたシークレットの保存
- 安全なアクセス制御
- Bitwarden 統合サポート

### ⚙️ ジョブ管理
- 非同期タスクの実行と監視
- プログレス追跡
- 結果とエラーの確認

### 📊 監視
- システムリソース監視
- Docker コンテナ状態監視
- API パフォーマンス指標

## 🔧 開発ツール

### Swagger UI
OpenAPI 仕様をブラウザで確認：
```
http://localhost:3000/api/docs
```

### API テストツール
- **Postman**: [コレクションをダウンロード](./postman-collection.json)
- **Insomnia**: [ワークスペースをインポート](./insomnia-workspace.json)
- **cURL**: 各ドキュメントにサンプルコマンドを記載

### クライアントライブラリ

#### JavaScript/TypeScript
```bash
npm install @docker-mcp/client
```

#### Python
```bash
pip install docker-mcp-client
```

#### Go
```bash
go get github.com/docker-mcp/go-client
```

## 📝 API バージョニング

現在サポートされているAPIバージョン：

| バージョン | ステータス | サポート期限 | 主な機能 |
| ---------- | ---------- | ------------ | -------- |
| v1         | 現行       | 2025年12月   | 全機能   |

### 破壊的変更ポリシー
- メジャーバージョンアップ時のみ破壊的変更を実施
- 6ヶ月前の事前通知
- 移行ガイドとツールの提供

## 🔒 セキュリティ

### 認証・認可
- セッションベース認証
- 役割ベースアクセス制御 (RBAC)
- API キーサポート（v1.1予定）

### レート制限
- IP アドレス別制限
- ユーザー別制限
- エンドポイント別制限

### セキュリティヘッダー
- CORS 対応
- CSP (Content Security Policy)
- HSTS (HTTP Strict Transport Security)

## 📈 パフォーマンス

### レスポンス時間目標
- 読み取り操作: < 100ms (95パーセンタイル)
- 書き込み操作: < 200ms (95パーセンタイル)
- 検索操作: < 300ms (95パーセンタイル)

### スケーラビリティ
- 水平スケーリング対応
- データベース接続プーリング
- Redis キャッシュ統合

## 🆘 サポート

### ドキュメント
- [API仕様書詳細](./README.md)
- [トラブルシューティング](../troubleshooting.md)
- [FAQ](../faq.md)

### コミュニティ
- [GitHub Issues](https://github.com/yourusername/docker-mcp-web-manager/issues)
- [Discord チャンネル](https://discord.gg/docker-mcp)
- [開発者フォーラム](https://forum.docker-mcp.example.com)

### 商用サポート
- [エンタープライズサポート](mailto:enterprise@docker-mcp.example.com)
- [SLA オプション](../support/sla.md)
- [カスタム開発](../support/custom-development.md)

## 🔄 更新履歴

| 日付       | バージョン | 変更内容           |
| ---------- | ---------- | ------------------ |
| 2024-01-01 | v1.0.0     | 初回リリース       |
| 2024-01-15 | v1.1.0     | WebSocket API 追加 |
| 2024-02-01 | v1.2.0     | 監視API機能拡張    |

最新の更新情報は [CHANGELOG](../../CHANGELOG.md) をご確認ください。

## 📄 ライセンス

このAPIは [MIT License](../../LICENSE) の下で提供されています。

---

**始める準備はできましたか？** [API仕様書概要](./README.md) から詳細を確認するか、[使用例集](./examples.md) で実際のコードサンプルをご覧ください。
