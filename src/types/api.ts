/**
 * API関連の型定義
 * REST API、WebSocket、SSE等のAPI型定義
 */

// ============================================================================
// HTTP関連型
// ============================================================================

/**
 * HTTP Methods
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/**
 * HTTP Status Codes
 */
export enum HttpStatusCode {
  // Success
  OK = 200,
  Created = 201,
  Accepted = 202,
  NoContent = 204,

  // Client Error
  BadRequest = 400,
  Unauthorized = 401,
  Forbidden = 403,
  NotFound = 404,
  MethodNotAllowed = 405,
  NotAcceptable = 406,
  Conflict = 409,
  UnprocessableEntity = 422,
  TooManyRequests = 429,

  // Server Error
  InternalServerError = 500,
  NotImplemented = 501,
  BadGateway = 502,
  ServiceUnavailable = 503,
  GatewayTimeout = 504,
}

/**
 * Content Types
 */
export type ContentType = 
  | 'application/json'
  | 'application/xml'
  | 'application/x-www-form-urlencoded'
  | 'multipart/form-data'
  | 'text/plain'
  | 'text/html'
  | 'text/csv'
  | 'application/octet-stream';

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * API Request Headers
 */
export interface ApiRequestHeaders {
  'Content-Type'?: ContentType;
  'Authorization'?: string;
  'X-Request-ID'?: string;
  'X-Client-Version'?: string;
  'User-Agent'?: string;
  [key: string]: string | undefined;
}

/**
 * API Response Headers
 */
export interface ApiResponseHeaders {
  'Content-Type': ContentType;
  'X-Request-ID': string;
  'X-Response-Time': string;
  'Cache-Control'?: string;
  'ETag'?: string;
  'Last-Modified'?: string;
  [key: string]: string | undefined;
}

/**
 * Pagination Parameters
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
  cursor?: string;
}

/**
 * Sort Parameters
 */
export interface SortParams {
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

/**
 * Filter Parameters
 */
export interface FilterParams {
  search?: string;
  status?: string | string[];
  created_after?: string;
  created_before?: string;
  updated_after?: string;
  updated_before?: string;
  [key: string]: unknown;
}

/**
 * Query Parameters
 */
export interface QueryParams extends PaginationParams, SortParams, FilterParams {
  include?: string | string[];
  fields?: string | string[];
}

// ============================================================================
// Generic API Response Types
// ============================================================================

/**
 * Success Response
 */
export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta?: ResponseMeta;
}

/**
 * Error Response
 */
export interface ErrorResponse {
  success: false;
  error: ApiError;
  meta?: ResponseMeta;
}

/**
 * API Response Union Type
 */
export type ApiResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;

/**
 * Response Metadata
 */
export interface ResponseMeta {
  timestamp: string;
  request_id: string;
  version: string;
  pagination?: PaginationMeta;
  rate_limit?: RateLimitMeta;
}

/**
 * Pagination Metadata
 */
export interface PaginationMeta {
  current_page: number;
  per_page: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
  next_cursor?: string;
  previous_cursor?: string;
}

/**
 * Rate Limit Metadata
 */
export interface RateLimitMeta {
  limit: number;
  remaining: number;
  reset: number;
  retry_after?: number;
}

// ============================================================================
// API Error Types
// ============================================================================

/**
 * API Error
 */
export interface ApiError {
  code: string;
  message: string;
  details?: ErrorDetails;
  stack?: string; // Only in development
}

/**
 * Error Details
 */
export interface ErrorDetails {
  field?: string;
  value?: unknown;
  constraint?: string;
  resource?: string;
  resource_id?: string;
  validation_errors?: ValidationError[];
  [key: string]: unknown;
}

/**
 * Validation Error
 */
export interface ValidationError {
  field: string;
  code: string;
  message: string;
  value?: unknown;
}

/**
 * Common Error Codes
 */
export enum ApiErrorCode {
  // Authentication & Authorization
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  UNAUTHORIZED = 'UNAUTHORIZED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',

  // Validation
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_FORMAT = 'INVALID_FORMAT',

  // Resource Management
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_CONFLICT = 'RESOURCE_CONFLICT',
  RESOURCE_LOCKED = 'RESOURCE_LOCKED',
  RESOURCE_EXPIRED = 'RESOURCE_EXPIRED',

  // Rate Limiting
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',

  // Server Errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  TIMEOUT = 'TIMEOUT',
  DATABASE_ERROR = 'DATABASE_ERROR',

  // Docker/MCP Specific
  DOCKER_ERROR = 'DOCKER_ERROR',
  MCP_CONNECTION_ERROR = 'MCP_CONNECTION_ERROR',
  CONTAINER_NOT_FOUND = 'CONTAINER_NOT_FOUND',
  CONTAINER_ALREADY_RUNNING = 'CONTAINER_ALREADY_RUNNING',
  CONTAINER_FAILED_TO_START = 'CONTAINER_FAILED_TO_START',
}

// ============================================================================
// WebSocket Types
// ============================================================================

/**
 * WebSocket Message Type
 */
export type WebSocketMessageType = 
  | 'server_status_update'
  | 'server_logs'
  | 'test_result'
  | 'metrics_update'
  | 'notification'
  | 'error';

/**
 * WebSocket Message
 */
export interface WebSocketMessage<T = unknown> {
  type: WebSocketMessageType;
  data: T;
  timestamp: string;
  request_id?: string;
}

/**
 * Server Status Update Message
 */
export interface ServerStatusUpdateMessage {
  server_id: string;
  status: string;
  previous_status?: string;
  container_id?: string;
  timestamp: string;
}

/**
 * Server Logs Message
 */
export interface ServerLogsMessage {
  server_id: string;
  logs: LogEntry[];
  timestamp: string;
}

/**
 * Log Entry
 */
export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  source: 'stdout' | 'stderr' | 'system';
}

/**
 * Metrics Update Message
 */
export interface MetricsUpdateMessage {
  server_id: string;
  metrics: ServerMetrics;
  timestamp: string;
}

/**
 * Server Metrics
 */
export interface ServerMetrics {
  cpu_usage: number;
  memory_usage: number;
  memory_limit: number;
  network_rx: number;
  network_tx: number;
  disk_read: number;
  disk_write: number;
}

/**
 * Notification Message
 */
export interface NotificationMessage {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  actions?: NotificationAction[];
  auto_dismiss?: boolean;
  dismiss_after?: number;
}

/**
 * Notification Action
 */
export interface NotificationAction {
  label: string;
  action: string;
  variant?: 'primary' | 'secondary' | 'danger';
}

// ============================================================================
// Server-Sent Events (SSE) Types
// ============================================================================

/**
 * SSE Event Type
 */
export type SSEEventType = 'message' | 'heartbeat' | 'error' | 'close';

/**
 * SSE Event
 */
export interface SSEEvent {
  type: SSEEventType;
  data: string;
  id?: string;
  retry?: number;
}

/**
 * SSE Connection Options
 */
export interface SSEConnectionOptions {
  url: string;
  headers?: Record<string, string>;
  withCredentials?: boolean;
  retry_delay?: number;
  max_retries?: number;
}

// ============================================================================
// File Upload Types
// ============================================================================

/**
 * File Upload Response
 */
export interface FileUploadResponse {
  file_id: string;
  filename: string;
  size: number;
  mime_type: string;
  url: string;
  expires_at?: string;
}

/**
 * File Upload Options
 */
export interface FileUploadOptions {
  max_size?: number;
  allowed_types?: string[];
  upload_path?: string;
  public?: boolean;
  expires_in?: number;
}

/**
 * File Upload Progress
 */
export interface FileUploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Batch Request
 */
export interface BatchRequest<T = unknown> {
  operations: BatchOperation<T>[];
  atomic?: boolean; // All operations succeed or all fail
}

/**
 * Batch Operation
 */
export interface BatchOperation<T = unknown> {
  id: string;
  method: HttpMethod;
  path: string;
  body?: T;
  headers?: Record<string, string>;
}

/**
 * Batch Response
 */
export interface BatchResponse {
  results: BatchOperationResult[];
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

/**
 * Batch Operation Result
 */
export interface BatchOperationResult {
  id: string;
  status: number;
  success: boolean;
  data?: unknown;
  error?: ApiError;
}

// ============================================================================
// Health Check Types
// ============================================================================

/**
 * Health Check Response
 */
export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  uptime: number;
  services: ServiceHealthStatus[];
  details?: Record<string, unknown>;
}

/**
 * Service Health Status
 */
export interface ServiceHealthStatus {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  response_time?: number;
  error?: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// API Client Interface
// ============================================================================

/**
 * API Client Configuration
 */
export interface ApiClientConfig {
  base_url: string;
  timeout?: number;
  retries?: number;
  headers?: Record<string, string>;
  auth?: {
    type: 'bearer' | 'basic' | 'api_key';
    token?: string;
    username?: string;
    password?: string;
    api_key?: string;
  };
}

/**
 * API Client Interface
 */
export interface ApiClient {
  // HTTP Methods
  get<T = unknown>(path: string, params?: QueryParams): Promise<ApiResponse<T>>;
  post<T = unknown, D = unknown>(path: string, data?: D): Promise<ApiResponse<T>>;
  put<T = unknown, D = unknown>(path: string, data?: D): Promise<ApiResponse<T>>;
  patch<T = unknown, D = unknown>(path: string, data?: D): Promise<ApiResponse<T>>;
  delete<T = unknown>(path: string): Promise<ApiResponse<T>>;

  // File Operations
  upload(path: string, file: File, options?: FileUploadOptions): Promise<FileUploadResponse>;
  download(path: string): Promise<Blob>;

  // Batch Operations
  batch<T = unknown>(operations: BatchRequest<T>): Promise<BatchResponse>;

  // WebSocket
  connectWebSocket(path: string): WebSocket;

  // SSE
  connectSSE(path: string, options?: Partial<SSEConnectionOptions>): EventSource;

  // Configuration
  setAuthToken(token: string): void;
  setBaseUrl(url: string): void;
  setTimeout(timeout: number): void;
}

// ============================================================================
// Type Guards and Utilities
// ============================================================================

/**
 * Success Response Type Guard
 */
export function isSuccessResponse<T>(response: ApiResponse<T>): response is SuccessResponse<T> {
  return response.success === true;
}

/**
 * Error Response Type Guard
 */
export function isErrorResponse(response: ApiResponse): response is ErrorResponse {
  return response.success === false;
}

/**
 * HTTP Status Code Type Guard
 */
export function isSuccessStatusCode(status: number): boolean {
  return status >= 200 && status < 300;
}

/**
 * Client Error Status Code Type Guard
 */
export function isClientErrorStatusCode(status: number): boolean {
  return status >= 400 && status < 500;
}

/**
 * Server Error Status Code Type Guard
 */
export function isServerErrorStatusCode(status: number): boolean {
  return status >= 500 && status < 600;
}