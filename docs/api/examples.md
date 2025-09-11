# API使用例集

このドキュメントでは、Docker MCP Web Manager APIの具体的な使用例を示します。

## 目次

1. [認証とセッション管理](#認証とセッション管理)
2. [MCPサーバー管理](#mcpサーバー管理)
3. [カタログ検索と閲覧](#カタログ検索と閲覧)
4. [シークレット管理](#シークレット管理)
5. [監視とジョブ管理](#監視とジョブ管理)
6. [エラーハンドリング](#エラーハンドリング)
7. [WebSocket接続](#websocket接続)

## 認証とセッション管理

### セッション状態の確認

```bash
curl -X GET "http://localhost:3000/api/health" \
  -H "Accept: application/json"
```

**レスポンス例**:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "version": "2.0.0",
  "environment": "development",
  "uptime": 3600
}
```

### 認証が必要なエンドポイントへのアクセス

```bash
curl -X GET "http://localhost:3000/api/v1/servers" \
  -H "Accept: application/json" \
  -H "Cookie: next-auth.session-token=your-session-token"
```

## MCPサーバー管理

### サーバー一覧の取得

```bash
# 基本的な一覧取得
curl -X GET "http://localhost:3000/api/v1/servers" \
  -H "Accept: application/json" \
  -H "Cookie: next-auth.session-token=your-session-token"
```

**レスポンス例**:
```json
{
  "success": true,
  "data": [
    {
      "id": "1",
      "name": "test-server-1",
      "status": "running",
      "image": "node:latest",
      "port": 3000,
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z"
    },
    {
      "id": "2",
      "name": "test-server-2",
      "status": "stopped",
      "image": "nginx:latest",
      "port": 8080,
      "createdAt": "2024-01-02T00:00:00Z",
      "updatedAt": "2024-01-02T00:00:00Z"
    }
  ],
  "meta": {
    "requestId": "req_1703761200000_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "version": "v1",
    "duration": 150,
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 2,
      "hasNext": false,
      "hasPrev": false
    }
  }
}
```

### フィルタリングとページネーション

```bash
# 実行中のサーバーのみを取得（2ページ目、5件ずつ）
curl -X GET "http://localhost:3000/api/v1/servers?status=running&page=2&limit=5" \
  -H "Accept: application/json" \
  -H "Cookie: next-auth.session-token=your-session-token"
```

### 名前による検索

```bash
# 名前に "web" が含まれるサーバーを検索
curl -X GET "http://localhost:3000/api/v1/servers?search=web" \
  -H "Accept: application/json" \
  -H "Cookie: next-auth.session-token=your-session-token"
```

### ソート

```bash
# 作成日時の昇順でソート
curl -X GET "http://localhost:3000/api/v1/servers?sort_by=createdAt&sort_order=asc" \
  -H "Accept: application/json" \
  -H "Cookie: next-auth.session-token=your-session-token"
```

### 新しいサーバーの作成

```bash
curl -X POST "http://localhost:3000/api/v1/servers" \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=your-session-token" \
  -d '{
    "name": "my-mcp-server",
    "image": "node:18-alpine",
    "port": 3000,
    "environment": {
      "NODE_ENV": "production",
      "LOG_LEVEL": "info"
    },
    "volumes": [
      "/host/data:/app/data",
      "/host/logs:/app/logs"
    ]
  }'
```

**成功レスポンス (201 Created)**:
```json
{
  "success": true,
  "data": {
    "id": "srv_1703761200000_xyz789",
    "name": "my-mcp-server",
    "status": "starting",
    "image": "node:18-alpine",
    "port": 3000,
    "environment": {
      "NODE_ENV": "production",
      "LOG_LEVEL": "info"
    },
    "volumes": [
      "/host/data:/app/data",
      "/host/logs:/app/logs"
    ],
    "createdAt": "2024-01-01T12:00:00.000Z",
    "updatedAt": "2024-01-01T12:00:00.000Z"
  },
  "meta": {
    "requestId": "req_1703761200000_create123",
    "timestamp": "2024-01-01T12:00:00.000Z",
    "version": "v1",
    "duration": 250
  }
}
```

### サーバー詳細の取得

```bash
curl -X GET "http://localhost:3000/api/v1/servers/srv_1703761200000_xyz789" \
  -H "Accept: application/json" \
  -H "Cookie: next-auth.session-token=your-session-token"
```

**レスポンス例**:
```json
{
  "success": true,
  "data": {
    "id": "srv_1703761200000_xyz789",
    "name": "my-mcp-server",
    "status": "running",
    "image": "node:18-alpine",
    "port": 3000,
    "environment": {
      "NODE_ENV": "production",
      "LOG_LEVEL": "info"
    },
    "volumes": [
      "/host/data:/app/data",
      "/host/logs:/app/logs"
    ],
    "logs": [
      {
        "timestamp": "2024-01-01T12:01:00.000Z",
        "level": "info",
        "message": "Server started on port 3000"
      },
      {
        "timestamp": "2024-01-01T12:01:30.000Z",
        "level": "info",
        "message": "MCP protocol initialized"
      }
    ],
    "createdAt": "2024-01-01T12:00:00.000Z",
    "updatedAt": "2024-01-01T12:01:00.000Z"
  },
  "meta": {
    "requestId": "req_1703761260000_detail456",
    "timestamp": "2024-01-01T12:01:00.000Z",
    "version": "v1",
    "duration": 89
  }
}
```

### サーバー設定の更新

```bash
curl -X PUT "http://localhost:3000/api/v1/servers/srv_1703761200000_xyz789" \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=your-session-token" \
  -d '{
    "name": "my-mcp-server-updated",
    "image": "node:18-alpine",
    "port": 3001,
    "environment": {
      "NODE_ENV": "production",
      "LOG_LEVEL": "debug",
      "MAX_CONNECTIONS": "100"
    }
  }'
```

### サーバーの削除

```bash
curl -X DELETE "http://localhost:3000/api/v1/servers/srv_1703761200000_xyz789" \
  -H "Cookie: next-auth.session-token=your-session-token"
```

**成功レスポンス (204 No Content)**: レスポンスボディなし

## カタログ検索と閲覧

### カタログ一覧の取得

```bash
curl -X GET "http://localhost:3000/api/v1/catalog" \
  -H "Accept: application/json" \
  -H "Cookie: next-auth.session-token=your-session-token"
```

### カテゴリによるフィルタリング

```bash
# AI/ML関連のMCPサーバーを取得
curl -X GET "http://localhost:3000/api/v1/catalog?category=ai-ml" \
  -H "Accept: application/json" \
  -H "Cookie: next-auth.session-token=your-session-token"
```

### タグによるフィルタリング

```bash
# "database"と"python"タグが付いているサーバーを取得
curl -X GET "http://localhost:3000/api/v1/catalog?tags=database,python" \
  -H "Accept: application/json" \
  -H "Cookie: next-auth.session-token=your-session-token"
```

### キーワード検索

```bash
curl -X GET "http://localhost:3000/api/v1/catalog/search?search=database%20connector" \
  -H "Accept: application/json" \
  -H "Cookie: next-auth.session-token=your-session-token"
```

**レスポンス例**:
```json
{
  "success": true,
  "data": {
    "entries": [
      {
        "id": "mcp-postgres-connector",
        "name": "PostgreSQL MCP Connector",
        "description": "PostgreSQLデータベースへの接続とクエリ実行を提供するMCPサーバー",
        "version": "1.2.0",
        "category": "database",
        "tags": ["database", "postgresql", "sql"],
        "author": "MCP Team",
        "repository": "https://github.com/mcp-team/postgres-connector",
        "dockerImage": "mcpteam/postgres-connector:1.2.0",
        "popularity": 150,
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-15T00:00:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 20
  }
}
```

### カテゴリ一覧の取得

```bash
curl -X GET "http://localhost:3000/api/v1/catalog/categories" \
  -H "Accept: application/json" \
  -H "Cookie: next-auth.session-token=your-session-token"
```

**レスポンス例**:
```json
{
  "success": true,
  "data": [
    {
      "name": "ai-ml",
      "count": 25
    },
    {
      "name": "database",
      "count": 18
    },
    {
      "name": "web-services",
      "count": 32
    },
    {
      "name": "utilities",
      "count": 15
    }
  ]
}
```

### 人気順ソート

```bash
curl -X GET "http://localhost:3000/api/v1/catalog/search?search=ai&sortBy=popularity&sortOrder=desc" \
  -H "Accept: application/json" \
  -H "Cookie: next-auth.session-token=your-session-token"
```

## シークレット管理

### シークレット一覧の取得

```bash
curl -X GET "http://localhost:3000/api/v1/secrets" \
  -H "Accept: application/json" \
  -H "Cookie: next-auth.session-token=your-session-token"
```

**レスポンス例**:
```json
{
  "success": true,
  "data": [
    {
      "id": "secret_db_password_001",
      "name": "database_password",
      "description": "本番データベースの接続パスワード",
      "tags": ["database", "production"],
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### 新しいシークレットの作成

```bash
curl -X POST "http://localhost:3000/api/v1/secrets" \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=your-session-token" \
  -d '{
    "name": "api_key_openai",
    "value": "sk-1234567890abcdef...",
    "description": "OpenAI API アクセスキー",
    "tags": ["api", "openai", "production"]
  }'
```

### シークレットの更新

```bash
curl -X PUT "http://localhost:3000/api/v1/secrets/secret_db_password_001" \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=your-session-token" \
  -d '{
    "name": "database_password",
    "value": "new_secure_password_123",
    "description": "本番データベースの接続パスワード（更新済み）",
    "tags": ["database", "production", "updated"]
  }'
```

### シークレットの削除

```bash
curl -X DELETE "http://localhost:3000/api/v1/secrets/secret_db_password_001" \
  -H "Cookie: next-auth.session-token=your-session-token"
```

## 監視とジョブ管理

### システム監視データの取得

```bash
curl -X GET "http://localhost:3000/api/v1/monitoring" \
  -H "Accept: application/json" \
  -H "Cookie: next-auth.session-token=your-session-token"
```

**レスポンス例**:
```json
{
  "success": true,
  "data": {
    "system": {
      "cpu": 45.2,
      "memory": 68.7,
      "disk": 23.1
    },
    "docker": {
      "containersRunning": 5,
      "containersStopped": 2,
      "images": 12
    },
    "api": {
      "requestsPerMinute": 150,
      "averageResponseTime": 89,
      "errorRate": 0.02
    }
  },
  "meta": {
    "requestId": "req_1703761200000_monitoring",
    "timestamp": "2024-01-01T12:00:00.000Z",
    "version": "v1",
    "duration": 45
  }
}
```

### ジョブ一覧の取得

```bash
curl -X GET "http://localhost:3000/api/v1/jobs" \
  -H "Accept: application/json" \
  -H "Cookie: next-auth.session-token=your-session-token"
```

### 実行中のジョブのみを取得

```bash
curl -X GET "http://localhost:3000/api/v1/jobs?status=running" \
  -H "Accept: application/json" \
  -H "Cookie: next-auth.session-token=your-session-token"
```

### 特定のジョブ詳細

```bash
curl -X GET "http://localhost:3000/api/v1/jobs/job_server_create_001" \
  -H "Accept: application/json" \
  -H "Cookie: next-auth.session-token=your-session-token"
```

**レスポンス例**:
```json
{
  "success": true,
  "data": {
    "id": "job_server_create_001",
    "type": "server_create",
    "status": "running",
    "progress": 75,
    "message": "Dockerコンテナを起動中...",
    "result": null,
    "error": null,
    "createdAt": "2024-01-01T12:00:00.000Z",
    "updatedAt": "2024-01-01T12:02:30.000Z"
  }
}
```

## エラーハンドリング

### バリデーションエラー

```bash
# 不正なデータでサーバー作成を試行
curl -X POST "http://localhost:3000/api/v1/servers" \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=your-session-token" \
  -d '{
    "name": "x",
    "image": "",
    "port": 99999
  }'
```

**エラーレスポンス (400 Bad Request)**:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "リクエストデータが無効です",
    "details": {
      "name": "名前は3文字以上である必要があります",
      "image": "イメージ名は必須です",
      "port": "ポート番号は1024-65535の範囲である必要があります"
    }
  },
  "meta": {
    "requestId": "req_1703761200000_error400",
    "timestamp": "2024-01-01T12:00:00.000Z",
    "version": "v1",
    "duration": 25
  }
}
```

### 認証エラー

```bash
# セッショントークンなしでアクセス
curl -X GET "http://localhost:3000/api/v1/servers" \
  -H "Accept: application/json"
```

**エラーレスポンス (401 Unauthorized)**:
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "認証が必要です",
    "details": {}
  },
  "meta": {
    "requestId": "req_1703761200000_error401",
    "timestamp": "2024-01-01T12:00:00.000Z",
    "version": "v1",
    "duration": 10
  }
}
```

### リソースが見つからない

```bash
curl -X GET "http://localhost:3000/api/v1/servers/nonexistent-id" \
  -H "Accept: application/json" \
  -H "Cookie: next-auth.session-token=your-session-token"
```

**エラーレスポンス (404 Not Found)**:
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "指定されたサーバーが見つかりません",
    "details": {
      "serverId": "nonexistent-id"
    }
  },
  "meta": {
    "requestId": "req_1703761200000_error404",
    "timestamp": "2024-01-01T12:00:00.000Z",
    "version": "v1",
    "duration": 15
  }
}
```

### レート制限エラー

```bash
# 短時間で大量のリクエストを送信した場合
curl -X GET "http://localhost:3000/api/v1/servers" \
  -H "Accept: application/json" \
  -H "Cookie: next-auth.session-token=your-session-token"
```

**エラーレスポンス (429 Too Many Requests)**:
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "リクエスト制限に達しました。しばらく時間を置いてから再試行してください",
    "details": {
      "retryAfter": 60,
      "limit": 100,
      "remaining": 0,
      "resetTime": "2024-01-01T12:01:00.000Z"
    }
  },
  "meta": {
    "requestId": "req_1703761200000_error429",
    "timestamp": "2024-01-01T12:00:00.000Z",
    "version": "v1",
    "duration": 5
  }
}
```

## WebSocket接続

### JavaScript での接続例

```javascript
// WebSocket接続の確立
const ws = new WebSocket('ws://localhost:3000/api/ws');

// 接続成功時
ws.onopen = function(event) {
  console.log('WebSocket接続が確立されました');
  
  // 特定のサーバーの状態更新を購読
  ws.send(JSON.stringify({
    type: 'subscribe',
    channel: 'server_status',
    serverId: 'srv_1703761200000_xyz789'
  }));
};

// メッセージ受信時
ws.onmessage = function(event) {
  const message = JSON.parse(event.data);
  console.log('受信メッセージ:', message);
  
  switch(message.type) {
    case 'server_status_update':
      updateServerStatus(message.data);
      break;
    case 'job_progress':
      updateJobProgress(message.data);
      break;
    default:
      console.log('未知のメッセージタイプ:', message.type);
  }
};

// エラー発生時
ws.onerror = function(error) {
  console.error('WebSocketエラー:', error);
};

// 接続終了時
ws.onclose = function(event) {
  console.log('WebSocket接続が終了されました');
  if (event.code !== 1000) {
    console.log('異常終了:', event.code, event.reason);
    // 再接続ロジックをここに実装
  }
};

// サーバー状態更新の処理
function updateServerStatus(data) {
  console.log(`サーバー ${data.serverId} の状態が ${data.status} に変更されました`);
  // UIの更新処理
}

// ジョブ進捗更新の処理
function updateJobProgress(data) {
  console.log(`ジョブ ${data.jobId}: ${data.progress}% 完了 - ${data.message}`);
  // プログレスバーの更新処理
}
```

### 購読チャンネル

#### サーバー状態の購読

```javascript
ws.send(JSON.stringify({
  type: 'subscribe',
  channel: 'server_status',
  serverId: 'srv_1703761200000_xyz789'  // 特定のサーバー
}));

// または全サーバーの状態更新を購読
ws.send(JSON.stringify({
  type: 'subscribe',
  channel: 'server_status',
  serverId: '*'  // 全サーバー
}));
```

#### ジョブ進捗の購読

```javascript
ws.send(JSON.stringify({
  type: 'subscribe',
  channel: 'job_progress',
  jobId: 'job_server_create_001'
}));
```

#### システム監視データの購読

```javascript
ws.send(JSON.stringify({
  type: 'subscribe',
  channel: 'monitoring'
}));
```

### 受信メッセージの例

#### サーバー状態更新

```json
{
  "type": "server_status_update",
  "data": {
    "serverId": "srv_1703761200000_xyz789",
    "status": "running",
    "previousStatus": "starting",
    "timestamp": "2024-01-01T12:01:00.000Z",
    "metadata": {
      "port": 3000,
      "image": "node:18-alpine"
    }
  }
}
```

#### ジョブ進捗更新

```json
{
  "type": "job_progress",
  "data": {
    "jobId": "job_server_create_001",
    "progress": 85,
    "status": "running",
    "message": "ヘルスチェックを実行中...",
    "estimatedTimeRemaining": 30,
    "timestamp": "2024-01-01T12:01:30.000Z"
  }
}
```

#### システム監視データ

```json
{
  "type": "monitoring_update",
  "data": {
    "system": {
      "cpu": 52.3,
      "memory": 71.2,
      "disk": 23.1
    },
    "timestamp": "2024-01-01T12:02:00.000Z"
  }
}
```

## クライアントライブラリの使用例

### JavaScript/TypeScript クライアント

```typescript
import { DockerMCPClient } from '@docker-mcp/client';

// クライアントの初期化
const client = new DockerMCPClient({
  baseURL: 'http://localhost:3000/api/v1',
  sessionToken: 'your-session-token'
});

// サーバー一覧の取得
const servers = await client.servers.list({
  page: 1,
  limit: 20,
  status: 'running'
});

// 新しいサーバーの作成
const newServer = await client.servers.create({
  name: 'my-mcp-server',
  image: 'node:18-alpine',
  port: 3000,
  environment: {
    NODE_ENV: 'production'
  }
});

// WebSocket接続
const ws = client.connectWebSocket();
ws.subscribe('server_status', '*', (update) => {
  console.log('サーバー状態更新:', update);
});
```

### Python クライアント

```python
from docker_mcp_client import DockerMCPClient

# クライアントの初期化
client = DockerMCPClient(
    base_url="http://localhost:3000/api/v1",
    session_token="your-session-token"
)

# サーバー一覧の取得
servers = client.servers.list(status="running", limit=20)

# 新しいサーバーの作成
new_server = client.servers.create(
    name="my-mcp-server",
    image="node:18-alpine",
    port=3000,
    environment={"NODE_ENV": "production"}
)

# WebSocket接続
def on_server_update(data):
    print(f"サーバー状態更新: {data}")

ws = client.connect_websocket()
ws.subscribe("server_status", "*", on_server_update)
```

## パフォーマンス最適化のヒント

### ページネーションの効率的な使用

```bash
# 小さなページサイズで開始
curl -X GET "http://localhost:3000/api/v1/servers?limit=10" \
  -H "Accept: application/json" \
  -H "Cookie: next-auth.session-token=your-session-token"

# 必要に応じてページサイズを調整
curl -X GET "http://localhost:3000/api/v1/servers?limit=50&page=2" \
  -H "Accept: application/json" \
  -H "Cookie: next-auth.session-token=your-session-token"
```

### 条件付きリクエスト

```bash
# ETagを使用したキャッシュ制御
curl -X GET "http://localhost:3000/api/v1/servers" \
  -H "Accept: application/json" \
  -H "If-None-Match: \"etag-value-from-previous-response\"" \
  -H "Cookie: next-auth.session-token=your-session-token"
```

### バッチ操作

複数のサーバーを操作する場合は、個別のリクエストよりもバッチ操作を検討してください：

```bash
# 複数サーバーの状態を一度に取得
curl -X GET "http://localhost:3000/api/v1/servers?ids=srv1,srv2,srv3" \
  -H "Accept: application/json" \
  -H "Cookie: next-auth.session-token=your-session-token"
```

これらの例を参考に、効率的でセキュアなAPIの使用を心がけてください。
