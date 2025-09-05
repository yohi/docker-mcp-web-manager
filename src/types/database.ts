/**
 * データベース関連の型定義
 * SQLiteスキーマに対応したTypeScript型
 */

// ============================================================================
// 基本型定義
// ============================================================================

/**
 * データベース共通フィールド
 */
export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
}

/**
 * JSON Schema型定義
 */
export interface JSONSchema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
}

/**
 * リソース制限設定
 */
export interface ResourceLimits {
  memory?: string; // e.g., '512MB', '1GB'
  cpu?: string; // e.g., '0.5', '1.0'
}

/**
 * ネットワーク設定
 */
export interface NetworkConfig {
  mode: 'bridge' | 'host' | 'none' | 'container';
  networks?: string[];
}

/**
 * ボリュームマウント設定
 */
export interface VolumeMount {
  host: string;
  container: string;
  mode: 'rw' | 'ro';
}

/**
 * ポートマッピング設定
 */
export interface PortMapping {
  [containerPort: string]: string; // hostPort
}

// ============================================================================
// User関連型定義
// ============================================================================

/**
 * ユーザーロール
 */
export type UserRole = 'admin' | 'user';

/**
 * 認証プロバイダー
 */
export type AuthProvider = 'credentials' | 'bitwarden';

/**
 * ユーザーエンティティ
 */
export interface User extends BaseEntity {
  email: string;
  name: string;
  password_hash?: string; // NULL for OAuth users
  role: UserRole;
  provider: AuthProvider;
  provider_id?: string;
  avatar_url?: string;
  is_active: boolean;
  last_login_at?: string;
}

/**
 * セッション情報
 */
export interface UserSession extends BaseEntity {
  user_id: string;
  token_hash: string;
  expires_at: string;
  ip_address?: string;
  user_agent?: string;
}

/**
 * ユーザー作成用入力型
 */
export interface CreateUserInput {
  email: string;
  name: string;
  password?: string;
  role?: UserRole;
  provider?: AuthProvider;
  provider_id?: string;
}

/**
 * ユーザー更新用入力型
 */
export interface UpdateUserInput {
  email?: string;
  name?: string;
  password?: string;
  role?: UserRole;
  is_active?: boolean;
  avatar_url?: string;
}

// ============================================================================
// Server関連型定義
// ============================================================================

/**
 * サーバーステータス
 */
export type ServerStatus =
  | 'running'
  | 'stopped'
  | 'starting'
  | 'stopping'
  | 'error'
  | 'unknown';

/**
 * 再起動ポリシー
 */
export type RestartPolicy = 'no' | 'always' | 'unless-stopped' | 'on-failure';

/**
 * MCPサーバーエンティティ
 */
export interface MCPServer extends BaseEntity {
  name: string;
  description?: string;
  image: string;
  tag: string;
  status: ServerStatus;
  port?: number;
  internal_port: number;
  enabled: boolean;
  auto_start: boolean;
  restart_policy: RestartPolicy;
  health_check_endpoint: string;
  health_check_interval: number;
  container_id?: string;
  container_name?: string;
  last_started_at?: string;
  last_stopped_at?: string;
  created_by: string;
}

/**
 * サーバー作成用入力型
 */
export interface CreateServerInput {
  name: string;
  description?: string;
  image: string;
  tag?: string;
  port?: number;
  internal_port?: number;
  enabled?: boolean;
  auto_start?: boolean;
  restart_policy?: RestartPolicy;
  health_check_endpoint?: string;
  health_check_interval?: number;
}

/**
 * サーバー更新用入力型
 */
export interface UpdateServerInput {
  name?: string;
  description?: string;
  image?: string;
  tag?: string;
  port?: number;
  internal_port?: number;
  enabled?: boolean;
  auto_start?: boolean;
  restart_policy?: RestartPolicy;
  health_check_endpoint?: string;
  health_check_interval?: number;
}

/**
 * サーバーサマリー（ビューから取得）
 */
export interface ServerSummary extends MCPServer {
  created_by_name: string;
  tool_count: number;
  resource_count: number;
  prompt_count: number;
}

// ============================================================================
// Configuration関連型定義
// ============================================================================

/**
 * サーバー設定エンティティ
 */
export interface ServerConfiguration extends BaseEntity {
  server_id: string;
  environment_variables: Record<string, string>;
  memory_limit?: string;
  cpu_limit?: string;
  network_mode: NetworkConfig['mode'];
  networks: string[];
  volumes: VolumeMount[];
  ports: PortMapping;
  docker_args: string[];
  command?: string;
  entrypoint?: string;
  working_dir?: string;
  version: number;
}

/**
 * 設定作成用入力型
 */
export interface CreateConfigurationInput {
  server_id: string;
  environment_variables?: Record<string, string>;
  memory_limit?: string;
  cpu_limit?: string;
  network_mode?: NetworkConfig['mode'];
  networks?: string[];
  volumes?: VolumeMount[];
  ports?: PortMapping;
  docker_args?: string[];
  command?: string;
  entrypoint?: string;
  working_dir?: string;
}

/**
 * 設定更新用入力型
 */
export interface UpdateConfigurationInput {
  environment_variables?: Record<string, string>;
  memory_limit?: string;
  cpu_limit?: string;
  network_mode?: NetworkConfig['mode'];
  networks?: string[];
  volumes?: VolumeMount[];
  ports?: PortMapping;
  docker_args?: string[];
  command?: string;
  entrypoint?: string;
  working_dir?: string;
}

// ============================================================================
// Secret関連型定義
// ============================================================================

/**
 * シークレットタイプ
 */
export type SecretType =
  | 'generic'
  | 'api_key'
  | 'password'
  | 'certificate'
  | 'ssh_key';

/**
 * シークレットエンティティ
 */
export interface Secret extends BaseEntity {
  name: string;
  description?: string;
  encrypted_value: string;
  encryption_key_id: string;
  type: SecretType;
  created_by: string;
  last_accessed_at?: string;
  access_count: number;
  expires_at?: string;
}

/**
 * シークレット参照エンティティ
 */
export interface SecretReference extends BaseEntity {
  configuration_id: string;
  secret_id: string;
  environment_variable: string;
  required: boolean;
}

/**
 * シークレット作成用入力型
 */
export interface CreateSecretInput {
  name: string;
  description?: string;
  value: string; // 暗号化前の値
  type?: SecretType;
  expires_at?: string;
}

/**
 * シークレット更新用入力型
 */
export interface UpdateSecretInput {
  name?: string;
  description?: string;
  value?: string; // 暗号化前の値
  type?: SecretType;
  expires_at?: string;
}

// ============================================================================
// Test関連型定義
// ============================================================================

/**
 * テストタイプ
 */
export type TestType =
  | 'connection'
  | 'health_check'
  | 'performance'
  | 'integration'
  | 'custom';

/**
 * テスト実行環境
 */
export type TestExecutionEnvironment =
  | 'manual'
  | 'scheduled'
  | 'trigger'
  | 'ci';

/**
 * テストステータス
 */
export type TestStatus = 'passed' | 'failed' | 'skipped' | 'error';

/**
 * テスト結果エンティティ
 */
export interface TestResult extends BaseEntity {
  server_id: string;
  test_type: TestType;
  test_name: string;
  test_description?: string;
  status: TestStatus;
  score?: number; // 0.0 to 1.0
  duration_ms?: number;
  test_data: Record<string, unknown>;
  result_data: Record<string, unknown>;
  error_message?: string;
  error_stack?: string;
  executed_by?: string;
  execution_environment: TestExecutionEnvironment;
  started_at: string;
  completed_at?: string;
}

/**
 * テスト実行用入力型
 */
export interface CreateTestInput {
  server_id: string;
  test_type: TestType;
  test_name: string;
  test_description?: string;
  test_data?: Record<string, unknown>;
  execution_environment?: TestExecutionEnvironment;
}

/**
 * テスト結果サマリー
 */
export interface TestResultSummary extends TestResult {
  server_name: string;
  executed_by_name?: string;
}

// ============================================================================
// Tool, Resource, Prompt関連型定義
// ============================================================================

/**
 * MCPツールエンティティ
 */
export interface Tool extends BaseEntity {
  server_id: string;
  name: string;
  description?: string;
  version?: string;
  input_schema: JSONSchema;
  output_schema: JSONSchema;
  is_available: boolean;
  last_used_at?: string;
  usage_count: number;
  discovered_at: string;
  last_updated_at: string;
}

/**
 * MCPリソースエンティティ
 */
export interface Resource extends BaseEntity {
  server_id: string;
  uri: string;
  name: string;
  description?: string;
  mime_type?: string;
  schema_data: JSONSchema;
  is_available: boolean;
  last_accessed_at?: string;
  access_count: number;
  discovered_at: string;
  last_updated_at: string;
}

/**
 * MCPプロンプトエンティティ
 */
export interface Prompt extends BaseEntity {
  server_id: string;
  name: string;
  description?: string;
  arguments_schema: JSONSchema;
  template?: string;
  examples: Array<Record<string, unknown>>;
  is_available: boolean;
  last_used_at?: string;
  usage_count: number;
  discovered_at: string;
  last_updated_at: string;
}

// ============================================================================
// Audit Log関連型定義
// ============================================================================

/**
 * 監査ログカテゴリ
 */
export type AuditCategory = 'auth' | 'server' | 'config' | 'secret' | 'test' | 'system';

/**
 * ログレベル
 */
export type LogSeverity = 'debug' | 'info' | 'warn' | 'error' | 'critical';

/**
 * 監査ログエンティティ
 */
export interface AuditLog extends BaseEntity {
  event_type: string;
  event_category: AuditCategory;
  severity: LogSeverity;
  user_id?: string;
  ip_address?: string;
  user_agent?: string;
  resource_type?: string;
  resource_id?: string;
  details: Record<string, unknown>;
  request_id?: string;
  session_id?: string;
}

/**
 * 監査ログ作成用入力型
 */
export interface CreateAuditLogInput {
  event_type: string;
  event_category: AuditCategory;
  severity?: LogSeverity;
  user_id?: string;
  ip_address?: string;
  user_agent?: string;
  resource_type?: string;
  resource_id?: string;
  details?: Record<string, unknown>;
  request_id?: string;
  session_id?: string;
}

// ============================================================================
// System Settings関連型定義
// ============================================================================

/**
 * 設定値タイプ
 */
export type SettingType = 'string' | 'number' | 'boolean' | 'json';

/**
 * システム設定エンティティ
 */
export interface SystemSetting {
  key: string;
  value: string;
  type: SettingType;
  description?: string;
  is_sensitive: boolean;
  category: string;
  updated_by?: string;
  updated_at: string;
}

/**
 * システム設定更新用入力型
 */
export interface UpdateSystemSettingInput {
  value: string;
  type?: SettingType;
  description?: string;
  is_sensitive?: boolean;
  category?: string;
}

// ============================================================================
// データベース操作結果型
// ============================================================================

/**
 * ページネーション情報
 */
export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

/**
 * ページネーション付きの結果
 */
export interface PaginatedResult<T> {
  data: T[];
  pagination: PaginationInfo;
}

/**
 * 検索・フィルター条件
 */
export interface SearchFilter {
  query?: string;
  status?: string[];
  dateFrom?: string;
  dateTo?: string;
  createdBy?: string;
  [key: string]: unknown;
}

/**
 * ソート条件
 */
export interface SortOption {
  field: string;
  direction: 'asc' | 'desc';
}

/**
 * クエリオプション
 */
export interface QueryOptions {
  page?: number;
  limit?: number;
  filter?: SearchFilter;
  sort?: SortOption;
  include?: string[]; // 関連データの取得
}

/**
 * データベース操作結果
 */
export interface DatabaseResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  affected_rows?: number;
}

/**
 * バルクオペレーション結果
 */
export interface BulkOperationResult {
  success: boolean;
  total: number;
  successful: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}

// ============================================================================
// APIレスポンス型
// ============================================================================

/**
 * 標準APIレスポンス
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta?: {
    pagination?: PaginationInfo;
    timestamp: string;
    request_id?: string;
  };
}

/**
 * エラーレスポンス
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  timestamp: string;
}

// ============================================================================
// バリデーション関連型
// ============================================================================

/**
 * バリデーションエラー
 */
export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

/**
 * バリデーション結果
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// ============================================================================
// 型ガード関数
// ============================================================================

/**
 * ユーザーロールの型ガード
 */
export function isUserRole(value: string): value is UserRole {
  return ['admin', 'user'].includes(value);
}

/**
 * サーバーステータスの型ガード
 */
export function isServerStatus(value: string): value is ServerStatus {
  return ['running', 'stopped', 'starting', 'stopping', 'error', 'unknown'].includes(value);
}

/**
 * テストタイプの型ガード
 */
export function isTestType(value: string): value is TestType {
  return ['connection', 'health_check', 'performance', 'integration', 'custom'].includes(value);
}

/**
 * SecretTypeの型ガード
 */
export function isSecretType(value: string): value is SecretType {
  return ['generic', 'api_key', 'password', 'certificate', 'ssh_key'].includes(value);
}