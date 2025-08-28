-- Migration: 0002_add_configuration_secrets.sql
-- Description: configuration_secretsテーブルの追加（多対多関係）
-- Created: 2024-08-28

-- configuration_secrets テーブル（多対多関係）
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
