#!/usr/bin/env node

/**
 * データベースシードスクリプト
 * 開発・テスト用のサンプルデータを挿入
 */

const fs = require('fs');
const bcrypt = require('bcryptjs');

async function main() {
  console.log('🌱 Starting database seeding...\n');

  try {
    // データベース接続
    const { database, getDatabase } = require('../src/lib/database/connection');
    const db = getDatabase();

    console.log('🔌 Connected to database');

    // 既存データの確認
    const existingUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
    const existingServers = db.prepare('SELECT COUNT(*) as count FROM servers').get();

    console.log(`📊 Current data: ${existingUsers.count} users, ${existingServers.count} servers`);

    // サンプルユーザーの作成
    await createSampleUsers(db);

    // サンプルサーバーの作成
    await createSampleServers(db);

    // サンプル設定の作成
    await createSampleConfigurations(db);

    // サンプルシークレットの作成
    await createSampleSecrets(db);

    // サンプルテスト結果の作成
    await createSampleTestResults(db);

    // システム設定の更新
    await updateSystemSettings(db);

    // 最終的なデータ確認
    const finalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
    const finalServers = db.prepare('SELECT COUNT(*) as count FROM servers').get();
    const finalSecrets = db.prepare('SELECT COUNT(*) as count FROM secrets').get();

    console.log('\n📈 Final data summary:');
    console.log(`   - Users: ${finalUsers.count}`);
    console.log(`   - Servers: ${finalServers.count}`);
    console.log(`   - Secrets: ${finalSecrets.count}`);

    console.log('\n🎉 Database seeding completed successfully!');

    // 接続を閉じる
    database.close();

  } catch (error) {
    console.error('\n❌ Database seeding failed:', error.message);
    if (error.cause) {
      console.error('   Cause:', error.cause.message || error.cause);
    }
    process.exit(1);
  }
}

/**
 * サンプルユーザーの作成
 */
async function createSampleUsers(db) {
  console.log('👥 Creating sample users...');

  const users = [
    {
      id: 'dev-user-001',
      email: 'admin@example.com',
      name: 'Administrator',
      role: 'admin',
      password: 'admin123',
    },
    {
      id: 'dev-user-002',
      email: 'user@example.com',
      name: 'Regular User',
      role: 'user',
      password: 'user123',
    },
    {
      id: 'dev-user-003',
      email: 'dev@example.com',
      name: 'Developer',
      role: 'user',
      password: 'dev123',
    },
  ];

  const insertUser = db.prepare(`
    INSERT OR REPLACE INTO users (id, email, name, password_hash, role, provider, is_active)
    VALUES (?, ?, ?, ?, ?, 'credentials', 1)
  `);

  for (const user of users) {
    const passwordHash = await bcrypt.hash(user.password, 12);
    insertUser.run(user.id, user.email, user.name, passwordHash, user.role);
    console.log(`   ✅ Created user: ${user.name} (${user.email})`);
  }
}

/**
 * サンプルサーバーの作成
 */
async function createSampleServers(db) {
  console.log('🖥️  Creating sample servers...');

  const servers = [
    {
      id: 'server-001',
      name: 'Weather API Server',
      description: '天気情報を提供するMCPサーバー',
      image: 'mcp/weather-server',
      tag: 'latest',
      status: 'stopped',
      port: 3001,
      internal_port: 80,
      enabled: true,
      auto_start: false,
      created_by: 'dev-user-001',
    },
    {
      id: 'server-002',
      name: 'File Management Server',
      description: 'ファイル管理機能を提供するMCPサーバー',
      image: 'mcp/file-manager',
      tag: 'v1.2.0',
      status: 'running',
      port: 3002,
      internal_port: 80,
      enabled: true,
      auto_start: true,
      created_by: 'dev-user-001',
    },
    {
      id: 'server-003',
      name: 'Database Connector',
      description: 'データベース接続を提供するMCPサーバー',
      image: 'mcp/db-connector',
      tag: 'latest',
      status: 'error',
      port: 3003,
      internal_port: 80,
      enabled: false,
      auto_start: false,
      created_by: 'dev-user-002',
    },
  ];

  const insertServer = db.prepare(`
    INSERT OR REPLACE INTO servers 
    (id, name, description, image, tag, status, port, internal_port, enabled, auto_start, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const server of servers) {
    insertServer.run(
      server.id,
      server.name,
      server.description,
      server.image,
      server.tag,
      server.status,
      server.port,
      server.internal_port,
      server.enabled,
      server.auto_start,
      server.created_by
    );
    console.log(`   ✅ Created server: ${server.name}`);
  }
}

/**
 * サンプル設定の作成
 */
async function createSampleConfigurations(db) {
  console.log('⚙️  Creating sample configurations...');

  const configurations = [
    {
      server_id: 'server-001',
      environment_variables: JSON.stringify({
        API_KEY: '${SECRET:weather_api_key}',
        LOG_LEVEL: 'info',
        PORT: '80',
      }),
      memory_limit: '512MB',
      cpu_limit: '0.5',
      volumes: JSON.stringify([
        { host: './data/weather', container: '/app/data', mode: 'rw' },
      ]),
      ports: JSON.stringify({ '80': '3001' }),
    },
    {
      server_id: 'server-002',
      environment_variables: JSON.stringify({
        STORAGE_PATH: '/app/storage',
        MAX_FILE_SIZE: '100MB',
        ALLOWED_EXTENSIONS: 'txt,md,json,yaml',
      }),
      memory_limit: '1GB',
      cpu_limit: '1.0',
      volumes: JSON.stringify([
        { host: './data/files', container: '/app/storage', mode: 'rw' },
      ]),
      ports: JSON.stringify({ '80': '3002' }),
    },
    {
      server_id: 'server-003',
      environment_variables: JSON.stringify({
        DB_URL: '${SECRET:database_url}',
        DB_POOL_SIZE: '10',
        CONNECTION_TIMEOUT: '30000',
      }),
      memory_limit: '256MB',
      cpu_limit: '0.25',
      ports: JSON.stringify({ '80': '3003' }),
    },
  ];

  const insertConfig = db.prepare(`
    INSERT OR REPLACE INTO configurations 
    (server_id, environment_variables, memory_limit, cpu_limit, volumes, ports)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const config of configurations) {
    insertConfig.run(
      config.server_id,
      config.environment_variables,
      config.memory_limit,
      config.cpu_limit,
      config.volumes || null,
      config.ports
    );
    console.log(`   ✅ Created configuration for server: ${config.server_id}`);
  }
}

/**
 * サンプルシークレットの作成
 */
async function createSampleSecrets(db) {
  console.log('🔐 Creating sample secrets...');

  // 注意: 実際の本番環境では適切な暗号化を実装する必要があります
  const secrets = [
    {
      id: 'secret-001',
      name: 'weather_api_key',
      description: 'Weather API access key',
      encrypted_value: 'sample-encrypted-weather-api-key',
      encryption_key_id: 'key-001',
      type: 'api_key',
      created_by: 'dev-user-001',
    },
    {
      id: 'secret-002',
      name: 'database_url',
      description: 'Database connection URL',
      encrypted_value: 'sample-encrypted-database-url',
      encryption_key_id: 'key-001',
      type: 'password',
      created_by: 'dev-user-001',
    },
    {
      id: 'secret-003',
      name: 'ssl_certificate',
      description: 'SSL certificate for HTTPS',
      encrypted_value: 'sample-encrypted-ssl-cert',
      encryption_key_id: 'key-001',
      type: 'certificate',
      created_by: 'dev-user-001',
    },
  ];

  const insertSecret = db.prepare(`
    INSERT OR REPLACE INTO secrets 
    (id, name, description, encrypted_value, encryption_key_id, type, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const secret of secrets) {
    insertSecret.run(
      secret.id,
      secret.name,
      secret.description,
      secret.encrypted_value,
      secret.encryption_key_id,
      secret.type,
      secret.created_by
    );
    console.log(`   ✅ Created secret: ${secret.name}`);
  }
}

/**
 * サンプルテスト結果の作成
 */
async function createSampleTestResults(db) {
  console.log('🧪 Creating sample test results...');

  const testResults = [
    {
      server_id: 'server-001',
      test_type: 'connection',
      test_name: 'HTTP Connection Test',
      status: 'passed',
      duration_ms: 150,
      result_data: JSON.stringify({ response_code: 200, latency: 150 }),
      executed_by: 'dev-user-001',
      started_at: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
      completed_at: new Date(Date.now() - 86400000 + 150).toISOString(),
    },
    {
      server_id: 'server-002',
      test_type: 'health_check',
      test_name: 'Health Check',
      status: 'passed',
      duration_ms: 80,
      result_data: JSON.stringify({ status: 'healthy', version: '1.2.0' }),
      executed_by: 'dev-user-001',
      started_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      completed_at: new Date(Date.now() - 3600000 + 80).toISOString(),
    },
    {
      server_id: 'server-003',
      test_type: 'connection',
      test_name: 'Database Connection Test',
      status: 'failed',
      duration_ms: 5000,
      error_message: 'Connection timeout',
      executed_by: 'dev-user-002',
      started_at: new Date(Date.now() - 1800000).toISOString(), // 30 minutes ago
      completed_at: new Date(Date.now() - 1800000 + 5000).toISOString(),
    },
  ];

  const insertTestResult = db.prepare(`
    INSERT OR REPLACE INTO test_results 
    (server_id, test_type, test_name, status, duration_ms, result_data, error_message, executed_by, started_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const result of testResults) {
    insertTestResult.run(
      result.server_id,
      result.test_type,
      result.test_name,
      result.status,
      result.duration_ms,
      result.result_data || null,
      result.error_message || null,
      result.executed_by,
      result.started_at,
      result.completed_at
    );
    console.log(`   ✅ Created test result: ${result.test_name} (${result.status})`);
  }
}

/**
 * システム設定の更新
 */
async function updateSystemSettings(db) {
  console.log('🔧 Updating system settings...');

  const settings = [
    { key: 'app.environment', value: 'development', type: 'string', description: 'Current environment' },
    { key: 'app.debug', value: 'true', type: 'boolean', description: 'Enable debug mode' },
    { key: 'server.max_servers', value: '10', type: 'number', description: 'Maximum number of servers' },
    { key: 'ui.theme', value: 'light', type: 'string', description: 'Default UI theme' },
  ];

  const insertSetting = db.prepare(`
    INSERT OR REPLACE INTO system_settings (key, value, type, description, category)
    VALUES (?, ?, ?, ?, 'development')
  `);

  for (const setting of settings) {
    insertSetting.run(setting.key, setting.value, setting.type, setting.description);
    console.log(`   ✅ Updated setting: ${setting.key} = ${setting.value}`);
  }
}

// スクリプトが直接実行された場合のみメイン関数を実行
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}

module.exports = { main };