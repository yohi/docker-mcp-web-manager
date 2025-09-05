/**
 * Model Context Protocol (MCP) 関連の型定義
 * MCP仕様に基づいた型定義
 */

// ============================================================================
// MCP Core Types
// ============================================================================

/**
 * MCP Protocol Version
 */
export type MCPVersion = '2024-11-05' | string;

/**
 * JSON-RPC 2.0 Request
 */
export interface MCPRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: Record<string, unknown> | unknown[];
}

/**
 * JSON-RPC 2.0 Response
 */
export interface MCPResponse {
  jsonrpc: '2.0';
  id?: string | number;
  result?: unknown;
  error?: MCPError;
}

/**
 * JSON-RPC 2.0 Error
 */
export interface MCPError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * MCP Error Codes
 */
export enum MCPErrorCode {
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,
  ServerError = -32000, // -32000 to -32099
}

// ============================================================================
// MCP Initialization
// ============================================================================

/**
 * Client Information
 */
export interface MCPClientInfo {
  name: string;
  version: string;
  description?: string;
}

/**
 * Server Information
 */
export interface MCPServerInfo {
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  license?: string;
}

/**
 * Client Capabilities
 */
export interface MCPClientCapabilities {
  experimental?: Record<string, unknown>;
  sampling?: Record<string, unknown>;
}

/**
 * Server Capabilities
 */
export interface MCPServerCapabilities {
  experimental?: Record<string, unknown>;
  logging?: Record<string, unknown>;
  prompts?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  tools?: {
    listChanged?: boolean;
  };
}

/**
 * Initialize Request
 */
export interface MCPInitializeRequest extends MCPRequest {
  method: 'initialize';
  params: {
    protocolVersion: MCPVersion;
    capabilities: MCPClientCapabilities;
    clientInfo: MCPClientInfo;
  };
}

/**
 * Initialize Response
 */
export interface MCPInitializeResponse extends MCPResponse {
  result: {
    protocolVersion: MCPVersion;
    capabilities: MCPServerCapabilities;
    serverInfo: MCPServerInfo;
    instructions?: string;
  };
}

// ============================================================================
// MCP Tools
// ============================================================================

/**
 * Tool Definition
 */
export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: MCPToolInputSchema;
}

/**
 * Tool Input Schema (JSON Schema)
 */
export interface MCPToolInputSchema {
  type: 'object';
  properties?: Record<string, MCPSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

/**
 * Schema Property Definition
 */
export interface MCPSchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: MCPSchemaProperty;
  properties?: Record<string, MCPSchemaProperty>;
  required?: string[];
  default?: unknown;
  examples?: unknown[];
}

/**
 * List Tools Request
 */
export interface MCPListToolsRequest extends MCPRequest {
  method: 'tools/list';
  params?: {
    cursor?: string;
  };
}

/**
 * List Tools Response
 */
export interface MCPListToolsResponse extends MCPResponse {
  result: {
    tools: MCPTool[];
    nextCursor?: string;
  };
}

/**
 * Call Tool Request
 */
export interface MCPCallToolRequest extends MCPRequest {
  method: 'tools/call';
  params: {
    name: string;
    arguments?: Record<string, unknown>;
  };
}

/**
 * Tool Result
 */
export interface MCPToolResult {
  content: MCPToolContent[];
  isError?: boolean;
}

/**
 * Tool Content
 */
export type MCPToolContent = MCPTextContent | MCPImageContent | MCPEmbeddedResourceContent;

/**
 * Text Content
 */
export interface MCPTextContent {
  type: 'text';
  text: string;
}

/**
 * Image Content
 */
export interface MCPImageContent {
  type: 'image';
  data: string; // base64 encoded
  mimeType: string;
}

/**
 * Embedded Resource Content
 */
export interface MCPEmbeddedResourceContent {
  type: 'resource';
  resource: MCPEmbeddedResource;
}

/**
 * Embedded Resource
 */
export interface MCPEmbeddedResource {
  type: 'text' | 'blob';
  uri: string;
  text?: string; // for text resources
  blob?: string; // base64 for blob resources
  mimeType?: string;
}

/**
 * Call Tool Response
 */
export interface MCPCallToolResponse extends MCPResponse {
  result: MCPToolResult;
}

// ============================================================================
// MCP Resources
// ============================================================================

/**
 * Resource Definition
 */
export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

/**
 * List Resources Request
 */
export interface MCPListResourcesRequest extends MCPRequest {
  method: 'resources/list';
  params?: {
    cursor?: string;
  };
}

/**
 * List Resources Response
 */
export interface MCPListResourcesResponse extends MCPResponse {
  result: {
    resources: MCPResource[];
    nextCursor?: string;
  };
}

/**
 * Read Resource Request
 */
export interface MCPReadResourceRequest extends MCPRequest {
  method: 'resources/read';
  params: {
    uri: string;
  };
}

/**
 * Resource Contents
 */
export interface MCPResourceContents {
  contents: MCPResourceContent[];
}

/**
 * Resource Content
 */
export type MCPResourceContent = MCPTextResourceContent | MCPBlobResourceContent;

/**
 * Text Resource Content
 */
export interface MCPTextResourceContent {
  type: 'text';
  uri: string;
  text: string;
  mimeType?: string;
}

/**
 * Blob Resource Content
 */
export interface MCPBlobResourceContent {
  type: 'blob';
  uri: string;
  blob: string; // base64 encoded
  mimeType?: string;
}

/**
 * Read Resource Response
 */
export interface MCPReadResourceResponse extends MCPResponse {
  result: MCPResourceContents;
}

// ============================================================================
// MCP Prompts
// ============================================================================

/**
 * Prompt Definition
 */
export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: MCPPromptArgument[];
}

/**
 * Prompt Argument
 */
export interface MCPPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

/**
 * List Prompts Request
 */
export interface MCPListPromptsRequest extends MCPRequest {
  method: 'prompts/list';
  params?: {
    cursor?: string;
  };
}

/**
 * List Prompts Response
 */
export interface MCPListPromptsResponse extends MCPResponse {
  result: {
    prompts: MCPPrompt[];
    nextCursor?: string;
  };
}

/**
 * Get Prompt Request
 */
export interface MCPGetPromptRequest extends MCPRequest {
  method: 'prompts/get';
  params: {
    name: string;
    arguments?: Record<string, string>;
  };
}

/**
 * Prompt Message
 */
export interface MCPPromptMessage {
  role: 'user' | 'assistant';
  content: MCPPromptContent;
}

/**
 * Prompt Content
 */
export type MCPPromptContent = MCPTextContent | MCPImageContent | MCPEmbeddedResourceContent;

/**
 * Get Prompt Response
 */
export interface MCPGetPromptResponse extends MCPResponse {
  result: {
    description?: string;
    messages: MCPPromptMessage[];
  };
}

// ============================================================================
// MCP Logging
// ============================================================================

/**
 * Log Level
 */
export type MCPLogLevel = 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency';

/**
 * Set Logging Level Request
 */
export interface MCPSetLoggingLevelRequest extends MCPRequest {
  method: 'logging/setLevel';
  params: {
    level: MCPLogLevel;
  };
}

/**
 * Log Message Notification
 */
export interface MCPLogMessageNotification extends MCPRequest {
  method: 'notifications/message';
  params: {
    level: MCPLogLevel;
    message: string;
    data?: unknown;
  };
}

// ============================================================================
// MCP Notifications
// ============================================================================

/**
 * Progress Notification
 */
export interface MCPProgressNotification extends MCPRequest {
  method: 'notifications/progress';
  params: {
    progressToken: string | number;
    progress: number;
    total?: number;
  };
}

/**
 * Resources Updated Notification
 */
export interface MCPResourcesUpdatedNotification extends MCPRequest {
  method: 'notifications/resources/updated';
  params?: {
    uri?: string;
  };
}

/**
 * Prompts Updated Notification
 */
export interface MCPPromptsUpdatedNotification extends MCPRequest {
  method: 'notifications/prompts/updated';
}

/**
 * Tools Updated Notification
 */
export interface MCPToolsUpdatedNotification extends MCPRequest {
  method: 'notifications/tools/updated';
}

// ============================================================================
// MCP Connection and Transport
// ============================================================================

/**
 * Connection State
 */
export type MCPConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Transport Type
 */
export type MCPTransportType = 'http' | 'websocket' | 'stdio' | 'sse';

/**
 * Connection Configuration
 */
export interface MCPConnectionConfig {
  type: MCPTransportType;
  endpoint: string;
  timeout?: number;
  retries?: number;
  headers?: Record<string, string>;
  auth?: {
    type: 'bearer' | 'basic';
    token?: string;
    username?: string;
    password?: string;
  };
}

/**
 * Connection Status
 */
export interface MCPConnectionStatus {
  state: MCPConnectionState;
  endpoint: string;
  connected_at?: string;
  last_error?: string;
  capabilities?: MCPServerCapabilities;
  server_info?: MCPServerInfo;
}

// ============================================================================
// MCP Client Interface
// ============================================================================

/**
 * MCP Client Interface
 */
export interface MCPClient {
  // Connection Management
  connect(config: MCPConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): MCPConnectionStatus;

  // Initialization
  initialize(clientInfo: MCPClientInfo, capabilities: MCPClientCapabilities): Promise<MCPInitializeResponse>;

  // Tools
  listTools(): Promise<MCPTool[]>;
  callTool(name: string, args?: Record<string, unknown>): Promise<MCPToolResult>;

  // Resources
  listResources(): Promise<MCPResource[]>;
  readResource(uri: string): Promise<MCPResourceContents>;

  // Prompts
  listPrompts(): Promise<MCPPrompt[]>;
  getPrompt(name: string, args?: Record<string, string>): Promise<MCPPromptMessage[]>;

  // Logging
  setLoggingLevel(level: MCPLogLevel): Promise<void>;

  // Event Listeners
  on(event: 'connected' | 'disconnected' | 'error' | 'message', listener: (data?: unknown) => void): void;
  off(event: string, listener: (data?: unknown) => void): void;
}

// ============================================================================
// MCP Server Statistics
// ============================================================================

/**
 * Server Statistics
 */
export interface MCPServerStats {
  server_id: string;
  uptime: number;
  requests_total: number;
  requests_successful: number;
  requests_failed: number;
  tools_available: number;
  tools_called: number;
  resources_available: number;
  resources_accessed: number;
  prompts_available: number;
  prompts_used: number;
  last_activity: string;
  memory_usage?: number;
  cpu_usage?: number;
}

// ============================================================================
// MCP Health Check
// ============================================================================

/**
 * Health Check Result
 */
export interface MCPHealthCheck {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  response_time: number;
  version?: string;
  capabilities?: string[];
  errors?: string[];
  details?: Record<string, unknown>;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * MCP Request Type Guard
 */
export function isMCPRequest(obj: unknown): obj is MCPRequest {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'jsonrpc' in obj &&
    (obj as MCPRequest).jsonrpc === '2.0' &&
    'method' in obj &&
    typeof (obj as MCPRequest).method === 'string'
  );
}

/**
 * MCP Response Type Guard
 */
export function isMCPResponse(obj: unknown): obj is MCPResponse {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'jsonrpc' in obj &&
    (obj as MCPResponse).jsonrpc === '2.0' &&
    ('result' in obj || 'error' in obj)
  );
}

/**
 * MCP Error Type Guard
 */
export function isMCPError(obj: unknown): obj is MCPError {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'code' in obj &&
    typeof (obj as MCPError).code === 'number' &&
    'message' in obj &&
    typeof (obj as MCPError).message === 'string'
  );
}