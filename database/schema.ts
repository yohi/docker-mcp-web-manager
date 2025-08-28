// database/schema.ts
// Drizzle ORM スキーマ定義

import { sqliteTable, text, integer, real, blob } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// 1. servers テーブル
export const servers = sqliteTable('servers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  image: text('image').notNull(),
  status: text('status', { enum: ['running', 'stopped', 'error', 'unknown'] }).notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  lastHealthCheck: text('last_health_check'),
  metadata: text('metadata', { mode: 'json' }),
});

// 2. configurations テーブル
export const configurations = sqliteTable('configurations', {
  id: text('id').primaryKey(),
  serverId: text('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  configData: text('config_data', { mode: 'json' }).notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  createdBy: text('created_by'),
});

// 3. secrets テーブル
export const secrets = sqliteTable('secrets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  encryptedValue: text('encrypted_value').notNull(),
  encryptionKeyId: text('encryption_key_id').notNull(),
  scope: text('scope', { enum: ['global', 'server', 'configuration'] }).notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  createdBy: text('created_by'),
  expiresAt: text('expires_at'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
});

// 4. configuration_secrets テーブル（多対多関係）
export const configurationSecrets = sqliteTable('configuration_secrets', {
  id: text('id').primaryKey(),
  configurationId: text('configuration_id').notNull().references(() => configurations.id, { onDelete: 'cascade' }),
  secretId: text('secret_id').notNull().references(() => secrets.id, { onDelete: 'cascade' }),
  scope: text('scope', { enum: ['required', 'optional', 'conditional'] }).notNull(),
  usageContext: text('usage_context'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  createdBy: text('created_by'),
}, (table) => ({
  uniqueConfigSecret: unique().on(table.configurationId, table.secretId),
}));

// 5. test_results テーブル
export const testResults = sqliteTable('test_results', {
  id: text('id').primaryKey(),
  serverId: text('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  configurationId: text('configuration_id').references(() => configurations.id, { onDelete: 'set null' }),
  toolName: text('tool_name').notNull(),
  testType: text('test_type', { enum: ['connection', 'functionality', 'performance', 'security'] }).notNull(),
  status: text('status', { enum: ['success', 'failure', 'error', 'timeout'] }).notNull(),
  inputData: text('input_data', { mode: 'json' }),
  outputData: text('output_data', { mode: 'json' }),
  errorMessage: text('error_message'),
  executionTimeMs: integer('execution_time_ms'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  createdBy: text('created_by'),
});

// 6. encryption_keys テーブル
export const encryptionKeys = sqliteTable('encryption_keys', {
  id: text('id').primaryKey(),
  keyName: text('key_name').notNull().unique(),
  keyVersion: integer('key_version').notNull().default(1),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  rotatedAt: text('rotated_at'),
  createdBy: text('created_by'),
});

// リレーション定義
export const serversRelations = relations(servers, ({ many }) => ({
  configurations: many(configurations),
  testResults: many(testResults),
}));

export const configurationsRelations = relations(configurations, ({ one, many }) => ({
  server: one(servers, {
    fields: [configurations.serverId],
    references: [servers.id],
  }),
  configurationSecrets: many(configurationSecrets),
  testResults: many(testResults),
}));

export const secretsRelations = relations(secrets, ({ many }) => ({
  configurationSecrets: many(configurationSecrets),
}));

export const configurationSecretsRelations = relations(configurationSecrets, ({ one }) => ({
  configuration: one(configurations, {
    fields: [configurationSecrets.configurationId],
    references: [configurations.id],
  }),
  secret: one(secrets, {
    fields: [configurationSecrets.secretId],
    references: [secrets.id],
  }),
}));

export const testResultsRelations = relations(testResults, ({ one }) => ({
  server: one(servers, {
    fields: [testResults.serverId],
    references: [servers.id],
  }),
  configuration: one(configurations, {
    fields: [testResults.configurationId],
    references: [configurations.id],
  }),
}));

export const encryptionKeysRelations = relations(encryptionKeys, ({ many }) => ({
  secrets: many(secrets),
}));

// 型定義のエクスポート
export type Server = typeof servers.$inferSelect;
export type NewServer = typeof servers.$inferInsert;
export type Configuration = typeof configurations.$inferSelect;
export type NewConfiguration = typeof configurations.$inferInsert;
export type Secret = typeof secrets.$inferSelect;
export type NewSecret = typeof secrets.$inferInsert;
export type ConfigurationSecret = typeof configurationSecrets.$inferSelect;
export type NewConfigurationSecret = typeof configurationSecrets.$inferInsert;
export type TestResult = typeof testResults.$inferSelect;
export type NewTestResult = typeof testResults.$inferInsert;
export type EncryptionKey = typeof encryptionKeys.$inferSelect;
export type NewEncryptionKey = typeof encryptionKeys.$inferInsert;
