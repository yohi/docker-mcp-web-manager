# API ドキュメント

## 概要

Docker MCP Web Manager の REST API エンドポイントの完全な仕様書です。

## 認証

すべての保護されたエンドポイントには Authorization ヘッダーが必要です。

```
Authorization: Bearer <jwt_token>
```

### 認証フロー

1. `/api/v1/auth/login` でログイン
2. レスポンスから JWT トークンを取得
3. 後続のリクエストで Authorization ヘッダーに含める

## ベース URL

- **開発環境**: `http://localhost:3000`
- **本番環境**: `https://your-domain.com`

## エンドポイント一覧

### 認証・認可

#### `POST /api/v1/auth/login`

ユーザーログイン

**リクエスト**:
```json
{
  "email": "user@example.com",
  "password": "password123",
  "provider": "credentials"
}
```

**レスポンス**:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "user-123",
      "email": "user@example.com",
      "role": "user",
      "name": "John Doe"
    },
    "expiresAt": "2024-01-01T12:00:00Z"
  }
}
```

#### `POST /api/v1/auth/logout`

ユーザーログアウト

**ヘッダー**: 認証必須

**レスポンス**:
```json
{
  "success": true,
  "message": "ログアウトしました"
}
```

#### `GET /api/v1/auth/session`

現在のセッション情報を取得

**ヘッダー**: 認証必須

**レスポンス**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user-123",
      "email": "user@example.com",
      "role": "user",
      "name": "John Doe"
    },
    "expiresAt": "2024-01-01T12:00:00Z"
  }
}
```

### サーバー管理

#### `GET /api/v1/servers`

MCP サーバー一覧を取得

**ヘッダー**: 認証必須

**クエリパラメータ**:
- `limit` (オプション): 取得件数 (デフォルト: 50)
- `offset` (オプション): オフセット (デフォルト: 0)
- `status` (オプション): フィルター条件 (`running`, `stopped`, `error`)
- `search` (オプション): 検索キーワード

**レスポンス**:
```json
{
  "success": true,
  "data": {
    "servers": [
      {
        "id": "server-123",
        "name": "Weather API Server",
        "image": "mcp/weather-server:latest",
        "status": "running",
        "port": 3001,
        "created_at": "2024-01-01T10:00:00Z",
        "updated_at": "2024-01-01T11:00:00Z",
        "configuration": {
          "environment": {
            "API_KEY": "***"
          },
          "resources": {
            "memory": "512MB",
            "cpu": "0.5"
          }
        }
      }
    ],
    "total": 1,
    "limit": 50,
    "offset": 0
  }
}
```

#### `GET /api/v1/servers/{id}`

特定のサーバー詳細を取得

**ヘッダー**: 認証必須

**パスパラメータ**:
- `id`: サーバーID

**レスポンス**:
```json
{
  "success": true,
  "data": {
    "server": {
      "id": "server-123",
      "name": "Weather API Server",
      "image": "mcp/weather-server:latest",
      "status": "running",
      "port": 3001,
      "created_at": "2024-01-01T10:00:00Z",
      "updated_at": "2024-01-01T11:00:00Z",
      "configuration": {
        "environment": {
          "API_KEY": "***"
        },
        "resources": {
          "memory": "512MB",
          "cpu": "0.5"
        },
        "networks": ["mcp-network"],
        "volumes": ["/data:/app/data"]
      },
      "tools": [
        {
          "name": "get_weather",
          "description": "天気情報を取得",
          "schema": {
            "type": "object",
            "properties": {
              "location": {"type": "string"}
            }
          }
        }
      ],
      "resources": [
        {
          "uri": "weather://current",
          "name": "現在の天気",
          "mimeType": "application/json"
        }
      ]
    }
  }
}
```

#### `POST /api/v1/servers`

新しいサーバーを作成

**ヘッダー**: 認証必須, Admin権限必要

**リクエスト**:
```json
{
  "name": "Weather API Server",
  "image": "mcp/weather-server:latest",
  "configuration": {
    "environment": {
      "API_KEY": "secret-key"
    },
    "resources": {
      "memory": "512MB",
      "cpu": "0.5"
    },
    "networks": ["mcp-network"],
    "volumes": ["/data:/app/data"],
    "ports": {
      "3001": "3001"
    }
  }
}
```

**レスポンス**:
```json
{
  "success": true,
  "data": {
    "server": {
      "id": "server-124",
      "name": "Weather API Server",
      "image": "mcp/weather-server:latest",
      "status": "creating",
      "created_at": "2024-01-01T12:00:00Z",
      "updated_at": "2024-01-01T12:00:00Z"
    }
  }
}
```

#### `PUT /api/v1/servers/{id}`

サーバー設定を更新

**ヘッダー**: 認証必須, Admin権限必要

**パスパラメータ**:
- `id`: サーバーID

**リクエスト**:
```json
{
  "name": "Updated Weather Server",
  "configuration": {
    "environment": {
      "API_KEY": "new-secret-key",
      "DEBUG": "true"
    }
  }
}
```

**レスポンス**:
```json
{
  "success": true,
  "data": {
    "server": {
      "id": "server-123",
      "name": "Updated Weather Server",
      "image": "mcp/weather-server:latest",
      "status": "updating",
      "updated_at": "2024-01-01T12:30:00Z"
    }
  }
}
```

#### `DELETE /api/v1/servers/{id}`

サーバーを削除

**ヘッダー**: 認証必須, Admin権限必要

**パスパラメータ**:
- `id`: サーバーID

**レスポンス**:
```json
{
  "success": true,
  "message": "サーバーが削除されました"
}
```

### サーバー操作

#### `POST /api/v1/servers/{id}/start`

サーバーを開始

**ヘッダー**: 認証必須

**パスパラメータ**:
- `id`: サーバーID

**レスポンス**:
```json
{
  "success": true,
  "data": {
    "server": {
      "id": "server-123",
      "status": "starting"
    }
  }
}
```

#### `POST /api/v1/servers/{id}/stop`

サーバーを停止

**ヘッダー**: 認証必須

**パスパラメータ**:
- `id`: サーバーID

**レスポンス**:
```json
{
  "success": true,
  "data": {
    "server": {
      "id": "server-123",
      "status": "stopping"
    }
  }
}
```

#### `POST /api/v1/servers/{id}/restart`

サーバーを再起動

**ヘッダー**: 認証必須

**パスパラメータ**:
- `id`: サーバーID

**レスポンス**:
```json
{
  "success": true,
  "data": {
    "server": {
      "id": "server-123",
      "status": "restarting"
    }
  }
}
```

### ログとモニタリング

#### `GET /api/v1/servers/{id}/logs`

サーバーのログを取得

**ヘッダー**: 認証必須

**パスパラメータ**:
- `id`: サーバーID

**クエリパラメータ**:
- `limit` (オプション): 取得行数 (デフォルト: 100)
- `since` (オプション): 開始時刻 (ISO 8601)
- `until` (オプション): 終了時刻 (ISO 8601)
- `follow` (オプション): ストリーミング (true/false)

**レスポンス**:
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "timestamp": "2024-01-01T12:00:00Z",
        "level": "info",
        "message": "Server started successfully",
        "source": "container"
      }
    ]
  }
}
```

#### `GET /api/v1/servers/{id}/metrics`

サーバーのメトリクスを取得

**ヘッダー**: 認証必須

**パスパラメータ**:
- `id`: サーバーID

**レスポンス**:
```json
{
  "success": true,
  "data": {
    "metrics": {
      "cpu_usage": 25.5,
      "memory_usage": 128,
      "memory_limit": 512,
      "network_rx": 1024,
      "network_tx": 2048,
      "uptime": 3600
    }
  }
}
```

### テスト

#### `POST /api/v1/servers/{id}/test`

サーバーのテストを実行

**ヘッダー**: 認証必須

**パスパラメータ**:
- `id`: サーバーID

**リクエスト**:
```json
{
  "test_type": "connection",
  "parameters": {
    "timeout": 30
  }
}
```

**レスポンス**:
```json
{
  "success": true,
  "data": {
    "test_result": {
      "id": "test-123",
      "status": "passed",
      "started_at": "2024-01-01T12:00:00Z",
      "completed_at": "2024-01-01T12:00:05Z",
      "results": {
        "connection": true,
        "response_time": 150,
        "tools_available": 5,
        "resources_available": 3
      }
    }
  }
}
```

#### `GET /api/v1/servers/{id}/tests`

サーバーのテスト履歴を取得

**ヘッダー**: 認証必須

**パスパラメータ**:
- `id`: サーバーID

**レスポンス**:
```json
{
  "success": true,
  "data": {
    "tests": [
      {
        "id": "test-123",
        "test_type": "connection",
        "status": "passed",
        "started_at": "2024-01-01T12:00:00Z",
        "completed_at": "2024-01-01T12:00:05Z",
        "results": {
          "connection": true,
          "response_time": 150
        }
      }
    ]
  }
}
```

### システム管理

#### `GET /api/v1/health`

システムヘルスチェック

**レスポンス**:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-01T12:00:00Z",
    "version": "1.0.0",
    "services": {
      "database": "healthy",
      "docker": "healthy",
      "auth": "healthy"
    }
  }
}
```

#### `GET /api/v1/metrics`

システムメトリクス（Prometheus形式）

**レスポンス**: Prometheus テキスト形式
```
# HELP mcp_servers_total Total number of MCP servers
# TYPE mcp_servers_total gauge
mcp_servers_total 5

# HELP mcp_servers_running Number of running MCP servers
# TYPE mcp_servers_running gauge
mcp_servers_running 3
```

### エラーレスポンス

すべてのエラーは以下の形式で返されます:

```json
{
  "success": false,
  "error": {
    "code": "AUTHENTICATION_ERROR",
    "message": "認証が必要です",
    "details": {
      "field": "authorization",
      "expected": "Bearer token"
    }
  },
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### エラーコード一覧

- `AUTHENTICATION_ERROR`: 認証エラー (401)
- `AUTHORIZATION_ERROR`: 認可エラー (403)
- `VALIDATION_ERROR`: バリデーションエラー (400)
- `NOT_FOUND_ERROR`: リソースが見つからない (404)
- `RATE_LIMIT_ERROR`: レート制限 (429)
- `INTERNAL_SERVER_ERROR`: サーバー内部エラー (500)
- `DOCKER_ERROR`: Docker操作エラー (502)

## 使用例

### JavaScript/TypeScript

```javascript
// サーバー一覧を取得
const response = await fetch('/api/v1/servers', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data.data.servers);

// 新しいサーバーを作成
const createResponse = await fetch('/api/v1/servers', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Test Server',
    image: 'mcp/test-server:latest',
    configuration: {
      environment: {
        API_KEY: 'secret'
      }
    }
  })
});
```

### curl

```bash
# ログイン
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123","provider":"credentials"}'

# サーバー一覧取得
curl -H "Authorization: Bearer <token>" \
  http://localhost:3000/api/v1/servers

# サーバー開始
curl -X POST -H "Authorization: Bearer <token>" \
  http://localhost:3000/api/v1/servers/server-123/start
```

## WebSocket API

リアルタイム更新のためのWebSocket接続:

### 接続

```
ws://localhost:3000/api/v1/ws
```

### メッセージ形式

```json
{
  "type": "server_status_update",
  "data": {
    "server_id": "server-123",
    "status": "running",
    "timestamp": "2024-01-01T12:00:00Z"
  }
}
```

### イベントタイプ

- `server_status_update`: サーバーステータス変更
- `server_logs`: ログストリーミング
- `metrics_update`: メトリクス更新
- `test_completed`: テスト完了通知