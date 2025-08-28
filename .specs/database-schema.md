# データベーススキーマ設計書

## 概要
Docker MCP Web Managerのデータベーススキーマ設計書。セキュリティファーストの視点で、機密情報の管理とデータ整合性を重視した設計。

## セキュリティ要件
- 機密情報の暗号化保存
- 外部キー制約による参照整合性の保証
- 適切なインデックス設計によるパフォーマンス最適化
- WALモードによる同時アクセス性能向上

## テーブル設計

### 1. servers テーブル
```sql
CREATE TABLE servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    image TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running', 'stopped', 'error', 'unknown')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_health_check DATETIME,
    metadata JSON
);

CREATE INDEX idx_servers_status ON servers(status);
CREATE INDEX idx_servers_created_at ON servers(created_at);
```

### 2. configurations テーブル
```sql
CREATE TABLE configurations (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    config_data JSON NOT NULL,
    is_active BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
);

CREATE INDEX idx_configurations_server_id ON configurations(server_id);
CREATE INDEX idx_configurations_is_active ON configurations(is_active);
CREATE UNIQUE INDEX idx_configurations_server_active ON configurations(server_id, is_active) WHERE is_active = TRUE;
```

### 3. secrets テーブル
```sql
CREATE TABLE secrets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    encrypted_value TEXT NOT NULL, -- AES-256暗号化済み
    encryption_key_id TEXT NOT NULL,
    scope TEXT NOT NULL CHECK (scope IN ('global', 'server', 'configuration')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    expires_at DATETIME,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_secrets_scope ON secrets(scope);
CREATE INDEX idx_secrets_is_active ON secrets(is_active);
CREATE INDEX idx_secrets_expires_at ON secrets(expires_at);
CREATE UNIQUE INDEX idx_secrets_name_scope ON secrets(name, scope) WHERE is_active = TRUE;
```

### 4. configuration_secrets テーブル（多対多関係）
```sql
CREATE TABLE configuration_secrets (
    id TEXT PRIMARY KEY,
    configuration_id TEXT NOT NULL,
    secret_id TEXT NOT NULL,
    scope TEXT NOT NULL CHECK (scope IN ('required', 'optional', 'conditional')),
    usage_context TEXT, -- 使用コンテキストの説明
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    FOREIGN KEY (configuration_id) REFERENCES configurations(id) ON DELETE CASCADE,
    FOREIGN KEY (secret_id) REFERENCES secrets(id) ON DELETE CASCADE,
    UNIQUE(configuration_id, secret_id)
);

CREATE INDEX idx_configuration_secrets_config_id ON configuration_secrets(configuration_id);
CREATE INDEX idx_configuration_secrets_secret_id ON configuration_secrets(secret_id);
CREATE INDEX idx_configuration_secrets_scope ON configuration_secrets(scope);
```

### 5. test_results テーブル
```sql
CREATE TABLE test_results (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL,
    configuration_id TEXT,
    tool_name TEXT NOT NULL,
    test_type TEXT NOT NULL CHECK (test_type IN ('connection', 'functionality', 'performance', 'security')),
    status TEXT NOT NULL CHECK (status IN ('success', 'failure', 'error', 'timeout')),
    input_data JSON,
    output_data JSON,
    error_message TEXT,
    execution_time_ms INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
    FOREIGN KEY (configuration_id) REFERENCES configurations(id) ON DELETE SET NULL
);

CREATE INDEX idx_test_results_server_id ON test_results(server_id);
CREATE INDEX idx_test_results_configuration_id ON test_results(configuration_id);
CREATE INDEX idx_test_results_status ON test_results(status);
CREATE INDEX idx_test_results_created_at ON test_results(created_at);
CREATE INDEX idx_test_results_tool_name ON test_results(tool_name);
```

### 6. encryption_keys テーブル（暗号化キー管理）
```sql
CREATE TABLE encryption_keys (
    id TEXT PRIMARY KEY,
    key_name TEXT NOT NULL UNIQUE,
    key_version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    rotated_at DATETIME,
    created_by TEXT
);

CREATE INDEX idx_encryption_keys_is_active ON encryption_keys(is_active);
CREATE INDEX idx_encryption_keys_key_name ON encryption_keys(key_name);
```

## SQLite最適化設定

### データベース初期化時の設定
```sql
-- 外部キー制約の有効化（セキュリティ向上）
PRAGMA foreign_keys = ON;

-- WALモードの有効化（同時アクセス性能向上）
PRAGMA journal_mode = WAL;

-- 同期設定（パフォーマンスと安全性のバランス）
PRAGMA synchronous = NORMAL;

-- キャッシュサイズの最適化
PRAGMA cache_size = -64000; -- 64MB

-- テンポラリファイルをメモリに保存
PRAGMA temp_store = MEMORY;

-- ページサイズの最適化
PRAGMA page_size = 4096;

-- 自動バキュームの有効化
PRAGMA auto_vacuum = INCREMENTAL;
```

## マイグレーション戦略

### 推奨ツール: Drizzle ORM
- TypeScriptファーストの設計
- 型安全性の保証
- マイグレーション管理の自動化
- SQLiteの最適化機能のサポート

### マイグレーションファイル構造
```
database/
├── migrations/
│   ├── 0001_initial_schema.sql
│   ├── 0002_add_configuration_secrets.sql
│   └── 0003_add_encryption_keys.sql
├── schema.ts
├── connection.ts
└── seed.ts
```

## セキュリティ考慮事項

### 1. 機密情報の暗号化
- すべてのシークレットはAES-256で暗号化
- 暗号化キーのローテーション機能
- 暗号化キーの安全な保存

### 2. アクセス制御
- データベースレベルでの権限管理
- アプリケーションレベルでの認証・認可
- 監査ログの実装

### 3. データ整合性
- 外部キー制約による参照整合性
- チェック制約によるデータ検証
- 一意制約による重複防止

## パフォーマンス最適化

### 1. インデックス設計
- 頻繁にクエリされるカラムへのインデックス
- 複合インデックスの適切な設計
- 部分インデックスの活用

### 2. クエリ最適化
- 適切なJOIN戦略
- サブクエリの最適化
- ページネーションの実装

### 3. 接続管理
- 接続プールの実装
- 長時間接続の回避
- 適切なタイムアウト設定
