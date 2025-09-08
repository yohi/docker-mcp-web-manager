# Docker MCP Web Manager v2 API Documentation

## 概要

Docker MCP Web Manager v2は、MCPサーバーの包括的な管理を提供するWebアプリケーションです。このAPIドキュメントでは、システムが提供するRESTful APIエンドポイントについて詳細に説明します。

## 基本情報

- **Base URL**: `https://your-domain.com/api/v1`
- **Authentication**: NextAuth.js (JWT)
- **Content Type**: `application/json`
- **API Version**: v1

## 認証

すべてのAPIエンドポイントは認証が必要です。以下の方法で認証を行います：

### 1. セッション認証（推奨）
Webアプリケーションでは、NextAuth.jsセッションを使用します。

### 2. Bearer Token
APIクライアントでは、JWTトークンを使用します：

```http
Authorization: Bearer <your-jwt-token>
```

### 認証エンドポイント

```http
POST /api/auth/signin
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

## 権限管理

システムには以下の役割があります：

| 役割 | 説明 | 権限 |
|------|------|------|
| `admin` | 管理者 | 全ての操作が可能 |
| `user` | 一般ユーザー | サーバー管理、ログ閲覧が可能 |
| `viewer` | 閲覧者 | 読み取り専用アクセス |

## 共通レスポンス形式

### 成功レスポンス
```json
{
  "success": true,
  "data": {...},
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "totalPages": 2,
    "hasNext": true,
    "hasPrev": false
  },
  "meta": {
    "version": "v1",
    "requestId": "req_1234567890_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "duration": 150
  }
}
```

### エラーレスポンス
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": {...},
    "requestId": "req_1234567890_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

## エラーコード

| コード | HTTP Status | 説明 |
|--------|-------------|------|
| `UNAUTHORIZED` | 401 | 認証が必要 |
| `FORBIDDEN` | 403 | 権限が不足 |
| `VALIDATION_ERROR` | 400 | リクエストデータの検証失敗 |
| `RESOURCE_NOT_FOUND` | 404 | リソースが見つからない |
| `CONFLICT` | 409 | リソースの競合 |
| `INTERNAL_ERROR` | 500 | 内部サーバーエラー |
| `SERVER_001` | 500 | サーバー操作エラー |
| `SECRET_001` | 500 | シークレット操作エラー |
| `CONFIG_001` | 500 | 設定操作エラー |

## エンドポイント一覧

### サーバー管理
- [GET /api/v1/servers](./servers/GET.md) - サーバー一覧取得
- [POST /api/v1/servers](./servers/POST.md) - サーバー作成
- [GET /api/v1/servers/{id}](./servers/GET_id.md) - サーバー詳細取得
- [PUT /api/v1/servers/{id}](./servers/PUT_id.md) - サーバー更新
- [DELETE /api/v1/servers/{id}](./servers/DELETE_id.md) - サーバー削除
- [POST /api/v1/servers/{id}/start](./servers/POST_start.md) - サーバー開始
- [POST /api/v1/servers/{id}/stop](./servers/POST_stop.md) - サーバー停止

### テスト・ログ
- [POST /api/v1/servers/{id}/test](./servers/POST_test.md) - ツールテスト実行
- [GET /api/v1/servers/{id}/logs](./servers/GET_logs.md) - ログ取得
- [GET /api/v1/servers/{id}/logs/download](./servers/GET_logs_download.md) - ログダウンロード
- [GET /api/v1/servers/{id}/logs/stream](./servers/GET_logs_stream.md) - ログストリーミング

### カタログ
- [GET /api/v1/catalog](./catalog/GET.md) - カタログ一覧取得
- [GET /api/v1/catalog/{id}](./catalog/GET_id.md) - カタログエントリ詳細取得
- [POST /api/v1/catalog/install](./catalog/POST_install.md) - サーバーインストール

### シークレット管理
- [GET /api/v1/secrets](./secrets/GET.md) - シークレット一覧取得
- [POST /api/v1/secrets](./secrets/POST.md) - シークレット作成
- [GET /api/v1/secrets/{id}](./secrets/GET_id.md) - シークレット詳細取得
- [PUT /api/v1/secrets/{id}](./secrets/PUT_id.md) - シークレット更新
- [DELETE /api/v1/secrets/{id}](./secrets/DELETE_id.md) - シークレット削除
- [GET /api/v1/secrets/{id}/value](./secrets/GET_value.md) - シークレット値取得
- [POST /api/v1/secrets/sync](./secrets/POST_sync.md) - Bitwarden同期

### システム設定
- [GET /api/v1/config](./config/GET.md) - 設定一覧取得
- [PUT /api/v1/config](./config/PUT.md) - 設定更新
- [GET /api/v1/config/{key}](./config/GET_key.md) - 個別設定取得
- [PUT /api/v1/config/{key}](./config/PUT_key.md) - 個別設定更新
- [DELETE /api/v1/config/{key}](./config/DELETE_key.md) - 設定リセット

### ジョブ管理
- [GET /api/v1/jobs](./jobs/GET.md) - ジョブ一覧取得
- [GET /api/v1/jobs/{id}](./jobs/GET_id.md) - ジョブ詳細取得
- [DELETE /api/v1/jobs/{id}](./jobs/DELETE_id.md) - ジョブキャンセル

## 共通パラメーター

### ページネーション
```
?page=1&limit=50
```

| パラメーター | 型 | デフォルト | 説明 |
|--------------|----|-----------|----|
| `page` | integer | 1 | ページ番号 |
| `limit` | integer | 50 | 1ページあたりの件数 (最大100) |

### ソート
```
?sortBy=createdAt&sortOrder=desc
```

| パラメーター | 型 | デフォルト | 説明 |
|--------------|----|-----------|----|
| `sortBy` | string | - | ソートフィールド |
| `sortOrder` | string | asc | ソート順序 (`asc` または `desc`) |

### 検索・フィルタリング
```
?search=keyword&status=running&createdAfter=2024-01-01
```

各エンドポイントで利用可能なフィルタリングパラメーターについては、個別のドキュメントを参照してください。

## Rate Limiting

APIには以下のレート制限が適用されます：

| エンドポイントタイプ | 制限 |
|---------------------|------|
| 認証関連 | 5 requests/minute |
| 読み取り操作 | 100 requests/minute |
| 書き込み操作 | 30 requests/minute |
| シークレット値取得 | 10 requests/minute |

制限に達した場合、HTTP 429 Too Many Requestsが返されます。

## WebSocket / Server-Sent Events

リアルタイム機能には以下の仕様があります：

### ログストリーミング
```
GET /api/v1/servers/{id}/logs/stream
Accept: text/event-stream
```

イベント形式：
```
data: {"type": "log", "timestamp": "...", "level": "info", "message": "..."}

data: {"type": "error", "timestamp": "...", "error": "Connection lost"}

data: {"type": "connected", "serverId": "...", "timestamp": "..."}
```

## セキュリティ

### HTTPSの使用
本番環境では必ずHTTPS接続を使用してください。

### API キーの管理
- APIキーは安全に保管してください
- 定期的にローテーションを行ってください
- 不要になったキーは無効化してください

### データの暗号化
- 機密データは AES-256-GCM で暗号化されています
- 転送中のデータは TLS 1.2+ で保護されています

### 監査ログ
すべてのAPI呼び出しは監査ログに記録され、以下の情報が保存されます：
- リクエストID
- ユーザー情報
- 実行時刻
- 操作内容
- レスポンス状況

## SDK・クライアントライブラリ

以下の言語用のクライアントライブラリが利用可能です：

- [JavaScript/TypeScript](./sdks/typescript.md)
- [Python](./sdks/python.md)
- [Go](./sdks/go.md)

## サンプルコード

### JavaScript/TypeScript
```typescript
import { DockerMCPClient } from 'docker-mcp-client';

const client = new DockerMCPClient({
  baseURL: 'https://your-domain.com/api/v1',
  token: 'your-jwt-token'
});

// サーバー一覧を取得
const servers = await client.servers.list();

// サーバーを作成
const newServer = await client.servers.create({
  name: 'my-server',
  image: 'my-app:latest',
  description: 'My application server'
});
```

### curl
```bash
# 認証
curl -X POST "https://your-domain.com/api/auth/signin" \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password123"}'

# サーバー一覧取得
curl -X GET "https://your-domain.com/api/v1/servers" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json"

# サーバー作成
curl -X POST "https://your-domain.com/api/v1/servers" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-server",
    "image": "my-app:latest",
    "description": "My application server"
  }'
```

## バージョン管理

APIバージョンは以下の規則に従います：

- **Major Version**: 破壊的変更
- **Minor Version**: 後方互換性のある機能追加
- **Patch Version**: バグフィックス

現在のバージョン: **v1.0.0**

## サポート・フィードバック

- **Issues**: [GitHub Issues](https://github.com/your-org/docker-mcp-web-manager-v2/issues)
- **Documentation**: [API Documentation](https://docs.your-domain.com/api)
- **Contact**: support@your-domain.com

## 更新履歴

### v1.0.0 (2024-01-01)
- 初回リリース
- 基本的なサーバー管理機能
- シークレット管理
- カタログ機能
- ログ・監視機能

---

詳細な各エンドポイントのドキュメントについては、上記のリンクを参照してください。