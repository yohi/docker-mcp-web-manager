import { getDatabase } from './connection';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';

/**
 * データベースマイグレーションを実行します
 */
export async function runMigrations(): Promise<void> {
  try {
    const db = getDatabase();
    const migrationsFolder = path.join(process.cwd(), 'src/db/migrations');

    console.log('データベースマイグレーションを開始します...');
    
    // マイグレーションを実行
    migrate(db, { migrationsFolder });
    
    console.log('データベースマイグレーション完了');
  } catch (error) {
    console.error('データベースマイグレーション中にエラーが発生しました:', error);
    throw error;
  }
}

/**
 * 手動でテーブルを作成する関数（初期セットアップ用）
 * Drizzle-kitが利用できない場合のフォールバック
 */
export async function createTablesManually(): Promise<void> {
  try {
    const db = getDatabase();

    console.log('手動でデータベーステーブルを作成中...');

    // 外部キー制約を有効化
    await db.run(sql`PRAGMA foreign_keys = ON`);

    // サーバーテーブル
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        image TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('running', 'stopped', 'error')),
        version TEXT,
        description TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);

    // 設定テーブル
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS configurations (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL UNIQUE,
        environment TEXT CHECK (environment IS NULL OR (JSON_VALID(environment) AND json_type(environment, '$') = 'object')),
        enabled_tools TEXT CHECK (enabled_tools IS NULL OR (JSON_VALID(enabled_tools) AND json_type(enabled_tools, '$') = 'array')),
        resource_limits TEXT CHECK (resource_limits IS NULL OR (JSON_VALID(resource_limits) AND json_type(resource_limits, '$') = 'object')),
        network_config TEXT CHECK (network_config IS NULL OR (JSON_VALID(network_config) AND json_type(network_config, '$') = 'object')),
        node_env TEXT GENERATED ALWAYS AS (json_extract(environment, '$.NODE_ENV')) VIRTUAL,
        enabled_tools_count INTEGER GENERATED ALWAYS AS (json_array_length(enabled_tools)) VIRTUAL,
        memory_limit TEXT GENERATED ALWAYS AS (json_extract(resource_limits, '$.memory')) VIRTUAL,
        representative_port INTEGER GENERATED ALWAYS AS (
          COALESCE(
            json_extract(network_config, '$.ports[0].hostPort'),
            json_extract(network_config, '$.ports[0].containerPort')
          )
        ) VIRTUAL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);

    // Bitwardenアイテムテーブル
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS bitwarden_items (
        id TEXT PRIMARY KEY,
        item_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('login', 'secure_note', 'card', 'identity')),
        folder_id TEXT,
        organization_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);

    // シークレットテーブル
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS secrets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL CHECK (type IN ('api_key', 'token', 'password', 'certificate')),
        ciphertext BLOB NOT NULL,
        iv BLOB NOT NULL CHECK (LENGTH(iv) = 12),
        tag BLOB NOT NULL CHECK (LENGTH(tag) = 16),
        alg TEXT NOT NULL DEFAULT 'AES-256-GCM' CHECK (alg IN ('AES-256-GCM', 'ChaCha20-Poly1305')),
        key_id TEXT NOT NULL,
        bitwarden_item_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (bitwarden_item_id) REFERENCES bitwarden_items(id) ON DELETE SET NULL,
        UNIQUE(key_id, iv, alg)
      )
    `);

    // シークレット参照テーブル
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS secret_references (
        id TEXT PRIMARY KEY,
        configuration_id TEXT NOT NULL,
        secret_id TEXT NOT NULL,
        environment_variable TEXT NOT NULL,
        required INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (configuration_id) REFERENCES configurations(id) ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY (secret_id) REFERENCES secrets(id) ON DELETE CASCADE ON UPDATE CASCADE,
        UNIQUE(configuration_id, environment_variable)
      )
    `);

    // リソーステーブル
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS resources (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        uri TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        mime_type TEXT,
        metadata TEXT CHECK (metadata IS NULL OR (JSON_VALID(metadata) AND json_type(metadata, '$') = 'object')),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE ON UPDATE CASCADE,
        UNIQUE(server_id, uri)
      )
    `);

    // プロンプトテーブル
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS prompts (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        arguments TEXT CHECK (arguments IS NULL OR (JSON_VALID(arguments) AND json_type(arguments, '$') = 'object')),
        metadata TEXT CHECK (metadata IS NULL OR (JSON_VALID(metadata) AND json_type(metadata, '$') = 'object')),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE ON UPDATE CASCADE,
        UNIQUE(server_id, name)
      )
    `);

    // ツールテーブル
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS tools (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        input_schema TEXT NOT NULL CHECK (JSON_VALID(input_schema) AND json_type(input_schema, '$') = 'object'),
        enabled INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE ON UPDATE CASCADE,
        UNIQUE(server_id, name)
      )
    `);

    // テスト結果テーブル
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS test_results (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        input TEXT CHECK (input IS NULL OR JSON_VALID(input)),
        output TEXT CHECK (output IS NULL OR JSON_VALID(output)),
        success INTEGER NOT NULL,
        error TEXT,
        execution_time INTEGER,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);

    // ジョブテーブル
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('install', 'start', 'stop', 'test', 'enable', 'disable', 'delete')),
        status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
        target_type TEXT NOT NULL CHECK (target_type IN ('server', 'catalog', 'gateway')),
        target_id TEXT NOT NULL,
        progress_current INTEGER DEFAULT 0,
        progress_total INTEGER DEFAULT 100,
        progress_message TEXT,
        result TEXT CHECK (result IS NULL OR JSON_VALID(result)),
        error_code TEXT,
        error_message TEXT,
        error_details TEXT CHECK (error_details IS NULL OR JSON_VALID(error_details)),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        completed_at TEXT
      )
    `);

    // 冪等性キーテーブル
    await db.run(sql`
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        key TEXT NOT NULL,
        scope TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        job_id TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
        expires_at TEXT NOT NULL,
        PRIMARY KEY (key, scope),
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
      )
    `);

    console.log('テーブル作成完了');

    // インデックスを作成
    await createIndexes();

    console.log('手動データベースセットアップ完了');
  } catch (error) {
    console.error('手動テーブル作成中にエラーが発生しました:', error);
    throw error;
  }
}

/**
 * パフォーマンス向上のためのインデックスを作成
 */
export async function createIndexes(): Promise<void> {
  try {
    const db = getDatabase();

    console.log('インデックスを作成中...');

    // configurations テーブルのインデックス
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_configurations_server_id ON configurations(server_id)`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_configurations_node_env ON configurations(node_env)`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_configurations_enabled_tools_count ON configurations(enabled_tools_count)`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_configurations_memory_limit ON configurations(memory_limit)`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_configurations_representative_port ON configurations(representative_port)`);

    // bitwarden_items テーブルのインデックス
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_bitwarden_items_name ON bitwarden_items(name)`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_bitwarden_items_type ON bitwarden_items(type)`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_bitwarden_items_folder_id ON bitwarden_items(folder_id)`);

    // secrets テーブルのインデックス
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_secrets_type ON secrets(type)`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_secrets_bitwarden_item_id ON secrets(bitwarden_item_id)`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_secrets_alg ON secrets(alg)`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_secrets_key_id ON secrets(key_id)`);

    // secret_references テーブルのインデックス
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_secret_references_configuration_id ON secret_references(configuration_id)`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_secret_references_secret_id ON secret_references(secret_id)`);

    // resources テーブルのインデックス
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_resources_server_id ON resources(server_id)`);

    // prompts テーブルのインデックス
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_prompts_server_id ON prompts(server_id)`);

    // tools テーブルのインデックス
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_tools_server_id ON tools(server_id)`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_tools_enabled ON tools(enabled)`);

    // test_results テーブルのインデックス
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_test_results_server_tool_time ON test_results(server_id, tool_name, timestamp DESC)`);

    // jobs テーブルのインデックス
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_jobs_target_latest ON jobs(target_type, target_id, created_at DESC)`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_jobs_in_progress ON jobs(status, updated_at) WHERE status IN ('pending', 'running')`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_jobs_target_status ON jobs(target_type, target_id, status, created_at DESC)`);

    // idempotency_keys テーブルのインデックス
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_idem_scope_exp ON idempotency_keys(scope, expires_at)`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_idem_job_id ON idempotency_keys(job_id)`);
    await db.run(sql`CREATE INDEX IF NOT EXISTS idx_idem_scope_hash ON idempotency_keys(scope, request_hash)`);

    console.log('インデックス作成完了');
  } catch (error) {
    console.error('インデックス作成中にエラーが発生しました:', error);
    throw error;
  }
}