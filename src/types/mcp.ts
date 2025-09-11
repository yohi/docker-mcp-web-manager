// MCP関連の型定義 - 既存のスキーマから基本型をインポート
export type {
  MCPServer,
  TestResult,
  CatalogEntry,
  LogEntry,
  DockerMCPError,
  JobResponse,
  JobStatus,
  GatewayStatus,
} from '@/lib/schemas/docker-mcp-schemas';

export {
  mcpServerSchema,
  testResultSchema,
  catalogEntrySchema,
  logEntrySchema,
  dockerMCPErrorSchema,
  jobResponseSchema,
  jobStatusSchema,
  gatewayStatusSchema,
} from '@/lib/schemas/docker-mcp-schemas';

// 新しい型定義（一時的にスキーマファイルからのインポートをコメントアウト）
// TODO: スキーマファイルの追加が完了したら、これらのインポートを有効化
// export type {
//   Secret,
//   SecretReference,
//   JSONSchema,
//   Tool,
//   Resource,
//   Prompt,
//   ServerConfiguration,
// } from '@/lib/schemas/docker-mcp-schemas';

// export {
//   secretSchema,
//   secretReferenceSchema,
//   jsonSchemaSchema,
//   toolSchema,
//   resourceSchema,
//   promptSchema,
//   serverConfigurationSchema,
// } from '@/lib/schemas/docker-mcp-schemas';

// 型定義の前方宣言（循環参照解決用）
export interface JSONSchema {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null';
  properties?: Record<string, any>;
  required?: string[];
  items?: any;
  enum?: any[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  description?: string;
  default?: any;
  format?: string;
  additionalProperties?: boolean | any;
}

export interface SecretReference {
  secretId: string;
  key?: string;
  defaultValue?: string;
}

// 追加の型定義
export interface Secret {
  id: string;
  name: string;
  description?: string;
  value: string;
  iv: string;
  tag: string;
  keyVersion: number;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}

export interface Tool {
  id: string;
  serverId: string;
  name: string;
  description?: string;
  inputSchema: JSONSchema;
  outputSchema?: JSONSchema;
  enabled: boolean;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface Resource {
  id: string;
  serverId: string;
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  size?: number;
  checksum?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface Prompt {
  id: string;
  serverId: string;
  name: string;
  description?: string;
  template: string;
  arguments?: Record<string, JSONSchema>;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface ServerConfiguration {
  id: string;
  serverId: string;
  environment?: Record<string, string | SecretReference>;
  enabledTools?: string[];
  resourceLimits?: {
    memory?: string;
    cpu?: string;
    disk?: string;
    maxConnections?: number;
    requestTimeout?: number;
  };
  networkConfig?: {
    mode: 'bridge' | 'host' | 'none' | 'overlay';
    ports?: Array<{
      containerPort: number;
      hostPort?: number;
      protocol: 'tcp' | 'udp';
    }>;
    dns?: string[];
  };
  secrets?: SecretReference[];
  healthCheck?: {
    enabled: boolean;
    interval: number;
    timeout: number;
    retries: number;
    startPeriod: number;
  };
  createdAt: string;
  updatedAt: string;
}

// データベース操作用のリクエスト・レスポンス型
export interface CreateSecretRequest {
  name: string;
  description?: string;
  value: string;
  metadata?: Record<string, any>;
  expiresAt?: string;
}

export interface UpdateSecretRequest {
  name?: string;
  description?: string;
  value?: string;
  metadata?: Record<string, any>;
  expiresAt?: string;
}

export interface CreateToolRequest {
  serverId: string;
  name: string;
  description?: string;
  inputSchema: JSONSchema;
  outputSchema?: JSONSchema;
  enabled?: boolean;
  metadata?: Record<string, any>;
}

export interface UpdateToolRequest {
  name?: string;
  description?: string;
  inputSchema?: JSONSchema;
  outputSchema?: JSONSchema;
  enabled?: boolean;
  metadata?: Record<string, any>;
}

export interface CreateResourceRequest {
  serverId: string;
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  size?: number;
  checksum?: string;
  metadata?: Record<string, any>;
}

export interface UpdateResourceRequest {
  uri?: string;
  name?: string;
  description?: string;
  mimeType?: string;
  size?: number;
  checksum?: string;
  metadata?: Record<string, any>;
}

export interface CreatePromptRequest {
  serverId: string;
  name: string;
  description?: string;
  template: string;
  arguments?: Record<string, JSONSchema>;
  metadata?: Record<string, any>;
}

export interface UpdatePromptRequest {
  name?: string;
  description?: string;
  template?: string;
  arguments?: Record<string, JSONSchema>;
  metadata?: Record<string, any>;
}

export interface CreateServerConfigurationRequest {
  serverId: string;
  environment?: Record<string, string | SecretReference>;
  enabledTools?: string[];
  resourceLimits?: {
    memory?: string;
    cpu?: string;
    disk?: string;
    maxConnections?: number;
    requestTimeout?: number;
  };
  networkConfig?: {
    mode: 'bridge' | 'host' | 'none' | 'overlay';
    ports?: Array<{
      containerPort: number;
      hostPort?: number;
      protocol?: 'tcp' | 'udp';
    }>;
    dns?: string[];
  };
  secrets?: SecretReference[];
  healthCheck?: {
    enabled?: boolean;
    interval?: number;
    timeout?: number;
    retries?: number;
    startPeriod?: number;
  };
}

export interface UpdateServerConfigurationRequest {
  environment?: Record<string, string | SecretReference>;
  enabledTools?: string[];
  resourceLimits?: {
    memory?: string;
    cpu?: string;
    disk?: string;
    maxConnections?: number;
    requestTimeout?: number;
  };
  networkConfig?: {
    mode?: 'bridge' | 'host' | 'none' | 'overlay';
    ports?: Array<{
      containerPort: number;
      hostPort?: number;
      protocol?: 'tcp' | 'udp';
    }>;
    dns?: string[];
  };
  secrets?: SecretReference[];
  healthCheck?: {
    enabled?: boolean;
    interval?: number;
    timeout?: number;
    retries?: number;
    startPeriod?: number;
  };
}

// API レスポンス型
export interface ListResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
    timestamp: string;
  };
}

// フィルタリング・ソート用の型
export interface ListOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
}

export interface ServerFilters extends ListOptions {
  status?: 'running' | 'stopped' | 'error';
  image?: string;
}

export interface ToolFilters extends ListOptions {
  serverId?: string;
  enabled?: boolean;
}

export interface ResourceFilters extends ListOptions {
  serverId?: string;
  mimeType?: string;
}

export interface PromptFilters extends ListOptions {
  serverId?: string;
}

export interface SecretFilters extends ListOptions {
  expired?: boolean;
}