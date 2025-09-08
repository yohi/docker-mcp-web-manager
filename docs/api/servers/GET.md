# GET /api/v1/servers

サーバー一覧を取得します。ページネーション、ソート、フィルタリング機能をサポートしています。

## エンドポイント

```
GET /api/v1/servers
```

## 認証・権限

- **認証**: 必須
- **権限**: `SERVERS_READ`
- **対象役割**: `admin`, `user`, `viewer`

## クエリパラメーター

| パラメーター | 型 | 必須 | デフォルト | 説明 |
|--------------|----|----|-----------|------|
| `page` | integer | × | 1 | ページ番号 |
| `limit` | integer | × | 50 | 1ページあたりの件数 (最大100) |
| `sortBy` | string | × | name | ソートフィールド (`name`, `status`, `createdAt`, `updatedAt`) |
| `sortOrder` | string | × | asc | ソート順序 (`asc`, `desc`) |
| `search` | string | × | - | サーバー名での検索 |
| `status` | string | × | - | ステータスフィルター |
| `image` | string | × | - | イメージ名でのフィルター |

### ステータス値

| 値 | 説明 |
|----|------|
| `running` | 実行中 |
| `stopped` | 停止中 |
| `starting` | 開始中 |
| `stopping` | 停止中 |
| `error` | エラー状態 |

## レスポンス

### 成功時 (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "id": "srv_12345",
      "name": "my-mcp-server",
      "image": "my-app:latest",
      "status": "running",
      "description": "My MCP Server for testing",
      "environment": {
        "NODE_ENV": "production",
        "PORT": "3000"
      },
      "resourceLimits": {
        "memory": "512m",
        "cpu": "0.5"
      },
      "networkConfig": {
        "ports": [
          {
            "containerPort": 3000,
            "hostPort": 8080,
            "protocol": "tcp"
          }
        ]
      },
      "healthCheck": {
        "endpoint": "/health",
        "interval": 30,
        "timeout": 10,
        "retries": 3
      },
      "lastHealthCheck": "2024-01-01T12:30:00.000Z",
      "resourceUsage": {
        "cpu": 45.2,
        "memory": 234567890,
        "network": {
          "rx": 1234567,
          "tx": 987654
        }
      },
      "createdAt": "2024-01-01T10:00:00.000Z",
      "updatedAt": "2024-01-01T12:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 25,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  },
  "meta": {
    "version": "v1",
    "requestId": "req_1234567890_abc123",
    "timestamp": "2024-01-01T12:35:00.000Z",
    "duration": 150
  }
}
```

### エラーレスポンス

#### 401 Unauthorized
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required",
    "requestId": "req_1234567890_abc123",
    "timestamp": "2024-01-01T12:35:00.000Z"
  }
}
```

#### 403 Forbidden
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Insufficient permissions",
    "requestId": "req_1234567890_abc123",
    "timestamp": "2024-01-01T12:35:00.000Z"
  }
}
```

#### 400 Bad Request
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid query parameters",
    "details": {
      "sortBy": ["Invalid sort field: invalid_field"]
    },
    "requestId": "req_1234567890_abc123",
    "timestamp": "2024-01-01T12:35:00.000Z"
  }
}
```

## リクエスト例

### 基本的な取得
```bash
curl -X GET "https://api.example.com/api/v1/servers" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json"
```

### ページネーション付き
```bash
curl -X GET "https://api.example.com/api/v1/servers?page=2&limit=10" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json"
```

### フィルタリング
```bash
curl -X GET "https://api.example.com/api/v1/servers?status=running&search=my-server" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json"
```

### ソート
```bash
curl -X GET "https://api.example.com/api/v1/servers?sortBy=createdAt&sortOrder=desc" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json"
```

## JavaScript SDK例

```typescript
import { DockerMCPClient } from 'docker-mcp-client';

const client = new DockerMCPClient({
  baseURL: 'https://api.example.com/api/v1',
  token: 'your-jwt-token'
});

// 基本的な取得
const servers = await client.servers.list();

// パラメーター付き
const filteredServers = await client.servers.list({
  page: 1,
  limit: 20,
  status: 'running',
  sortBy: 'createdAt',
  sortOrder: 'desc'
});

console.log(`Found ${filteredServers.pagination.total} servers`);
```

## レスポンスフィールド詳細

### Server Object

| フィールド | 型 | 説明 |
|------------|----|----- |
| `id` | string | サーバーの一意識別子 |
| `name` | string | サーバー名（3-50文字、英数字とハイフン） |
| `image` | string | Dockerイメージ名 |
| `status` | string | 現在のステータス |
| `description` | string | サーバーの説明（任意） |
| `environment` | object | 環境変数 |
| `resourceLimits` | object | リソース制限設定 |
| `networkConfig` | object | ネットワーク設定 |
| `healthCheck` | object | ヘルスチェック設定 |
| `lastHealthCheck` | string | 最後のヘルスチェック実行時刻 |
| `resourceUsage` | object | 現在のリソース使用量 |
| `createdAt` | string | 作成日時 (ISO 8601) |
| `updatedAt` | string | 更新日時 (ISO 8601) |

### Resource Limits Object

| フィールド | 型 | 説明 |
|------------|----|----- |
| `memory` | string | メモリ制限 (例: "512m", "1g") |
| `cpu` | string | CPU制限 (例: "0.5", "1.0") |

### Network Config Object

| フィールド | 型 | 説明 |
|------------|----|----- |
| `ports` | array | ポートマッピング設定 |

### Health Check Object

| フィールド | 型 | 説明 |
|------------|----|----- |
| `endpoint` | string | ヘルスチェックエンドポイント |
| `interval` | integer | チェック間隔（秒） |
| `timeout` | integer | タイムアウト（秒） |
| `retries` | integer | リトライ回数 |

### Resource Usage Object

| フィールド | 型 | 説明 |
|------------|----|----- |
| `cpu` | number | CPU使用率（%） |
| `memory` | integer | メモリ使用量（バイト） |
| `network` | object | ネットワーク使用量 |

## エラーハンドリング

### 一般的なエラーパターン

1. **認証エラー** - トークンが無効または期限切れ
2. **権限エラー** - 必要な権限を持っていない
3. **バリデーションエラー** - クエリパラメーターが無効
4. **サーバーエラー** - データベースまたは内部エラー

### エラー対処法

```typescript
try {
  const servers = await client.servers.list();
} catch (error) {
  if (error.code === 'UNAUTHORIZED') {
    // 認証が必要 - ログイン画面にリダイレクト
    window.location.href = '/login';
  } else if (error.code === 'FORBIDDEN') {
    // 権限不足 - エラーメッセージを表示
    console.error('権限が不足しています');
  } else {
    // その他のエラー
    console.error('サーバー一覧の取得に失敗しました:', error.message);
  }
}
```

## パフォーマンス考慮事項

- **ページサイズ**: 大量のサーバーがある場合は、適切なページサイズ（10-50）を設定してください
- **フィルタリング**: 可能な限りサーバーサイドでフィルタリングを使用してください
- **キャッシュ**: 頻繁にアクセスする場合は、適切なキャッシュ戦略を検討してください
- **リアルタイム更新**: サーバー状態のリアルタイム更新が必要な場合は、WebSocketまたはServer-Sent Eventsの使用を検討してください

## 関連エンドポイント

- [POST /api/v1/servers](./POST.md) - サーバー作成
- [GET /api/v1/servers/{id}](./GET_id.md) - サーバー詳細取得
- [POST /api/v1/servers/{id}/start](./POST_start.md) - サーバー開始
- [POST /api/v1/servers/{id}/stop](./POST_stop.md) - サーバー停止