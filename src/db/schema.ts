import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  blob,
  index,
} from 'drizzle-orm/sqlite-core';

// =============================================================================
// Servers Table
// =============================================================================
export const servers = sqliteTable(
  'servers',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull().unique(),
    image: text('image').notNull(),
    status: text('status', {
      enum: ['running', 'stopped', 'error'],
    }).notNull(),
    version: text('version'),
    description: text('description'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    nameIdx: index('idx_servers_name').on(table.name),
    statusIdx: index('idx_servers_status').on(table.status),
    updatedAtIdx: index('idx_servers_updated_at').on(table.updatedAt),
  })
);

// =============================================================================
// Configurations Table
// =============================================================================
export const configurations = sqliteTable(
  'configurations',
  {
    id: text('id').primaryKey(),
    serverId: text('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    // JSON fields with validation
    environment: text('environment'),
    enabledTools: text('enabled_tools'),
    resourceLimits: text('resource_limits'),
    networkConfig: text('network_config'),
    // Generated columns for indexing JSON paths
    nodeEnv: text('node_env').generatedAlwaysAs(
      sql`json_extract(environment, '$.NODE_ENV')`,
      { mode: 'virtual' }
    ),
    enabledToolsCount: integer('enabled_tools_count').generatedAlwaysAs(
      sql`json_array_length(enabled_tools)`,
      { mode: 'virtual' }
    ),
    memoryLimit: text('memory_limit').generatedAlwaysAs(
      sql`json_extract(resource_limits, '$.memory')`,
      { mode: 'virtual' }
    ),
    representativePort: integer('representative_port').generatedAlwaysAs(
      sql`COALESCE(
        json_extract(network_config, '$.ports[0].hostPort'),
        json_extract(network_config, '$.ports[0].containerPort')
      )`,
      { mode: 'virtual' }
    ),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    serverIdIdx: index('idx_configurations_server_id').on(table.serverId),
    nodeEnvIdx: index('idx_configurations_node_env').on(table.nodeEnv),
    enabledToolsCountIdx: index('idx_configurations_enabled_tools_count').on(
      table.enabledToolsCount
    ),
    memoryLimitIdx: index('idx_configurations_memory_limit').on(
      table.memoryLimit
    ),
    representativePortIdx: index('idx_configurations_representative_port').on(
      table.representativePort
    ),
    // Unique constraint for one configuration per server
    serverIdUnique: index('unique_server_config').on(table.serverId),
  })
);

// =============================================================================
// Bitwarden Items Table (for foreign key integrity)
// =============================================================================
export const bitwardenItems = sqliteTable(
  'bitwarden_items',
  {
    id: text('id').primaryKey(),
    itemId: text('item_id').notNull().unique(),
    name: text('name').notNull(),
    type: text('type', {
      enum: ['login', 'secure_note', 'card', 'identity'],
    }).notNull(),
    folderId: text('folder_id'),
    organizationId: text('organization_id'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    nameIdx: index('idx_bitwarden_items_name').on(table.name),
    typeIdx: index('idx_bitwarden_items_type').on(table.type),
    folderIdIdx: index('idx_bitwarden_items_folder_id').on(table.folderId),
  })
);

// =============================================================================
// Secrets Table (with AEAD encryption components)
// =============================================================================
export const secrets = sqliteTable(
  'secrets',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull().unique(),
    type: text('type', {
      enum: ['api_key', 'token', 'password', 'certificate'],
    }).notNull(),
    // AEAD encryption components stored separately
    ciphertext: blob('ciphertext').notNull(),
    iv: blob('iv').notNull(), // 12 bytes for both AES-256-GCM and ChaCha20-Poly1305
    tag: blob('tag').notNull(), // 16 bytes authentication tag
    alg: text('alg', {
      enum: ['AES-256-GCM', 'ChaCha20-Poly1305'],
    })
      .notNull()
      .default('AES-256-GCM'),
    keyId: text('key_id').notNull(), // KMS key identifier
    bitwardenItemId: text('bitwarden_item_id').references(
      () => bitwardenItems.id,
      { onDelete: 'set null' }
    ),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    typeIdx: index('idx_secrets_type').on(table.type),
    bitwardenItemIdIdx: index('idx_secrets_bitwarden_item_id').on(
      table.bitwardenItemId
    ),
    algIdx: index('idx_secrets_alg').on(table.alg),
    keyIdIdx: index('idx_secrets_key_id').on(table.keyId),
    // AEAD security: prevent IV reuse attack
    ivReusePreventionIdx: index('unique_key_iv_alg').on(
      table.keyId,
      table.iv,
      table.alg
    ),
  })
);

// =============================================================================
// Secret References Table (many-to-many relationship)
// =============================================================================
export const secretReferences = sqliteTable(
  'secret_references',
  {
    id: text('id').primaryKey(),
    configurationId: text('configuration_id')
      .notNull()
      .references(() => configurations.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    secretId: text('secret_id')
      .notNull()
      .references(() => secrets.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    environmentVariable: text('environment_variable').notNull(),
    required: integer('required', { mode: 'boolean' }).default(false),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    configurationIdIdx: index('idx_secret_references_configuration_id').on(
      table.configurationId
    ),
    secretIdIdx: index('idx_secret_references_secret_id').on(table.secretId),
    // Unique constraint for configuration and environment variable
    configEnvVarUnique: index('unique_config_env_var').on(
      table.configurationId,
      table.environmentVariable
    ),
  })
);

// =============================================================================
// Resources Table
// =============================================================================
export const resources = sqliteTable(
  'resources',
  {
    id: text('id').primaryKey(),
    serverId: text('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    uri: text('uri').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    mimeType: text('mime_type'),
    metadata: text('metadata'), // JSON object
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    serverIdIdx: index('idx_resources_server_id').on(table.serverId),
    // Unique constraint for server and URI
    serverUriUnique: index('unique_server_uri').on(table.serverId, table.uri),
  })
);

// =============================================================================
// Prompts Table
// =============================================================================
export const prompts = sqliteTable(
  'prompts',
  {
    id: text('id').primaryKey(),
    serverId: text('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    arguments: text('arguments'), // JSONSchema object
    metadata: text('metadata'), // JSON object
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    serverIdIdx: index('idx_prompts_server_id').on(table.serverId),
    // Unique constraint for server and name
    serverNameUnique: index('unique_server_name').on(
      table.serverId,
      table.name
    ),
  })
);

// =============================================================================
// Tools Table
// =============================================================================
export const tools = sqliteTable(
  'tools',
  {
    id: text('id').primaryKey(),
    serverId: text('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    inputSchema: text('input_schema').notNull(), // JSONSchema object
    enabled: integer('enabled', { mode: 'boolean' }).default(true),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    serverIdIdx: index('idx_tools_server_id').on(table.serverId),
    enabledIdx: index('idx_tools_enabled').on(table.enabled),
    // Unique constraint for server and name
    serverNameUnique: index('unique_tool_server_name').on(
      table.serverId,
      table.name
    ),
  })
);

// =============================================================================
// Test Results Table
// =============================================================================
export const testResults = sqliteTable(
  'test_results',
  {
    id: text('id').primaryKey(),
    serverId: text('server_id')
      .notNull()
      .references(() => servers.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    toolName: text('tool_name').notNull(),
    input: text('input'), // JSON with validation
    output: text('output'), // JSON with validation
    success: integer('success', { mode: 'boolean' }).notNull(),
    error: text('error'),
    executionTime: integer('execution_time'),
    timestamp: text('timestamp').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    // Composite index for optimizing test history queries
    serverToolTimeIdx: index('idx_test_results_server_tool_time').on(
      table.serverId,
      table.toolName,
      table.timestamp
    ),
  })
);

// =============================================================================
// Jobs Table (for async operation management)
// =============================================================================
export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    type: text('type', {
      enum: ['install', 'start', 'stop', 'test', 'enable', 'disable', 'delete'],
    }).notNull(),
    status: text('status', {
      enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
    }).notNull(),
    targetType: text('target_type', {
      enum: ['server', 'catalog', 'gateway'],
    }).notNull(),
    targetId: text('target_id').notNull(),
    progressCurrent: integer('progress_current').default(0),
    progressTotal: integer('progress_total').default(100),
    progressMessage: text('progress_message'),
    result: text('result'), // JSON with validation
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    errorDetails: text('error_details'), // JSON with validation
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
    completedAt: text('completed_at'),
  },
  (table) => ({
    // Operational indexes for runtime queries
    targetLatestIdx: index('idx_jobs_target_latest').on(
      table.targetType,
      table.targetId,
      table.createdAt
    ),
    inProgressIdx: index('idx_jobs_in_progress').on(table.status, table.updatedAt),
    targetStatusIdx: index('idx_jobs_target_status').on(
      table.targetType,
      table.targetId,
      table.status,
      table.createdAt
    ),
  })
);

// =============================================================================
// Idempotency Keys Table (for request deduplication)
// =============================================================================
export const idempotencyKeys = sqliteTable(
  'idempotency_keys',
  {
    key: text('key').notNull(),
    scope: text('scope').notNull(), // e.g. "POST:/api/v1/servers/{id}/start"
    requestHash: text('request_hash').notNull(), // normalized request body/params hash
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    expiresAt: text('expires_at').notNull(),
  },
  (table) => ({
    // Primary key compound
    keyScope: index('pk_key_scope').on(table.key, table.scope),
    // Index for efficient cleanup of expired keys
    scopeExpIdx: index('idx_idem_scope_exp').on(table.scope, table.expiresAt),
    jobIdIdx: index('idx_idem_job_id').on(table.jobId),
    // Fast mismatch check for idempotency key conflicts
    scopeHashIdx: index('idx_idem_scope_hash').on(table.scope, table.requestHash),
  })
);

// =============================================================================
// Export all tables for use in relations and queries
// =============================================================================
export {
  servers as serversTable,
  configurations as configurationsTable,
  bitwardenItems as bitwardenItemsTable,
  secrets as secretsTable,
  secretReferences as secretReferencesTable,
  resources as resourcesTable,
  prompts as promptsTable,
  tools as toolsTable,
  testResults as testResultsTable,
  jobs as jobsTable,
  idempotencyKeys as idempotencyKeysTable,
};