# Docker MCP Web Manager - API仕様書

## 概要

Docker MCP Web Managerは、Model Context Protocol (MCP) サーバーをDocker環境で管理するWebアプリケーションです。本文書は、REST APIエンドポイントの詳細仕様を提供します。

## 基本情報

### APIバージョン
- **現在バージョン**: v1
- **ベースURL**: `http://localhost:3000/api/v1`
- **Content-Type**: `application/json`
- **認証**: セッションベース認証

### レスポンス形式

すべてのAPIレスポンスは以下の統一形式を使用します：

```json
{
  "success": true,
  "data": {},
  "meta": {
    "requestId": "req_1703761200000_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "version": "v1",
    "duration": 150,
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

### エラーレスポンス形式

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "リクエストデータが無効です",
    "details": {
      "field": "name",
      "message": "名前は必須です"
    }
  },
  "meta": {
    "requestId": "req_1703761200000_abc123",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "version": "v1",
    "duration": 50
  }
}
```

## 認証・認可

### 権限システム

| 権限名 | 説明 |
|--------|------|
| `SERVER_READ` | サーバー情報の読み取り |
| `SERVER_WRITE` | サーバーの作成・更新・削除 |
| `CONFIG_READ` | 設定情報の読み取り |
| `CONFIG_WRITE` | 設定の変更 |
| `CATALOG_READ` | カタログの閲覧 |
| `SECRET_READ` | シークレットの読み取り |
| `SECRET_WRITE` | シークレットの管理 |
| `JOB_READ` | ジョブ状況の確認 |
| `MONITORING_READ` | 監視データの閲覧 |

### エラーコード

| コード | 説明 |
|--------|------|
| `UNAUTHORIZED` | 認証が必要 |
| `FORBIDDEN` | 権限不足 |
| `VALIDATION_ERROR` | リクエストデータが無効 |
| `NOT_FOUND` | リソースが見つからない |
| `INTERNAL_ERROR` | サーバー内部エラー |
| `RATE_LIMITED` | レート制限 |

## APIエンドポイント一覧

### ヘルスチェック

#### GET /api/health
システムの稼働状況を確認します。

**認証**: 不要

**レスポンス**:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "version": "2.0.0",
  "environment": "development",
  "uptime": 3600
}
```

---

## サーバー管理API

### GET /api/v1/servers
MCPサーバー一覧を取得します。

**権限**: `SERVER_READ`

**クエリパラメータ**:
| パラメータ | 型 | デフォルト | 説明 |
|-----------|---|-----------|------|
| `page` | number | 1 | ページ番号 |
| `limit` | number | 20 | 1ページあたりの件数（最大100） |
| `search` | string | - | 名前での検索 |
| `status` | string | - | ステータスフィルタ（running/stopped/error） |
| `sort_by` | string | updatedAt | ソートフィールド |
| `sort_order` | string | desc | ソート順（asc/desc） |

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

### POST /api/v1/servers
新しいMCPサーバーを作成します。

**権限**: `SERVER_WRITE`

**リクエストボディ**:
```json
{
  "name": "my-mcp-server",
  "image": "node:latest",
  "port": 3000,
  "environment": {
    "NODE_ENV": "production"
  },
  "volumes": [
    "/host/path:/container/path"
  ]
}
```

**バリデーション**:
- `name`: 必須、3-50文字、英数字とハイフンのみ
- `image`: 必須、有効なDockerイメージ名
- `port`: 必須、1024-65535の範囲
- `environment`: オプション、環境変数のオブジェクト
- `volumes`: オプション、ボリュームマウントの配列

### GET /api/v1/servers/{id}
指定されたIDのMCPサーバー詳細を取得します。

**権限**: `SERVER_READ`

**パスパラメータ**:
- `id`: サーバーID

**レスポンス例**:
```json
{
  "success": true,
  "data": {
    "id": "1",
    "name": "test-server-1",
    "status": "running",
    "image": "node:latest",
    "port": 3000,
    "environment": {
      "NODE_ENV": "production"
    },
    "volumes": [],
    "logs": [
      {
        "timestamp": "2024-01-01T00:00:00Z",
        "level": "info",
        "message": "Server started"
      }
    ],
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
}
```

### PUT /api/v1/servers/{id}
MCPサーバーの設定を更新します。

**権限**: `SERVER_WRITE`

### DELETE /api/v1/servers/{id}
MCPサーバーを削除します。

**権限**: `SERVER_WRITE`

---

## カタログAPI

### GET /api/v1/catalog
MCPサーバーカタログ一覧を取得します。

**権限**: `CATALOG_READ`

**クエリパラメータ**:
| パラメータ | 型 | デフォルト | 説明 |
|-----------|---|-----------|------|
| `page` | number | 1 | ページ番号 |
| `limit` | number | 20 | 1ページあたりの件数 |
| `category` | string | - | カテゴリフィルタ |
| `tags` | string[] | - | タグフィルタ |

### GET /api/v1/catalog/search
カタログを検索します。

**権限**: `CATALOG_READ`

**クエリパラメータ**:
| パラメータ | 型 | デフォルト | 説明 |
|-----------|---|-----------|------|
| `search` | string | - | 検索キーワード |
| `tags` | string[] | - | タグフィルタ |
| `category` | string | - | カテゴリフィルタ |
| `sortBy` | string | relevance | ソート基準（relevance/popularity/updated） |

### GET /api/v1/catalog/categories
利用可能なカテゴリ一覧を取得します。

**権限**: `CATALOG_READ`

### GET /api/v1/catalog/{id}
指定されたカタログエントリの詳細を取得します。

**権限**: `CATALOG_READ`

---

## ジョブ管理API

### GET /api/v1/jobs
システム内のジョブ一覧を取得します。

**権限**: `JOB_READ`

**クエリパラメータ**:
| パラメータ | 型 | デフォルト | 説明 |
|-----------|---|-----------|------|
| `status` | string | - | ジョブステータス（pending/running/completed/failed） |
| `type` | string | - | ジョブタイプ |

### GET /api/v1/jobs/{id}
指定されたジョブの詳細を取得します。

**権限**: `JOB_READ`

---

## シークレット管理API

### GET /api/v1/secrets
暗号化されたシークレット一覧を取得します。

**権限**: `SECRET_READ`

**注意**: シークレットの値は返されません。メタデータのみが含まれます。

### POST /api/v1/secrets
新しいシークレットを作成します。

**権限**: `SECRET_WRITE`

**リクエストボディ**:
```json
{
  "name": "database_password",
  "value": "secure_password_here",
  "description": "データベース接続パスワード",
  "tags": ["database", "production"]
}
```

### GET /api/v1/secrets/{id}
指定されたシークレットのメタデータを取得します。

**権限**: `SECRET_READ`

### PUT /api/v1/secrets/{id}
シークレットを更新します。

**権限**: `SECRET_WRITE`

### DELETE /api/v1/secrets/{id}
シークレットを削除します。

**権限**: `SECRET_WRITE`

---

## 設定管理API

### GET /api/v1/config
システム設定一覧を取得します。

**権限**: `CONFIG_READ`

### PUT /api/v1/config
システム設定を更新します。

**権限**: `CONFIG_WRITE`

### GET /api/v1/settings
ユーザー設定を取得します。

**権限**: 認証済みユーザー

### PUT /api/v1/settings
ユーザー設定を更新します。

**権限**: 認証済みユーザー

---

## 監視API

### GET /api/v1/monitoring
システムの監視データを取得します。

**権限**: `MONITORING_READ`

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
  }
}
```

---

## レート制限

APIには以下のレート制限が適用されます：

| エンドポイント | 制限 |
|---------------|------|
| 認証API | 5回/分 |
| 読み取りAPI | 100回/分 |
| 書き込みAPI | 30回/分 |
| 検索API | 20回/分 |

制限に達した場合、`429 Too Many Requests`が返されます。

## WebSocket API

リアルタイムデータの配信にWebSocketを使用します：

### 接続エンドポイント
- **URL**: `ws://localhost:3000/api/ws`
- **認証**: セッションベース

### メッセージ形式

#### サーバー状態更新
```json
{
  "type": "server_status_update",
  "data": {
    "serverId": "1",
    "status": "running",
    "timestamp": "2024-01-01T00:00:00Z"
  }
}
```

#### ジョブ進捗更新
```json
{
  "type": "job_progress",
  "data": {
    "jobId": "job_123",
    "progress": 75,
    "status": "running",
    "message": "コンテナを起動中..."
  }
}
```

## SDK・ライブラリ

以下の言語でSDKを提供予定：

- **JavaScript/TypeScript**: `@docker-mcp/client`
- **Python**: `docker-mcp-client`
- **Go**: `github.com/docker-mcp/go-client`

## 変更履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|----------|
| v1.0.0 | 2024-01-01 | 初回リリース |
| v1.1.0 | 2024-01-15 | WebSocket API追加 |
| v1.2.0 | 2024-02-01 | 監視API機能拡張 |

---

## サポート

- **GitHub Issues**: https://github.com/yourusername/docker-mcp-web-manager/issues
- **ドキュメント**: https://docs.docker-mcp.example.com
- **Discord**: https://discord.gg/docker-mcp

## ライセンス

MIT License - 詳細は [LICENSE](../../LICENSE) ファイルを参照してください。