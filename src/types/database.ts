import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type {
  servers,
  configurations,
  bitwardenItems,
  secrets,
  secretReferences,
  resources,
  prompts,
  tools,
  testResults,
  jobs,
  idempotencyKeys,
} from '../db/schema';

// データベーステーブルから型を推論
export type Server = InferSelectModel<typeof servers>;
export type NewServer = InferInsertModel<typeof servers>;

export type Configuration = InferSelectModel<typeof configurations>;
export type NewConfiguration = InferInsertModel<typeof configurations>;

export type BitwardenItem = InferSelectModel<typeof bitwardenItems>;
export type NewBitwardenItem = InferInsertModel<typeof bitwardenItems>;

export type Secret = InferSelectModel<typeof secrets>;
export type NewSecret = InferInsertModel<typeof secrets>;

export type SecretReference = InferSelectModel<typeof secretReferences>;
export type NewSecretReference = InferInsertModel<typeof secretReferences>;

export type Resource = InferSelectModel<typeof resources>;
export type NewResource = InferInsertModel<typeof resources>;

export type Prompt = InferSelectModel<typeof prompts>;
export type NewPrompt = InferInsertModel<typeof prompts>;

export type Tool = InferSelectModel<typeof tools>;
export type NewTool = InferInsertModel<typeof tools>;

export type TestResult = InferSelectModel<typeof testResults>;
export type NewTestResult = InferInsertModel<typeof testResults>;

export type Job = InferSelectModel<typeof jobs>;
export type NewJob = InferInsertModel<typeof jobs>;

export type IdempotencyKey = InferSelectModel<typeof idempotencyKeys>;
export type NewIdempotencyKey = InferInsertModel<typeof idempotencyKeys>;

// 複合型定義（リレーションシップを含む）
export interface ServerWithDetails extends Server {
  configuration?: Configuration;
  resources: Resource[];
  prompts: Prompt[];
  tools: Tool[];
}

export interface ConfigurationWithSecrets extends Configuration {
  secretReferences: (SecretReference & {
    secret: Secret;
  })[];
}

export interface SecretWithBitwarden extends Secret {
  bitwardenItem?: BitwardenItem;
}

// JSON フィールドの型定義
export interface ServerEnvironment {
  NODE_ENV?: 'development' | 'production' | 'test';
  [key: string]: string | undefined;
}

export interface ResourceLimits {
  memory?: string; // "512m", "1g"
  cpu?: string; // "0.5", "1"
  disk?: string; // "1g", "10g"
  network?: {
    bandwidth?: string; // "100m", "1g"
    connections?: number;
  };
}

export interface NetworkConfig {
  mode: 'bridge' | 'host' | 'none' | 'overlay';
  ports?: Array<{
    containerPort: number;
    hostPort?: number;
    protocol: 'tcp' | 'udp';
  }>;
  networks?: string[];
  dns?: string[];
  extraHosts?: Array<{
    hostname: string;
    ip: string;
  }>;
}

export interface JSONSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema | JSONSchema[];
  required?: string[];
  enum?: any[];
  const?: any;
  format?: string;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  additionalProperties?: boolean | JSONSchema;
  description?: string;
  title?: string;
  default?: any;
  examples?: any[];
}

// Job関連の型定義
export interface JobTarget {
  type: 'server' | 'catalog' | 'gateway';
  id: string;
}

export interface JobProgress {
  current: number;
  total: number;
  message: string;
}

export interface JobError {
  code: string;
  message: string;
  details?: any;
}

export interface JobResponse {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  message?: string;
  estimatedDuration?: number;
}

// API レスポンス型
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: any;
  requestId: string;
  timestamp: string;
}

export interface ApiErrorResponse {
  error: ApiError;
}