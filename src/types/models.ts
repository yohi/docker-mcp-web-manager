// =============================================================================
// Core Data Models for Docker MCP Web Manager
// Based on design document specifications
// =============================================================================

// =============================================================================
// JSON Schema Type Definition
// =============================================================================
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

// =============================================================================
// Resource Limits and Network Configuration
// =============================================================================
export interface ResourceLimits {
  memory?: string; // e.g., "512m", "1g"
  cpu?: string; // e.g., "0.5", "1"
  disk?: string; // e.g., "1g", "10g"
  network?: {
    bandwidth?: string; // e.g., "100m", "1g"
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

// =============================================================================
// Tool, Resource, and Prompt Models
// =============================================================================
export interface Tool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  enabled: boolean;
}

export interface Resource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  metadata?: Record<string, any>;
}

export interface Prompt {
  name: string;
  description?: string;
  arguments?: JSONSchema;
  metadata?: Record<string, any>;
}

// =============================================================================
// Secret Management Models
// =============================================================================
export interface SecretReference {
  secretId: string;
  environmentVariable: string;
  required: boolean;
}

export interface Secret {
  id: string;
  name: string;
  type: 'api_key' | 'token' | 'password' | 'certificate';
  bitwardenItemId?: string;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Server Configuration Model
// =============================================================================
export interface ServerConfiguration {
  id: string;
  serverId: string;
  environment: Record<string, string>;
  enabledTools: string[];
  secrets: SecretReference[];
  resourceLimits: ResourceLimits;
  networkConfig: NetworkConfig;
}

// =============================================================================
// MCP Server Model
// =============================================================================
export interface MCPServer {
  id: string;
  name: string;
  image: string;
  status: 'running' | 'stopped' | 'error';
  version: string;
  description: string;
  tools: Tool[];
  resources: Resource[];
  prompts: Prompt[];
  configuration: ServerConfiguration;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Test Result Model
// =============================================================================
export interface TestResult {
  id: string;
  serverId: string;
  toolName: string;
  input: any;
  output: any;
  success: boolean;
  error?: string;
  executionTime: number;
  timestamp: Date;
}

// =============================================================================
// Job Management Models
// =============================================================================
export interface Job {
  id: string;
  type: 'install' | 'start' | 'stop' | 'test' | 'enable' | 'disable' | 'delete';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  target: {
    type: 'server' | 'catalog' | 'gateway';
    id: string;
  };
  progress: {
    current: number;
    total: number;
    message: string;
  };
  result?: any;
  error?: {
    code: string;
    message: string;
    details: any;
  };
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface JobResponse {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  message?: string;
  estimatedDuration?: number;
}

// =============================================================================
// Catalog Models
// =============================================================================
export interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  version: string;
  image: string;
  author: string;
  category: string;
  tags: string[];
  popularity: number;
  lastUpdated: Date;
  verified: boolean;
  metadata: {
    homepage?: string;
    repository?: string;
    documentation?: string;
    license?: string;
  };
}

export interface CatalogServerInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  image: string;
  author: string;
  category: string;
  tags: string[];
  supportedConfigurations: {
    environment: Record<string, { type: string; required: boolean; description: string }>;
    availableTools: string[];
    resourceOptions: {
      minMemory: number;
      maxMemory: number;
      minCpu: number;
      maxCpu: number;
    };
    networkRequirements: {
      ports: Array<{ port: number; protocol: string; description: string }>;
      outboundConnections: string[];
    };
  };
  installMetadata: {
    installationTime: number; // estimated seconds
    diskSpace: number; // MB required
    dependencies: string[];
    preInstallChecks: string[];
    postInstallValidation: string[];
  };
  documentation: {
    readme: string;
    quickStart: string;
    examples: Array<{ name: string; description: string; configuration: ServerConfiguration }>;
  };
  verified: boolean;
  popularity: number;
  lastUpdated: Date;
  metadata: Record<string, any>;
}

// =============================================================================
// Database Row Types (from Drizzle schema)
// =============================================================================
export type ServerRow = {
  id: string;
  name: string;
  image: string;
  status: 'running' | 'stopped' | 'error';
  version?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ConfigurationRow = {
  id: string;
  serverId: string;
  environment?: string; // JSON string
  enabledTools?: string; // JSON string
  resourceLimits?: string; // JSON string
  networkConfig?: string; // JSON string
  nodeEnv?: string;
  enabledToolsCount?: number;
  memoryLimit?: string;
  representativePort?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type SecretRow = {
  id: string;
  name: string;
  type: 'api_key' | 'token' | 'password' | 'certificate';
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
  alg: 'AES-256-GCM' | 'ChaCha20-Poly1305';
  keyId: string;
  bitwardenItemId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type SecretReferenceRow = {
  id: string;
  configurationId: string;
  secretId: string;
  environmentVariable: string;
  required: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type ToolRow = {
  id: string;
  serverId: string;
  name: string;
  description?: string;
  inputSchema: string; // JSON string
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type ResourceRow = {
  id: string;
  serverId: string;
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  metadata?: string; // JSON string
  createdAt?: string;
  updatedAt?: string;
};

export type PromptRow = {
  id: string;
  serverId: string;
  name: string;
  description?: string;
  arguments?: string; // JSON string
  metadata?: string; // JSON string
  createdAt?: string;
  updatedAt?: string;
};

export type TestResultRow = {
  id: string;
  serverId: string;
  toolName: string;
  input?: string; // JSON string
  output?: string; // JSON string
  success: boolean;
  error?: string;
  executionTime?: number;
  timestamp?: string;
};

export type JobRow = {
  id: string;
  type: 'install' | 'start' | 'stop' | 'test' | 'enable' | 'disable' | 'delete';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  targetType: 'server' | 'catalog' | 'gateway';
  targetId: string;
  progressCurrent: number;
  progressTotal: number;
  progressMessage?: string;
  result?: string; // JSON string
  errorCode?: string;
  errorMessage?: string;
  errorDetails?: string; // JSON string
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
};

export type BitwardenItemRow = {
  id: string;
  itemId: string;
  name: string;
  type: 'login' | 'secure_note' | 'card' | 'identity';
  folderId?: string;
  organizationId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type IdempotencyKeyRow = {
  key: string;
  scope: string;
  requestHash: string;
  jobId: string;
  createdAt?: string;
  expiresAt: string;
};

// =============================================================================
// Utility Types for API Responses
// =============================================================================
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
    requestId: string;
    timestamp: string;
  };
}

// =============================================================================
// Export all types
// =============================================================================
export type {
  JSONSchema,
  ResourceLimits,
  NetworkConfig,
  Tool,
  Resource,
  Prompt,
  SecretReference,
  Secret,
  ServerConfiguration,
  MCPServer,
  TestResult,
  Job,
  JobResponse,
  CatalogEntry,
  CatalogServerInfo,
};