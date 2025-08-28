-- Migration: 0001_initial_schema.sql
-- Description: 初期スキーマの作成
-- Created: 2024-08-28

-- SQLite最適化設定
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000;
PRAGMA temp_store = MEMORY;
PRAGMA page_size = 4096;
PRAGMA auto_vacuum = INCREMENTAL;

-- 1. servers テーブル
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

-- 2. configurations テーブル
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

-- 3. secrets テーブル
CREATE TABLE secrets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    encrypted_value TEXT NOT NULL,
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

-- 4. test_results テーブル
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
