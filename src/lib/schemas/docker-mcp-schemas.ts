import { z } from 'zod';

// Job関連のスキーマ
export const jobResponseSchema = z.object({
  id: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']),
  message: z.string().optional(),
  estimatedDuration: z.number().optional(),
});

export const jobStatusSchema = z.object({
  id: z.string(),
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']),
  type: z.enum(['install', 'start', 'stop', 'test', 'enable', 'disable', 'delete']),
  target: z.object({
    type: z.enum(['server', 'catalog', 'gateway']),
    id: z.string(),
  }),
  progress: z.object({
    current: z.number(),
    total: z.number(),
    message: z.string(),
  }).optional(),
  result: z.any().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
  }).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional(),
});

// Docker MCP CLI出力のスキーマ
export const mcpServerSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string(),
  status: z.enum(['running', 'stopped', 'error']),
  version: z.string().optional(),
  description: z.string().optional(),
  tools: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    inputSchema: z.record(z.any()),
    enabled: z.boolean().default(true),
  })).default([]),
  resources: z.array(z.object({
    uri: z.string(),
    name: z.string(),
    description: z.string().optional(),
    mimeType: z.string().optional(),
    metadata: z.record(z.any()).optional(),
  })).default([]),
  prompts: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    arguments: z.record(z.any()).optional(),
    metadata: z.record(z.any()).optional(),
  })).default([]),
  configuration: z.object({
    environment: z.record(z.string()).optional(),
    enabledTools: z.array(z.string()).optional(),
    resourceLimits: z.object({
      memory: z.string().optional(),
      cpu: z.string().optional(),
      disk: z.string().optional(),
    }).optional(),
    networkConfig: z.object({
      mode: z.enum(['bridge', 'host', 'none', 'overlay']),
      ports: z.array(z.object({
        containerPort: z.number(),
        hostPort: z.number().optional(),
        protocol: z.enum(['tcp', 'udp']).default('tcp'),
      })).optional(),
    }).optional(),
  }).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const dockerMCPListResponseSchema = z.object({
  servers: z.array(mcpServerSchema),
  total: z.number(),
  page: z.number().default(1),
  limit: z.number().default(20),
});

export const dockerMCPErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
    exitCode: z.number().optional(),
    stderr: z.string().optional(),
  }),
});

// テスト実行結果のスキーマ
export const testResultSchema = z.object({
  id: z.string(),
  serverId: z.string(),
  toolName: z.string(),
  input: z.any(),
  output: z.any().optional(),
  success: z.boolean(),
  error: z.string().optional(),
  executionTime: z.number(),
  timestamp: z.string(),
});

// カタログ関連のスキーマ
export const catalogEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  image: z.string(),
  author: z.string(),
  category: z.string(),
  tags: z.array(z.string()).default([]),
  popularity: z.number().default(0),
  lastUpdated: z.string(),
  verified: z.boolean().default(false),
  metadata: z.record(z.any()).optional(),
});

export const catalogResponseSchema = z.object({
  entries: z.array(catalogEntrySchema),
  total: z.number(),
  page: z.number().default(1),
  limit: z.number().default(20),
});

// ログ関連のスキーマ
export const logEntrySchema = z.object({
  timestamp: z.string(),
  level: z.enum(['debug', 'info', 'warn', 'error']),
  message: z.string(),
  source: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export const logsResponseSchema = z.object({
  logs: z.array(logEntrySchema),
  serverId: z.string(),
  totalLines: z.number(),
  hasMore: z.boolean(),
});

// Gateway状態のスキーマ
export const gatewayStatusSchema = z.object({
  status: z.enum(['running', 'stopped', 'error']),
  version: z.string().optional(),
  uptime: z.number().optional(),
  connectedServers: z.number().default(0),
  lastHeartbeat: z.string().optional(),
});

// Docker MCP CLI コマンドの許可リスト
export const allowedDockerMCPCommandsSchema = z.enum([
  'list',
  'start',
  'stop',
  'enable',
  'disable',
  'install',
  'uninstall',
  'logs',
  'test',
  'status',
  'gateway-start',
  'gateway-stop',
  'gateway-status',
  'catalog-list',
  'catalog-search',
  'catalog-install',
]);

// コマンド引数のスキーマ
export const dockerMCPCommandArgsSchema = z.object({
  serverId: z.string().optional(),
  toolName: z.string().optional(),
  input: z.record(z.any()).optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  search: z.string().optional(),
  category: z.string().optional(),
  logs: z.object({
    tail: z.number().min(1).max(10000).default(100),
    since: z.string().optional(),
    follow: z.boolean().default(false),
  }).optional(),
});

// 型エクスポート
export type JobResponse = z.infer<typeof jobResponseSchema>;
export type JobStatus = z.infer<typeof jobStatusSchema>;
export type MCPServer = z.infer<typeof mcpServerSchema>;
export type DockerMCPListResponse = z.infer<typeof dockerMCPListResponseSchema>;
export type DockerMCPError = z.infer<typeof dockerMCPErrorSchema>;
export type TestResult = z.infer<typeof testResultSchema>;
export type CatalogEntry = z.infer<typeof catalogEntrySchema>;
export type CatalogResponse = z.infer<typeof catalogResponseSchema>;
export type LogEntry = z.infer<typeof logEntrySchema>;
export type LogsResponse = z.infer<typeof logsResponseSchema>;
export type GatewayStatus = z.infer<typeof gatewayStatusSchema>;
export type AllowedDockerMCPCommand = z.infer<typeof allowedDockerMCPCommandsSchema>;
export type DockerMCPCommandArgs = z.infer<typeof dockerMCPCommandArgsSchema>;