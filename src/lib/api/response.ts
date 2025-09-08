import { NextResponse } from 'next/server';
import { z } from 'zod';

// =============================================================================
// API レスポンス処理ユーティリティ
// 統一されたAPIレスポンス形式とエラーハンドリング
// =============================================================================

/**
 * 統一されたAPIレスポンス形式
 */
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
    requestId: string;
    timestamp: string;
  };
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  meta?: {
    version: string;
    requestId: string;
    timestamp: string;
    duration?: number;
  };
}

/**
 * ページネーション設定
 */
export interface PaginationConfig {
  page: number;
  limit: number;
  total: number;
}

/**
 * エラーコード定数
 */
export const ERROR_CODES = {
  // 汎用エラー
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

  // サーバー管理
  SERVER_001: 'SERVER_NOT_FOUND',
  SERVER_002: 'SERVER_ALREADY_EXISTS',
  SERVER_003: 'SERVER_START_FAILED',
  SERVER_004: 'SERVER_STOP_FAILED',
  SERVER_005: 'SERVER_INVALID_STATE',
  SERVER_006: 'SERVER_CONFIG_INVALID',

  // カタログ
  CATALOG_001: 'CATALOG_SEARCH_FAILED',
  CATALOG_002: 'CATALOG_OPERATION_FAILED', 
  CATALOG_003: 'CATALOG_SERVER_NOT_FOUND',
  CATALOG_004: 'CATALOG_SERVER_DETAILS_FAILED',
  CATALOG_005: 'CATALOG_INSTALL_FAILED',
  CATALOG_006: 'CATALOG_INSTALL_ID_MISSING',
  CATALOG_007: 'CATALOG_INSTALLATION_NOT_FOUND',
  CATALOG_008: 'CATALOG_INSTALL_PROGRESS_FAILED',
  CATALOG_009: 'CATALOG_CATEGORIES_FAILED',

  // テスト・ツール
  TEST_001: 'TOOL_NOT_FOUND',
  TEST_002: 'TOOL_EXECUTION_FAILED',
  TEST_003: 'TOOL_TIMEOUT',
  TEST_004: 'TOOL_DISABLED',

  // ログ
  LOG_001: 'LOG_FILE_NOT_FOUND',
  LOG_002: 'LOG_ACCESS_DENIED',
  LOG_003: 'LOG_FILE_TOO_LARGE',
  LOG_004: 'LOG_STREAMING_ERROR',

  // 設定管理
  CONFIG_001: 'CONFIG_INVALID_FORMAT',
  CONFIG_002: 'CONFIG_EXPORT_FAILED',
  CONFIG_003: 'CONFIG_IMPORT_FAILED',
  CONFIG_004: 'CONFIG_BACKUP_FAILED',

  // シークレット管理
  SECRET_001: 'SECRET_NOT_FOUND',
  SECRET_002: 'SECRET_ENCRYPTION_FAILED',
  SECRET_003: 'SECRET_DECRYPTION_FAILED',
  SECRET_004: 'SECRET_BITWARDEN_ERROR',

  // ジョブ管理
  JOB_001: 'JOB_OPERATION_FAILED',
  JOB_002: 'JOB_NOT_FOUND',
  JOB_003: 'JOB_CANCEL_FAILED',
  JOB_004: 'JOB_NOT_FOUND_IN_EXECUTION',
  JOB_005: 'JOB_NOT_CANCELLABLE',
} as const;

/**
 * HTTPステータスコードマッピング
 */
const STATUS_CODE_MAP: Record<string, number> = {
  [ERROR_CODES.VALIDATION_ERROR]: 400,
  [ERROR_CODES.UNAUTHORIZED]: 401,
  [ERROR_CODES.FORBIDDEN]: 403,
  [ERROR_CODES.NOT_FOUND]: 404,
  [ERROR_CODES.CONFLICT]: 409,
  [ERROR_CODES.RATE_LIMIT_EXCEEDED]: 429,
  [ERROR_CODES.INTERNAL_ERROR]: 500,
  [ERROR_CODES.SERVICE_UNAVAILABLE]: 503,

  // サーバー管理エラー
  [ERROR_CODES.SERVER_001]: 404,
  [ERROR_CODES.SERVER_002]: 409,
  [ERROR_CODES.SERVER_003]: 500,
  [ERROR_CODES.SERVER_004]: 500,
  [ERROR_CODES.SERVER_005]: 400,
  [ERROR_CODES.SERVER_006]: 400,

  // カタログエラー
  [ERROR_CODES.CATALOG_001]: 503,
  [ERROR_CODES.CATALOG_002]: 500,
  [ERROR_CODES.CATALOG_003]: 404,
  [ERROR_CODES.CATALOG_004]: 500,
  [ERROR_CODES.CATALOG_005]: 500,
  [ERROR_CODES.CATALOG_006]: 500,
  [ERROR_CODES.CATALOG_007]: 404,
  [ERROR_CODES.CATALOG_008]: 500,
  [ERROR_CODES.CATALOG_009]: 500,

  // テスト・ツールエラー
  [ERROR_CODES.TEST_001]: 404,
  [ERROR_CODES.TEST_002]: 500,
  [ERROR_CODES.TEST_003]: 408,
  [ERROR_CODES.TEST_004]: 400,

  // ログエラー
  [ERROR_CODES.LOG_001]: 404,
  [ERROR_CODES.LOG_002]: 403,
  [ERROR_CODES.LOG_003]: 413,
  [ERROR_CODES.LOG_004]: 500,

  // 設定管理エラー
  [ERROR_CODES.CONFIG_001]: 400,
  [ERROR_CODES.CONFIG_002]: 500,
  [ERROR_CODES.CONFIG_003]: 500,
  [ERROR_CODES.CONFIG_004]: 500,

  // シークレット管理エラー
  [ERROR_CODES.SECRET_001]: 404,
  [ERROR_CODES.SECRET_002]: 500,
  [ERROR_CODES.SECRET_003]: 500,
  [ERROR_CODES.SECRET_004]: 502,

  // ジョブ管理エラー
  [ERROR_CODES.JOB_001]: 500,
  [ERROR_CODES.JOB_002]: 404,
  [ERROR_CODES.JOB_003]: 400,
  [ERROR_CODES.JOB_004]: 404,
  [ERROR_CODES.JOB_005]: 409,
};

/**
 * リクエストID生成
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * 成功レスポンスの生成
 */
export function createSuccessResponse<T>(
  data: T,
  options?: {
    pagination?: PaginationConfig;
    requestId?: string;
    duration?: number;
  }
): NextResponse<APIResponse<T>> {
  const requestId = options?.requestId || generateRequestId();
  const timestamp = new Date().toISOString();

  const response: APIResponse<T> = {
    success: true,
    data,
    meta: {
      version: 'v1',
      requestId,
      timestamp,
      duration: options?.duration,
    },
  };

  // ページネーション情報の追加
  if (options?.pagination) {
    const { page, limit, total } = options.pagination;
    const totalPages = Math.ceil(total / limit);

    response.pagination = {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  return NextResponse.json(response, { status: 200 });
}

/**
 * エラーレスポンスの生成
 */
export function createErrorResponse(
  errorCode: string,
  message?: string,
  options?: {
    details?: any;
    requestId?: string;
    statusCode?: number;
  }
): NextResponse<APIResponse<null>> {
  const requestId = options?.requestId || generateRequestId();
  const timestamp = new Date().toISOString();
  const statusCode = options?.statusCode || STATUS_CODE_MAP[errorCode] || 500;

  const response: APIResponse<null> = {
    success: false,
    error: {
      code: errorCode,
      message: message || getDefaultErrorMessage(errorCode),
      details: options?.details,
      requestId,
      timestamp,
    },
  };

  return NextResponse.json(response, { status: statusCode });
}

/**
 * バリデーションエラーレスポンスの生成
 */
export function createValidationErrorResponse(
  validationError: z.ZodError,
  requestId?: string
): NextResponse<APIResponse<null>> {
  const issues = validationError.issues.map(issue => ({
    field: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));

  return createErrorResponse(
    ERROR_CODES.VALIDATION_ERROR,
    'Request validation failed',
    {
      details: { issues },
      requestId,
      statusCode: 400,
    }
  );
}

/**
 * デフォルトエラーメッセージの取得
 */
function getDefaultErrorMessage(errorCode: string): string {
  const messages: Record<string, string> = {
    [ERROR_CODES.VALIDATION_ERROR]: 'Request validation failed',
    [ERROR_CODES.UNAUTHORIZED]: 'Authentication required',
    [ERROR_CODES.FORBIDDEN]: 'Insufficient permissions',
    [ERROR_CODES.NOT_FOUND]: 'Resource not found',
    [ERROR_CODES.CONFLICT]: 'Resource conflict',
    [ERROR_CODES.RATE_LIMIT_EXCEEDED]: 'Rate limit exceeded',
    [ERROR_CODES.INTERNAL_ERROR]: 'Internal server error',
    [ERROR_CODES.SERVICE_UNAVAILABLE]: 'Service temporarily unavailable',

    // サーバー管理
    [ERROR_CODES.SERVER_001]: 'Server not found',
    [ERROR_CODES.SERVER_002]: 'Server already exists',
    [ERROR_CODES.SERVER_003]: 'Failed to start server',
    [ERROR_CODES.SERVER_004]: 'Failed to stop server',
    [ERROR_CODES.SERVER_005]: 'Server in invalid state',
    [ERROR_CODES.SERVER_006]: 'Server configuration is invalid',

    // カタログ
    [ERROR_CODES.CATALOG_001]: 'Catalog search failed',
    [ERROR_CODES.CATALOG_002]: 'Catalog operation failed',
    [ERROR_CODES.CATALOG_003]: 'Server not found in catalog',
    [ERROR_CODES.CATALOG_004]: 'Failed to retrieve server details from catalog',
    [ERROR_CODES.CATALOG_005]: 'Server installation failed',
    [ERROR_CODES.CATALOG_006]: 'Installation started but tracking failed',
    [ERROR_CODES.CATALOG_007]: 'Installation not found',
    [ERROR_CODES.CATALOG_008]: 'Failed to retrieve installation progress',
    [ERROR_CODES.CATALOG_009]: 'Failed to retrieve categories',

    // テスト・ツール
    [ERROR_CODES.TEST_001]: 'Tool not found',
    [ERROR_CODES.TEST_002]: 'Tool execution failed',
    [ERROR_CODES.TEST_003]: 'Tool execution timed out',
    [ERROR_CODES.TEST_004]: 'Tool is disabled',

    // ログ
    [ERROR_CODES.LOG_001]: 'Log file not found',
    [ERROR_CODES.LOG_002]: 'Log file access denied',
    [ERROR_CODES.LOG_003]: 'Log file too large',
    [ERROR_CODES.LOG_004]: 'Log streaming error',

    // 設定管理
    [ERROR_CODES.CONFIG_001]: 'Configuration format invalid',
    [ERROR_CODES.CONFIG_002]: 'Configuration export failed',
    [ERROR_CODES.CONFIG_003]: 'Configuration import failed',
    [ERROR_CODES.CONFIG_004]: 'Configuration backup failed',

    // シークレット管理
    [ERROR_CODES.SECRET_001]: 'Secret not found',
    [ERROR_CODES.SECRET_002]: 'Secret encryption failed',
    [ERROR_CODES.SECRET_003]: 'Secret decryption failed',
    [ERROR_CODES.SECRET_004]: 'Bitwarden integration error',
  };

  return messages[errorCode] || 'Unknown error';
}

/**
 * ページネーション処理
 */
export function processPagination(
  query: URLSearchParams,
  defaults = { page: 1, limit: 20, maxLimit: 100 }
): { page: number; limit: number; offset: number } {
  const page = Math.max(1, parseInt(query.get('page') || defaults.page.toString()));
  const limit = Math.min(
    defaults.maxLimit,
    Math.max(1, parseInt(query.get('limit') || defaults.limit.toString()))
  );
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

/**
 * ソートパラメータ処理
 */
export function processSorting(
  query: URLSearchParams,
  allowedFields: string[],
  defaultSort = { sortBy: 'updatedAt', sortOrder: 'desc' as 'asc' | 'desc' }
): { sortBy: string; sortOrder: 'asc' | 'desc' } {
  const sortBy = query.get('sort_by') || defaultSort.sortBy;
  const sortOrder = (query.get('sort_order') as 'asc' | 'desc') || defaultSort.sortOrder;

  // 許可されたフィールドのみ受け入れ
  const validSortBy = allowedFields.includes(sortBy) ? sortBy : defaultSort.sortBy;
  const validSortOrder = ['asc', 'desc'].includes(sortOrder) ? sortOrder : defaultSort.sortOrder;

  return { sortBy: validSortBy, sortOrder: validSortOrder };
}

/**
 * 検索フィルタ処理
 */
export function processFilters(
  query: URLSearchParams,
  allowedFilters: string[]
): Record<string, string> {
  const filters: Record<string, string> = {};

  for (const filter of allowedFilters) {
    const value = query.get(filter);
    if (value !== null && value.trim() !== '') {
      filters[filter] = value.trim();
    }
  }

  return filters;
}

/**
 * API リクエストの監査ログ
 */
export function logAPIRequest(
  method: string,
  path: string,
  requestId: string,
  options?: {
    userId?: string;
    userRole?: string;
    ipAddress?: string;
    userAgent?: string;
    duration?: number;
    statusCode?: number;
    error?: string;
  }
): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    event: 'API_REQUEST',
    method,
    path,
    requestId,
    userId: options?.userId || 'anonymous',
    userRole: options?.userRole || 'unknown',
    ipAddress: options?.ipAddress || 'unknown',
    userAgent: options?.userAgent || 'unknown',
    duration: options?.duration,
    statusCode: options?.statusCode,
    error: options?.error,
    level: options?.error ? 'error' : 'info',
  };

  console.log('[API_AUDIT]', JSON.stringify(logEntry));
}

/**
 * APIヘルスチェックレスポンス
 */
export function createHealthCheckResponse(
  healthData: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    components?: Record<string, { status: string; message?: string }>;
    version?: string;
    uptime?: number;
  }
): NextResponse {
  const statusCode = healthData.status === 'healthy' ? 200 : 
                     healthData.status === 'degraded' ? 200 : 503;

  const response = {
    status: healthData.status,
    timestamp: new Date().toISOString(),
    version: healthData.version || 'v1',
    uptime: healthData.uptime,
    components: healthData.components || {},
  };

  return NextResponse.json(response, { status: statusCode });
}

/**
 * キャッシュヘッダーの設定
 */
export function addCacheHeaders(
  response: NextResponse,
  options: {
    maxAge?: number;
    staleWhileRevalidate?: number;
    mustRevalidate?: boolean;
    noCache?: boolean;
  }
): void {
  if (options.noCache) {
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    return;
  }

  const cacheControl = [];
  
  if (options.maxAge !== undefined) {
    cacheControl.push(`max-age=${options.maxAge}`);
  }
  
  if (options.staleWhileRevalidate !== undefined) {
    cacheControl.push(`stale-while-revalidate=${options.staleWhileRevalidate}`);
  }
  
  if (options.mustRevalidate) {
    cacheControl.push('must-revalidate');
  }

  if (cacheControl.length > 0) {
    response.headers.set('Cache-Control', cacheControl.join(', '));
  }
}