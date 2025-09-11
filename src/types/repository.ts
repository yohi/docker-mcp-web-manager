// データベースアクセス層のインターフェース定義

import {
  MCPServer,
  Secret,
  Tool,
  Resource,
  Prompt,
  ServerConfiguration,
  TestResult,
  ListResponse,
  ListOptions,
  ServerFilters,
  ToolFilters,
  ResourceFilters,
  PromptFilters,
  SecretFilters,
  CreateSecretRequest,
  UpdateSecretRequest,
  CreateToolRequest,
  UpdateToolRequest,
  CreateResourceRequest,
  UpdateResourceRequest,
  CreatePromptRequest,
  UpdatePromptRequest,
  CreateServerConfigurationRequest,
  UpdateServerConfigurationRequest,
} from './mcp';

// ベースリポジトリインターフェース
export interface BaseRepository<T, TCreate, TUpdate, TFilters extends ListOptions = ListOptions> {
  // CRUD操作
  create(data: TCreate): Promise<T>;
  findById(id: string): Promise<T | null>;
  findAll(filters?: TFilters): Promise<ListResponse<T>>;
  update(id: string, data: TUpdate): Promise<T | null>;
  delete(id: string): Promise<boolean>;
  
  // バッチ操作
  createMany(data: TCreate[]): Promise<T[]>;
  updateMany(ids: string[], data: TUpdate): Promise<T[]>;
  deleteMany(ids: string[]): Promise<number>;
}

// 各エンティティのリポジトリインターフェース
export interface ServerRepository extends BaseRepository<MCPServer, Omit<MCPServer, 'id' | 'createdAt' | 'updatedAt'>, Partial<Omit<MCPServer, 'id' | 'createdAt' | 'updatedAt'>>, ServerFilters> {
  // サーバー固有の操作
  findByName(name: string): Promise<MCPServer | null>;
  findByStatus(status: 'running' | 'stopped' | 'error'): Promise<MCPServer[]>;
  findByImage(image: string): Promise<MCPServer[]>;
  updateStatus(id: string, status: 'running' | 'stopped' | 'error'): Promise<MCPServer | null>;
  
  // 統計情報
  getStatusCounts(): Promise<{ running: number; stopped: number; error: number; total: number }>;
  getTotalCount(): Promise<number>;
}

export interface SecretRepository extends BaseRepository<Secret, CreateSecretRequest, UpdateSecretRequest, SecretFilters> {
  // シークレット固有の操作
  findByName(name: string): Promise<Secret | null>;
  findExpiredSecrets(): Promise<Secret[]>;
  findByKeyVersion(version: number): Promise<Secret[]>;
  
  // セキュリティ操作
  rotateKey(oldVersion: number, newVersion: number): Promise<number>; // 更新された件数を返す
  cleanupExpired(): Promise<number>; // 削除された件数を返す
}

export interface ToolRepository extends BaseRepository<Tool, CreateToolRequest, UpdateToolRequest, ToolFilters> {
  // ツール固有の操作
  findByServerId(serverId: string): Promise<Tool[]>;
  findByName(serverId: string, name: string): Promise<Tool | null>;
  findEnabledByServerId(serverId: string): Promise<Tool[]>;
  
  // バルク操作
  enableByIds(ids: string[]): Promise<number>;
  disableByIds(ids: string[]): Promise<number>;
  deleteByServerId(serverId: string): Promise<number>;
}

export interface ResourceRepository extends BaseRepository<Resource, CreateResourceRequest, UpdateResourceRequest, ResourceFilters> {
  // リソース固有の操作
  findByServerId(serverId: string): Promise<Resource[]>;
  findByUri(uri: string): Promise<Resource | null>;
  findByMimeType(mimeType: string): Promise<Resource[]>;
  
  // 統計情報
  getTotalSize(): Promise<number>;
  getSizeByServerId(serverId: string): Promise<number>;
  deleteByServerId(serverId: string): Promise<number>;
}

export interface PromptRepository extends BaseRepository<Prompt, CreatePromptRequest, UpdatePromptRequest, PromptFilters> {
  // プロンプト固有の操作
  findByServerId(serverId: string): Promise<Prompt[]>;
  findByName(serverId: string, name: string): Promise<Prompt | null>;
  
  // バルク操作
  deleteByServerId(serverId: string): Promise<number>;
}

export interface ServerConfigurationRepository extends BaseRepository<ServerConfiguration, CreateServerConfigurationRequest, UpdateServerConfigurationRequest, ListOptions> {
  // 設定固有の操作
  findByServerId(serverId: string): Promise<ServerConfiguration | null>;
  findWithSecrets(serverId: string): Promise<ServerConfiguration | null>; // シークレット参照も解決
  
  // 設定管理
  cloneConfiguration(sourceServerId: string, targetServerId: string): Promise<ServerConfiguration>;
  validateConfiguration(serverId: string): Promise<{ valid: boolean; errors: string[] }>;
}

export interface TestResultRepository extends BaseRepository<TestResult, Omit<TestResult, 'id' | 'timestamp'>, Partial<Omit<TestResult, 'id' | 'timestamp'>>, ListOptions> {
  // テスト結果固有の操作
  findByServerId(serverId: string, options?: ListOptions): Promise<ListResponse<TestResult>>;
  findByToolName(serverId: string, toolName: string, options?: ListOptions): Promise<ListResponse<TestResult>>;
  findSuccessful(serverId: string): Promise<TestResult[]>;
  findFailed(serverId: string): Promise<TestResult[]>;
  
  // 統計情報
  getSuccessRate(serverId: string, days?: number): Promise<number>;
  getAverageExecutionTime(serverId: string, toolName?: string): Promise<number>;
  
  // クリーンアップ
  deleteOlderThan(days: number): Promise<number>;
  deleteByServerId(serverId: string): Promise<number>;
}

// トランザクション管理
export interface TransactionManager {
  begin(): Promise<Transaction>;
}

export interface Transaction {
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

// データベースエラー
export class RepositoryError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'RepositoryError';
  }
}

export class NotFoundError extends RepositoryError {
  constructor(entity: string, id: string) {
    super(`${entity} with id ${id} not found`, 'NOT_FOUND');
  }
}

export class DuplicateError extends RepositoryError {
  constructor(entity: string, field: string, value: string) {
    super(`${entity} with ${field} ${value} already exists`, 'DUPLICATE');
  }
}

export class ValidationError extends RepositoryError {
  constructor(message: string, public readonly field?: string) {
    super(message, 'VALIDATION');
  }
}

// データベース設定
export interface DatabaseConfig {
  url: string;
  pool?: {
    min?: number;
    max?: number;
    idleTimeoutMillis?: number;
    connectionTimeoutMillis?: number;
  };
  logging?: boolean;
  migrations?: {
    directory?: string;
    tableName?: string;
  };
}

// リポジトリファクトリー
export interface RepositoryFactory {
  createServerRepository(): ServerRepository;
  createSecretRepository(): SecretRepository;
  createToolRepository(): ToolRepository;
  createResourceRepository(): ResourceRepository;
  createPromptRepository(): PromptRepository;
  createServerConfigurationRepository(): ServerConfigurationRepository;
  createTestResultRepository(): TestResultRepository;
  createTransactionManager(): TransactionManager;
}