import { relations } from 'drizzle-orm';
import {
  text,
  sqliteTable,
  blob,
  integer,
} from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

// Helper function to generate UUID as default value
const generateId = () => uuidv4();

// Enable foreign key constraints
export const pragmaForeignKeys = sql`PRAGMA foreign_keys = ON`;

// Main servers table
export const servers = sqliteTable('servers', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
  name: text('name').notNull().unique(),
  image: text('image').notNull(),
  status: text('status', {
    enum: ['running', 'stopped', 'error'],
  }).notNull(),
  version: text('version'),
  description: text('description'),
  createdAt: text('created_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// Configurations table with JSON fields
export const configurations = sqliteTable('configurations', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
  serverId: text('server_id')
    .notNull()
    .unique()
    .references(() => servers.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  // JSON fields with CHECK constraints are handled in migration
  environment: text('environment'),
  enabledTools: text('enabled_tools'),
  resourceLimits: text('resource_limits'),
  networkConfig: text('network_config'),
  createdAt: text('created_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// Bitwarden items table for external references
export const bitwardenItems = sqliteTable('bitwarden_items', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
  itemId: text('item_id').notNull().unique(),
  name: text('name').notNull(),
  type: text('type', {
    enum: ['login', 'secure_note', 'card', 'identity'],
  }).notNull(),
  folderId: text('folder_id'),
  organizationId: text('organization_id'),
  createdAt: text('created_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// Secrets table with AEAD encryption components
export const secrets = sqliteTable('secrets', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
  name: text('name').notNull().unique(),
  type: text('type', {
    enum: ['api_key', 'token', 'password', 'certificate'],
  }).notNull(),
  // AEAD暗号化コンポーネントを分離して格納
  ciphertext: blob('ciphertext', { mode: 'buffer' }).notNull(),
  iv: blob('iv', { mode: 'buffer' }).notNull(),
  tag: blob('tag', { mode: 'buffer' }).notNull(),
  alg: text('alg', {
    enum: ['AES-256-GCM', 'ChaCha20-Poly1305'],
  })
    .default('AES-256-GCM')
    .notNull(),
  keyId: text('key_id').notNull(),
  bitwardenItemId: text('bitwarden_item_id').references(
    () => bitwardenItems.id,
    { onDelete: 'set null' },
  ),
  createdAt: text('created_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// Secret references junction table
export const secretReferences = sqliteTable('secret_references', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
  configurationId: text('configuration_id')
    .notNull()
    .references(() => configurations.id, {
      onDelete: 'cascade',
      onUpdate: 'cascade',
    }),
  secretId: text('secret_id')
    .notNull()
    .references(() => secrets.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  environmentVariable: text('environment_variable').notNull(),
  required: integer('required', { mode: 'boolean' }).default(false),
  createdAt: text('created_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// Resources table
export const resources = sqliteTable('resources', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
  serverId: text('server_id')
    .notNull()
    .references(() => servers.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  uri: text('uri').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  mimeType: text('mime_type'),
  metadata: text('metadata'),
  createdAt: text('created_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// Prompts table
export const prompts = sqliteTable('prompts', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
  serverId: text('server_id')
    .notNull()
    .references(() => servers.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  arguments: text('arguments'),
  metadata: text('metadata'),
  createdAt: text('created_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// Tools table
export const tools = sqliteTable('tools', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
  serverId: text('server_id')
    .notNull()
    .references(() => servers.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  inputSchema: text('input_schema').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  createdAt: text('created_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// Test results table
export const testResults = sqliteTable('test_results', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
  serverId: text('server_id')
    .notNull()
    .references(() => servers.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  toolName: text('tool_name').notNull(),
  input: text('input'),
  output: text('output'),
  success: integer('success', { mode: 'boolean' }).notNull(),
  error: text('error'),
  executionTime: integer('execution_time'),
  timestamp: text('timestamp')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// Jobs table for async operations
export const jobs = sqliteTable('jobs', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
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
  result: text('result'),
  errorCode: text('error_code'),
  errorMessage: text('error_message'),
  errorDetails: text('error_details'),
  createdAt: text('created_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  completedAt: text('completed_at'),
});

// Idempotency keys table
export const idempotencyKeys = sqliteTable('idempotency_keys', {
  key: text('key').notNull(),
  scope: text('scope').notNull(),
  requestHash: text('request_hash').notNull(),
  jobId: text('job_id')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  createdAt: text('created_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  expiresAt: text('expires_at').notNull(),
});

// Define relationships
export const serversRelations = relations(servers, ({ one, many }) => ({
  configuration: one(configurations, {
    fields: [servers.id],
    references: [configurations.serverId],
  }),
  resources: many(resources),
  prompts: many(prompts),
  tools: many(tools),
  testResults: many(testResults),
}));

export const configurationsRelations = relations(
  configurations,
  ({ one, many }) => ({
    server: one(servers, {
      fields: [configurations.serverId],
      references: [servers.id],
    }),
    secretReferences: many(secretReferences),
  }),
);

export const secretsRelations = relations(secrets, ({ one, many }) => ({
  bitwardenItem: one(bitwardenItems, {
    fields: [secrets.bitwardenItemId],
    references: [bitwardenItems.id],
  }),
  secretReferences: many(secretReferences),
}));

export const secretReferencesRelations = relations(
  secretReferences,
  ({ one }) => ({
    configuration: one(configurations, {
      fields: [secretReferences.configurationId],
      references: [configurations.id],
    }),
    secret: one(secrets, {
      fields: [secretReferences.secretId],
      references: [secrets.id],
    }),
  }),
);

export const resourcesRelations = relations(resources, ({ one }) => ({
  server: one(servers, {
    fields: [resources.serverId],
    references: [servers.id],
  }),
}));

export const promptsRelations = relations(prompts, ({ one }) => ({
  server: one(servers, {
    fields: [prompts.serverId],
    references: [servers.id],
  }),
}));

export const toolsRelations = relations(tools, ({ one }) => ({
  server: one(servers, {
    fields: [tools.serverId],
    references: [servers.id],
  }),
}));

export const testResultsRelations = relations(testResults, ({ one }) => ({
  server: one(servers, {
    fields: [testResults.serverId],
    references: [servers.id],
  }),
}));

export const jobsRelations = relations(jobs, ({ many }) => ({
  idempotencyKeys: many(idempotencyKeys),
}));

export const idempotencyKeysRelations = relations(idempotencyKeys, ({ one }) => ({
  job: one(jobs, {
    fields: [idempotencyKeys.jobId],
    references: [jobs.id],
  }),
}));