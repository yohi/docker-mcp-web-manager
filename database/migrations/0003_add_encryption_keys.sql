-- Migration: 0003_add_encryption_keys.sql
-- Description: encryption_keysテーブルの追加（暗号化キー管理）
-- Created: 2024-08-28

-- encryption_keys テーブル（暗号化キー管理）
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

-- secretsテーブルにencryption_key_idの外部キー制約を追加
-- （既存のテーブルに外部キー制約を追加する場合の例）
-- 注意: SQLiteでは既存テーブルの外部キー制約追加は制限があるため、
-- 実際の実装ではテーブル再作成が必要な場合があります
