# サーバー管理API

MCPサーバーのライフサイクル管理を行うAPIエンドポイントの詳細仕様です。

## 概要

サーバー管理APIは、Docker上で動作するMCPサーバーの作成、更新、削除、監視を行う機能を提供します。

### 主な機能
- 📦 MCPサーバーの作成と設定
- 🔄 サーバーのライフサイクル管理
- 📊 リアルタイム状態監視
- 📝 ログとメトリクス取得
- 🔧 設定の動的更新

## エンドポイント一覧

| メソッド | エンドポイント                 | 説明             | 権限         |
| -------- | ------------------------------ | ---------------- | ------------ |
| GET      | `/api/v1/servers`              | サーバー一覧取得 | SERVER_READ  |
| POST     | `/api/v1/servers`              | サーバー作成     | SERVER_WRITE |
| GET      | `/api/v1/servers/{id}`         | サーバー詳細取得 | SERVER_READ  |
| PUT      | `/api/v1/servers/{id}`         | サーバー更新     | SERVER_WRITE |
| DELETE   | `/api/v1/servers/{id}`         | サーバー削除     | SERVER_WRITE |
| POST     | `/api/v1/servers/{id}/start`   | サーバー開始     | SERVER_WRITE |
| POST     | `/api/v1/servers/{id}/stop`    | サーバー停止     | SERVER_WRITE |
| POST     | `/api/v1/servers/{id}/restart` | サーバー再起動   | SERVER_WRITE |
| GET      | `/api/v1/servers/{id}/logs`    | ログ取得         | SERVER_READ  |
| GET      | `/api/v1/servers/{id}/stats`   | 統計情報取得     | SERVER_READ  |

## 詳細仕様

### GET /api/v1/servers

MCPサーバー一覧を取得します。ページネーション、フィルタリング、ソート機能をサポートします。

#### リクエスト

**クエリパラメータ**:
```typescript
interface GetServersQuery {
  page?: number;        // ページ番号 (デフォルト: 1)
  limit?: number;       // 1ページあたりの件数 (1-100, デフォルト: 20)
  search?: string;      // 名前での部分検索
  status?: ServerStatus; // ステータスフィルタ
  sort_by?: SortField;  // ソートフィールド
  sort_order?: 'asc' | 'desc'; // ソート順
  created_after?: string; // 作成日時フィルタ (ISO 8601)
  created_before?: string; // 作成日時フィルタ (ISO 8601)
  tags?: string[];      // タグフィルタ
}

type ServerStatus = 'running' | 'stopped' | 'error' | 'starting' | 'stopping';
type SortField = 'name' | 'status' | 'createdAt' | 'updatedAt' | 'port';
```

#### レスポンス

```typescript
interface GetServersResponse {
  success: true;
  data: MCPServer[];
  meta: {
    requestId: string;
    timestamp: string;
    version: string;
    duration: number;
    pagination: {
      page: number;
      limit: number;
      total: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  };
}

interface MCPServer {
  id: string;
  name: string;
  status: ServerStatus;
  image: string;
  port: number;
  environment: Record<string, string>;
  volumes: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  healthCheck?: {
    enabled: boolean;
    endpoint: string;
    interval: number;
    timeout: number;
    retries: number;
  };
}
```

#### 使用例

```bash
# 基本的な一覧取得
curl -X GET "http://localhost:3000/api/v1/servers" \
  -H "Accept: application/json" \
  -H "Cookie: next-auth.session-token=your-token"

# フィルタリングとソート
curl -X GET "http://localhost:3000/api/v1/servers?status=running&sort_by=name&sort_order=asc" \
  -H "Accept: application/json" \
  -H "Cookie: next-auth.session-token=your-token"

# 検索とページネーション
curl -X GET "http://localhost:3000/api/v1/servers?search=web&page=2&limit=10" \
  -H "Accept: application/json" \
  -H "Cookie: next-auth.session-token=your-token"

# 日付範囲フィルタ
curl -X GET "http://localhost:3000/api/v1/servers?created_after=2024-01-01T00:00:00Z&created_before=2024-01-31T23:59:59Z" \
  -H "Accept: application/json" \
  -H "Cookie: next-auth.session-token=your-token"
```

---

### POST /api/v1/servers

新しいMCPサーバーを作成します。

#### リクエスト

```typescript
interface CreateServerRequest {
  name: string;          // サーバー名 (3-50文字、英数字とハイフンのみ)
  image: string;         // Dockerイメージ名
  port: number;          // 公開ポート (1024-65535)
  environment?: Record<string, string>; // 環境変数
  volumes?: string[];    // ボリュームマウント
  tags?: string[];       // タグ
  autoStart?: boolean;   // 作成後自動開始 (デフォルト: true)
  healthCheck?: {
    enabled: boolean;
    endpoint: string;    // ヘルスチェックエンドポイント
    interval: number;    // チェック間隔（秒）
    timeout: number;     // タイムアウト（秒）
    retries: number;     // 最大リトライ回数
  };
  resources?: {
    cpuLimit?: string;   // CPU制限 (例: "0.5", "1000m")
    memoryLimit?: string; // メモリ制限 (例: "512m", "1g")
    cpuReservation?: string; // CPU予約
    memoryReservation?: string; // メモリ予約
  };
  networks?: string[];   // ネットワーク設定
  restart?: 'no' | 'always' | 'on-failure' | 'unless-stopped';
}
```

#### バリデーション

| フィールド             | 制約                                       |
| ---------------------- | ------------------------------------------ |
| `name`                 | 必須、3-50文字、`^[a-zA-Z0-9-]+$`          |
| `image`                | 必須、有効なDockerイメージ名               |
| `port`                 | 必須、1024-65535の範囲、重複不可           |
| `environment`          | オプション、キーは`^[A-Z][A-Z0-9_]*$`      |
| `volumes`              | オプション、`host_path:container_path`形式 |
| `healthCheck.interval` | 10-3600秒の範囲                            |
| `healthCheck.timeout`  | 1-60秒の範囲                               |

#### レスポンス

```typescript
interface CreateServerResponse {
  success: true;
  data: MCPServer & {
    jobId: string; // 作成ジョブのID
  };
  meta: ResponseMeta;
}
```

#### 使用例

```bash
curl -X POST "http://localhost:3000/api/v1/servers" \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=your-token" \
  -d '{
    "name": "my-mcp-server",
    "image": "node:18-alpine",
    "port": 3000,
    "environment": {
      "NODE_ENV": "production",
      "LOG_LEVEL": "info",
      "MCP_PROTOCOL_VERSION": "1.0"
    },
    "volumes": [
      "/host/data:/app/data:rw",
      "/host/logs:/app/logs:rw"
    ],
    "tags": ["production", "web", "mcp"],
    "autoStart": true,
    "healthCheck": {
      "enabled": true,
      "endpoint": "/health",
      "interval": 30,
      "timeout": 5,
      "retries": 3
    },
    "resources": {
      "cpuLimit": "1000m",
      "memoryLimit": "512m",
      "cpuReservation": "500m",
      "memoryReservation": "256m"
    },
    "restart": "unless-stopped"
  }'
```

---

### GET /api/v1/servers/{id}

指定されたIDのMCPサーバー詳細を取得します。

#### パスパラメータ

- `id`: サーバーID (必須)

#### クエリパラメータ

```typescript
interface GetServerQuery {
  include_logs?: boolean;    // ログを含める (デフォルト: false)
  include_stats?: boolean;   // 統計情報を含める (デフォルト: false)
  log_lines?: number;        // ログ行数 (デフォルト: 100, 最大: 1000)
  log_since?: string;        // ログ開始時刻 (ISO 8601)
}
```

#### レスポンス

```typescript
interface GetServerResponse {
  success: true;
  data: MCPServerDetail;
  meta: ResponseMeta;
}

interface MCPServerDetail extends MCPServer {
  containerId?: string;      // DockerコンテナID
  logs?: LogEntry[];         // ログエントリ
  stats?: ServerStats;       // 統計情報
  connections?: Connection[]; // アクティブな接続
  lastHealthCheck?: {
    status: 'healthy' | 'unhealthy' | 'pending';
    timestamp: string;
    responseTime: number;
    message?: string;
  };
}

interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  source: 'container' | 'mcp-protocol' | 'health-check';
}

interface ServerStats {
  cpu: {
    usage: number;           // CPU使用率 (%)
    limit: number;           // CPU制限
  };
  memory: {
    usage: number;           // メモリ使用量 (bytes)
    limit: number;           // メモリ制限 (bytes)
    percentage: number;      // 使用率 (%)
  };
  network: {
    rxBytes: number;         // 受信バイト
    txBytes: number;         // 送信バイト
    rxPackets: number;       // 受信パケット
    txPackets: number;       // 送信パケット
  };
  disk: {
    readBytes: number;       // 読み取りバイト
    writeBytes: number;      // 書き込みバイト
  };
}

interface Connection {
  id: string;
  clientIp: string;
  connectedAt: string;
  protocol: 'mcp' | 'http' | 'websocket';
  status: 'active' | 'idle' | 'closing';
}
```

#### 使用例

```bash
# 基本的な詳細取得
curl -X GET "http://localhost:3000/api/v1/servers/srv_123" \
  -H "Accept: application/json" \
  -H "Cookie: next-auth.session-token=your-token"

# ログと統計情報を含める
curl -X GET "http://localhost:3000/api/v1/servers/srv_123?include_logs=true&include_stats=true&log_lines=200" \
  -H "Accept: application/json" \
  -H "Cookie: next-auth.session-token=your-token"

# 特定時刻以降のログのみ取得
curl -X GET "http://localhost:3000/api/v1/servers/srv_123?include_logs=true&log_since=2024-01-01T12:00:00Z" \
  -H "Accept: application/json" \
  -H "Cookie: next-auth.session-token=your-token"
```

---

### PUT /api/v1/servers/{id}

MCPサーバーの設定を更新します。

#### リクエスト

```typescript
interface UpdateServerRequest {
  name?: string;             // サーバー名
  environment?: Record<string, string>; // 環境変数
  tags?: string[];           // タグ
  healthCheck?: {
    enabled: boolean;
    endpoint: string;
    interval: number;
    timeout: number;
    retries: number;
  };
  resources?: {
    cpuLimit?: string;
    memoryLimit?: string;
    cpuReservation?: string;
    memoryReservation?: string;
  };
  restart?: 'no' | 'always' | 'on-failure' | 'unless-stopped';
}
```

**注意**: `image`, `port`, `volumes` は更新後に再作成が必要なため、別途再作成APIを使用してください。

#### レスポンス

```typescript
interface UpdateServerResponse {
  success: true;
  data: MCPServer & {
    jobId?: string; // 再起動が必要な場合のジョブID
    requiresRestart: boolean;
  };
  meta: ResponseMeta;
}
```

#### 使用例

```bash
curl -X PUT "http://localhost:3000/api/v1/servers/srv_123" \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=your-token" \
  -d '{
    "name": "updated-server-name",
    "environment": {
      "NODE_ENV": "production",
      "LOG_LEVEL": "debug",
      "NEW_FEATURE_FLAG": "enabled"
    },
    "tags": ["production", "web", "mcp", "updated"],
    "healthCheck": {
      "enabled": true,
      "endpoint": "/health",
      "interval": 20,
      "timeout": 3,
      "retries": 5
    },
    "resources": {
      "cpuLimit": "1500m",
      "memoryLimit": "1g"
    }
  }'
```

---

### DELETE /api/v1/servers/{id}

MCPサーバーを削除します。

#### クエリパラメータ

```typescript
interface DeleteServerQuery {
  force?: boolean;           // 強制削除 (デフォルト: false)
  remove_volumes?: boolean;  // ボリュームも削除 (デフォルト: false)
}
```

#### レスポンス

```typescript
interface DeleteServerResponse {
  success: true;
  data: {
    jobId: string;           // 削除ジョブのID
    message: string;
  };
  meta: ResponseMeta;
}
```

#### 使用例

```bash
# 通常の削除
curl -X DELETE "http://localhost:3000/api/v1/servers/srv_123" \
  -H "Cookie: next-auth.session-token=your-token"

# 強制削除（実行中でも削除）
curl -X DELETE "http://localhost:3000/api/v1/servers/srv_123?force=true" \
  -H "Cookie: next-auth.session-token=your-token"

# ボリュームも含めて削除
curl -X DELETE "http://localhost:3000/api/v1/servers/srv_123?remove_volumes=true" \
  -H "Cookie: next-auth.session-token=your-token"
```

---

## サーバー制御API

### POST /api/v1/servers/{id}/start

サーバーを開始します。

#### リクエスト

```typescript
interface StartServerRequest {
  timeout?: number;          // タイムアウト秒数 (デフォルト: 60)
  wait_for_health?: boolean; // ヘルスチェック成功まで待機
}
```

#### 使用例

```bash
curl -X POST "http://localhost:3000/api/v1/servers/srv_123/start" \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=your-token" \
  -d '{"timeout": 120, "wait_for_health": true}'
```

### POST /api/v1/servers/{id}/stop

サーバーを停止します。

#### リクエスト

```typescript
interface StopServerRequest {
  timeout?: number;          // タイムアウト秒数 (デフォルト: 30)
  force?: boolean;          // 強制停止 (SIGKILL) (デフォルト: false)
}
```

### POST /api/v1/servers/{id}/restart

サーバーを再起動します。

#### リクエスト

```typescript
interface RestartServerRequest {
  timeout?: number;          // タイムアウト秒数 (デフォルト: 60)
  wait_for_health?: boolean; // ヘルスチェック成功まで待機
}
```

---

## ログとメトリクス

### GET /api/v1/servers/{id}/logs

サーバーのログを取得します。

#### クエリパラメータ

```typescript
interface GetLogsQuery {
  lines?: number;            // 行数 (デフォルト: 100, 最大: 10000)
  since?: string;           // 開始時刻 (ISO 8601)
  until?: string;           // 終了時刻 (ISO 8601)
  level?: LogLevel[];       // ログレベルフィルタ
  source?: LogSource[];     // ログソースフィルタ
  follow?: boolean;         // リアルタイム取得 (デフォルト: false)
  format?: 'json' | 'text'; // 出力形式 (デフォルト: json)
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogSource = 'container' | 'mcp-protocol' | 'health-check';
```

### GET /api/v1/servers/{id}/stats

サーバーの統計情報を取得します。

#### クエリパラメータ

```typescript
interface GetStatsQuery {
  duration?: number;         // データ期間（秒） (デフォルト: 3600)
  interval?: number;         // データ間隔（秒） (デフォルト: 60)
  metrics?: MetricType[];    // 取得メトリクス
}

type MetricType = 'cpu' | 'memory' | 'network' | 'disk' | 'connections';
```

---

## エラーコード

| エラーコード                    | HTTPステータス | 説明                   |
| ------------------------------- | -------------- | ---------------------- |
| `SERVER_NOT_FOUND`              | 404            | サーバーが見つからない |
| `SERVER_NAME_DUPLICATE`         | 409            | サーバー名が重複       |
| `SERVER_PORT_IN_USE`            | 409            | ポートが使用中         |
| `SERVER_INVALID_IMAGE`          | 400            | 無効なDockerイメージ   |
| `SERVER_INSUFFICIENT_RESOURCES` | 409            | リソース不足           |
| `SERVER_START_FAILED`           | 500            | サーバー開始失敗       |
| `SERVER_STOP_FAILED`            | 500            | サーバー停止失敗       |
| `SERVER_DELETE_FAILED`          | 500            | サーバー削除失敗       |

## WebSocket イベント

サーバー管理APIでは、以下のWebSocketイベントを配信します：

### server_status_update
```json
{
  "type": "server_status_update",
  "data": {
    "serverId": "srv_123",
    "status": "running",
    "previousStatus": "starting",
    "timestamp": "2024-01-01T12:00:00.000Z",
    "metadata": {
      "port": 3000,
      "containerId": "abc123"
    }
  }
}
```

### server_logs
```json
{
  "type": "server_logs",
  "data": {
    "serverId": "srv_123",
    "logs": [
      {
        "timestamp": "2024-01-01T12:00:00.000Z",
        "level": "info",
        "message": "Server started",
        "source": "container"
      }
    ]
  }
}
```

### server_stats
```json
{
  "type": "server_stats",
  "data": {
    "serverId": "srv_123",
    "timestamp": "2024-01-01T12:00:00.000Z",
    "stats": {
      "cpu": {"usage": 45.2, "limit": 1000},
      "memory": {"usage": 536870912, "limit": 1073741824, "percentage": 50.0}
    }
  }
}
```

## 最適化のヒント

### パフォーマンス
- ページサイズは適切に設定（10-50件程度）
- 不要なデータは `include_*` パラメータで制御
- ログ取得時は時間範囲を指定
- リアルタイム更新にはWebSocketを活用

### セキュリティ
- 環境変数にシークレットを直接保存しない
- シークレット管理APIを活用
- 適切な権限設定を行う
- ログにセンシティブな情報を出力しない

### 信頼性
- ヘルスチェックを適切に設定
- リソース制限を設定
- 再起動ポリシーを適切に選択
- バックアップとリストアプランを策定
