// 型定義のメインインデックス

// MCP関連の型
export * from './mcp';

// リポジトリ関連の型
export * from './repository';

// 既存の型定義（下位互換性のため一部維持）
export * from './models';

// 共通型定義
export interface PaginationOptions {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface SortOptions {
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface SearchOptions {
  search?: string;
  searchFields?: string[];
}

export interface FilterOptions extends PaginationOptions, SortOptions, SearchOptions {
  [key: string]: any;
}

// API関連の型
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  meta?: {
    timestamp: string;
    requestId?: string;
    version?: string;
  };
}

export interface ApiListResponse<T = any> extends ApiResponse<T[]> {
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ヘルスチェック関連
export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    database: HealthCheckResult;
    docker: HealthCheckResult;
    encryption: HealthCheckResult;
    [service: string]: HealthCheckResult;
  };
}

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  responseTime?: number;
  error?: string;
  details?: Record<string, any>;
}

// ログ関連
export interface LogLevel {
  DEBUG: 'debug';
  INFO: 'info';
  WARN: 'warn';
  ERROR: 'error';
}

export interface LogEntry {
  level: keyof LogLevel;
  message: string;
  timestamp: string;
  service?: string;
  requestId?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

// 設定関連
export interface AppConfig {
  app: {
    name: string;
    version: string;
    environment: 'development' | 'staging' | 'production';
    port: number;
    host: string;
  };
  database: {
    url: string;
    pool?: {
      min: number;
      max: number;
      idleTimeoutMillis: number;
    };
  };
  security: {
    encryptionMasterKey: string;
    jwtSecret: string;
    sessionTimeout: number;
    rateLimiting: {
      windowMs: number;
      maxRequests: number;
    };
  };
  docker: {
    host?: string;
    gatewayUrl?: string;
    timeout: number;
  };
  logging: {
    level: keyof LogLevel;
    format: 'json' | 'text';
    destinations: Array<'console' | 'file' | 'external'>;
  };
}

// イベント関連
export interface DomainEvent {
  id: string;
  type: string;
  aggregateId: string;
  aggregateType: string;
  data: Record<string, any>;
  metadata: {
    timestamp: string;
    version: number;
    userId?: string;
    correlationId?: string;
  };
}

// サーバーイベント
export interface ServerEvent extends DomainEvent {
  aggregateType: 'server';
}

export interface ServerCreatedEvent extends ServerEvent {
  type: 'server.created';
  data: {
    serverId: string;
    name: string;
    image: string;
  };
}

export interface ServerStatusChangedEvent extends ServerEvent {
  type: 'server.status.changed';
  data: {
    serverId: string;
    oldStatus: string;
    newStatus: string;
  };
}

// 設定イベント
export interface ConfigurationEvent extends DomainEvent {
  aggregateType: 'configuration';
}

export interface ConfigurationUpdatedEvent extends ConfigurationEvent {
  type: 'configuration.updated';
  data: {
    serverId: string;
    changes: Record<string, any>;
  };
}

// シークレットイベント
export interface SecretEvent extends DomainEvent {
  aggregateType: 'secret';
}

export interface SecretCreatedEvent extends SecretEvent {
  type: 'secret.created';
  data: {
    secretId: string;
    name: string;
  };
}

export interface SecretRotatedEvent extends SecretEvent {
  type: 'secret.rotated';
  data: {
    secretId: string;
    oldKeyVersion: number;
    newKeyVersion: number;
  };
}

// ユーティリティ型
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? DeepPartial<U>[]
    : T[P] extends Record<string, any>
    ? DeepPartial<T[P]>
    : T[P];
};

export type RequiredKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OptionalKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type NonNullable<T> = T extends null | undefined ? never : T;

// 型ガード
export function isApiResponse<T>(obj: any): obj is ApiResponse<T> {
  return typeof obj === 'object' && obj !== null && 'success' in obj;
}

export function isApiListResponse<T>(obj: any): obj is ApiListResponse<T> {
  return isApiResponse(obj) && 'pagination' in obj;
}

export function isHealthStatus(obj: any): obj is HealthStatus {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'status' in obj &&
    'timestamp' in obj &&
    'checks' in obj
  );
}