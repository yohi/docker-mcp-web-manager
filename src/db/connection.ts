import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import * as schema from './schema';

// データベース接続の設定
const DATABASE_URL = process.env.DATABASE_URL || 'file:./data/app.db';

// データベースファイルのディレクトリを確保
const dbPath = DATABASE_URL.replace('file:', '');
const dbDir = dirname(dbPath);

try {
  mkdirSync(dbDir, { recursive: true });
} catch (error) {
  // ディレクトリ作成エラーは無視（既に存在する場合など）
  console.warn('Database directory creation warning:', error);
}

// SQLiteデータベースのインスタンス作成
// Next.jsビルド時はメモリDBを使用してファイルシステムエラーを回避
const isNextBuild = process.env.NEXT_PHASE === 'phase-production-build';
const finalDbPath = isNextBuild ? ':memory:' : dbPath;

const sqlite = new Database(finalDbPath, {
  verbose: process.env.NODE_ENV === 'development' && !isNextBuild ? console.log : undefined,
});

// SQLiteのパフォーマンスとセキュリティ設定
sqlite.exec(`
  -- 外部キー制約を有効化（セキュリティ強化）
  PRAGMA foreign_keys = ON;
  
  -- WALモードを有効化（パフォーマンス向上）
  PRAGMA journal_mode = WAL;
  
  -- 書き込み専用原則のためのbusyタイムアウト設定
  PRAGMA busy_timeout = 30000;
  
  -- パフォーマンス最適化設定
  PRAGMA synchronous = NORMAL;
  PRAGMA cache_size = -64000;
  PRAGMA temp_store = MEMORY;
  PRAGMA mmap_size = 268435456;
  
  -- セキュリティ設定
  PRAGMA secure_delete = ON;
`);

// Drizzle ORM インスタンス作成
export const db = drizzle(sqlite, {
  schema,
  logger: process.env.NODE_ENV === 'development',
});

// データベース接続ヘルスチェック
export async function healthCheck(): Promise<{
  status: 'healthy' | 'unhealthy';
  message: string;
  timestamp: Date;
}> {
  try {
    // 基本的な接続テスト
    const result = await db
      .select({ test: sql`1` })
      .from(schema.servers)
      .limit(1)
      .execute();

    return {
      status: 'healthy',
      message: 'Database connection is healthy',
      timestamp: new Date(),
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      message: `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      timestamp: new Date(),
    };
  }
}

// データベース初期化関数
export async function initializeDatabase(): Promise<void> {
  try {
    console.log('Initializing database...');

    // テーブルが存在するかチェック
    const tableCheck = sqlite.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='servers'
    `).get();

    if (!tableCheck) {
      console.log('Tables not found, creating schema...');
      await createTablesFromSchema();
    } else {
      console.log('Tables already exist, skipping schema creation');
    }

    // WALモードとforeign_keysの再確認
    sqlite.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
    `);

    console.log('Database initialization completed successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
}

// スキーマからテーブルを直接作成
async function createTablesFromSchema(): Promise<void> {
  try {
    // テーブル作成DDL
    sqlite.exec(`
      -- Users Table
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY NOT NULL,
        email TEXT NOT NULL UNIQUE,
        username TEXT NOT NULL UNIQUE,
        role TEXT DEFAULT 'user' NOT NULL,
        permissions TEXT,
        is_active INTEGER DEFAULT 1,
        last_login_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Servers Table
      CREATE TABLE IF NOT EXISTS servers (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL UNIQUE,
        install_type TEXT DEFAULT 'docker' NOT NULL,
        install_command TEXT NOT NULL,
        runtime_command TEXT,
        image TEXT,
        status TEXT NOT NULL,
        version TEXT,
        description TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Configurations Table
      CREATE TABLE IF NOT EXISTS configurations (
        id TEXT PRIMARY KEY NOT NULL,
        server_id TEXT NOT NULL,
        environment TEXT,
        enabled_tools TEXT,
        resource_limits TEXT,
        network_config TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON UPDATE CASCADE ON DELETE CASCADE
      );

      -- Tools Table
      CREATE TABLE IF NOT EXISTS tools (
        id TEXT PRIMARY KEY NOT NULL,
        server_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        input_schema TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON UPDATE CASCADE ON DELETE CASCADE
      );

      -- Prompts Table
      CREATE TABLE IF NOT EXISTS prompts (
        id TEXT PRIMARY KEY NOT NULL,
        server_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        arguments TEXT,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON UPDATE CASCADE ON DELETE CASCADE
      );

      -- Resources Table
      CREATE TABLE IF NOT EXISTS resources (
        id TEXT PRIMARY KEY NOT NULL,
        server_id TEXT NOT NULL,
        uri TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        mime_type TEXT,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON UPDATE CASCADE ON DELETE CASCADE
      );

      -- Test Results Table
      CREATE TABLE IF NOT EXISTS test_results (
        id TEXT PRIMARY KEY NOT NULL,
        server_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        input TEXT,
        output TEXT,
        success INTEGER NOT NULL,
        error TEXT,
        execution_time INTEGER,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id) REFERENCES servers(id) ON UPDATE CASCADE ON DELETE CASCADE
      );

      -- Jobs Table
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        progress_current INTEGER DEFAULT 0,
        progress_total INTEGER DEFAULT 100,
        progress_message TEXT,
        result TEXT,
        error_code TEXT,
        error_message TEXT,
        error_details TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT
      );

      -- Idempotency Keys Table
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        key TEXT NOT NULL,
        scope TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        job_id TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
      );

      -- Bitwarden Items Table
      CREATE TABLE IF NOT EXISTS bitwarden_items (
        id TEXT PRIMARY KEY NOT NULL,
        item_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        folder_id TEXT,
        organization_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      -- Secrets Table
      CREATE TABLE IF NOT EXISTS secrets (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        ciphertext BLOB NOT NULL,
        iv BLOB NOT NULL,
        tag BLOB NOT NULL,
        alg TEXT DEFAULT 'AES-256-GCM' NOT NULL,
        key_id TEXT NOT NULL,
        bitwarden_item_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (bitwarden_item_id) REFERENCES bitwarden_items(id) ON DELETE SET NULL
      );

      -- Secret References Table
      CREATE TABLE IF NOT EXISTS secret_references (
        id TEXT PRIMARY KEY NOT NULL,
        configuration_id TEXT NOT NULL,
        secret_id TEXT NOT NULL,
        environment_variable TEXT NOT NULL,
        required INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (configuration_id) REFERENCES configurations(id) ON UPDATE CASCADE ON DELETE CASCADE,
        FOREIGN KEY (secret_id) REFERENCES secrets(id) ON UPDATE CASCADE ON DELETE CASCADE
      );

      -- Passkeys Table
      CREATE TABLE IF NOT EXISTS passkeys (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        credential_id TEXT NOT NULL UNIQUE,
        credential_public_key BLOB NOT NULL,
        counter INTEGER DEFAULT 0 NOT NULL,
        credential_device_type TEXT NOT NULL,
        credential_backed_up INTEGER NOT NULL,
        transports TEXT,
        aaguid TEXT,
        name TEXT,
        last_used_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
      );

      -- WebAuthn Challenges Table
      CREATE TABLE IF NOT EXISTS webauthn_challenges (
        id TEXT PRIMARY KEY NOT NULL,
        challenge TEXT NOT NULL UNIQUE,
        user_id TEXT,
        type TEXT NOT NULL,
        user_agent TEXT,
        ip_address TEXT,
        expires_at TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      -- Create Indexes
      CREATE INDEX IF NOT EXISTS idx_servers_name ON servers(name);
      CREATE INDEX IF NOT EXISTS idx_servers_status ON servers(status);
      CREATE INDEX IF NOT EXISTS idx_servers_install_type ON servers(install_type);
      CREATE INDEX IF NOT EXISTS idx_configurations_server_id ON configurations(server_id);
      CREATE INDEX IF NOT EXISTS idx_tools_server_id ON tools(server_id);
      CREATE INDEX IF NOT EXISTS idx_tools_enabled ON tools(enabled);
      CREATE INDEX IF NOT EXISTS idx_prompts_server_id ON prompts(server_id);
      CREATE INDEX IF NOT EXISTS idx_resources_server_id ON resources(server_id);
      CREATE INDEX IF NOT EXISTS idx_test_results_server_tool_time ON test_results(server_id, tool_name, timestamp);
      CREATE INDEX IF NOT EXISTS idx_jobs_target_latest ON jobs(target_type, target_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_jobs_in_progress ON jobs(status, updated_at);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
      CREATE INDEX IF NOT EXISTS idx_passkeys_user_id ON passkeys(user_id);
      CREATE INDEX IF NOT EXISTS idx_passkeys_credential_id ON passkeys(credential_id);
      CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_challenge ON webauthn_challenges(challenge);
      CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_expires_at ON webauthn_challenges(expires_at);
    `);

    console.log('Schema created successfully');
  } catch (error) {
    console.error('Failed to create schema:', error);
    throw error;
  }
}

// データベースクリーンアップ関数（プロセス終了時に呼び出し）
export function closeDatabase(): void {
  try {
    sqlite.close();
    console.log('Database connection closed successfully');
  } catch (error) {
    console.error('Error closing database connection:', error);
  }
}

// プロセス終了時の自動クリーンアップ
process.on('exit', closeDatabase);
process.on('SIGINT', () => {
  closeDatabase();
  process.exit(0);
});
process.on('SIGTERM', () => {
  closeDatabase();
  process.exit(0);
});

export { sqlite };
export default db;