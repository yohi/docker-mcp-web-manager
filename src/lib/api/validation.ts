import { z } from 'zod';
import { NextRequest } from 'next/server';

// =============================================================================
// API バリデーションスキーマとユーティリティ
// リクエスト・レスポンス検証用のZodスキーマ定義
// =============================================================================

/**
 * 共通バリデーションスキーマ
 */
export const CommonSchemas = {
  // ID形式（英数字、ハイフン、アンダースコア）
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/).min(1).max(100),
  
  // UUID形式
  uuid: z.string().uuid(),
  
  // メールアドレス
  email: z.string().email(),
  
  // URL形式
  url: z.string().url(),
  
  // 日時（ISO8601形式）
  datetime: z.string().datetime(),
  
  // ページネーション
  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
  
  // ソート
  sorting: z.object({
    sort_by: z.string().optional(),
    sort_order: z.enum(['asc', 'desc']).default('desc'),
  }),
};

/**
 * サーバー管理関連スキーマ
 */
export const ServerSchemas = {
  // サーバー作成
  createServer: z.object({
    name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
    image: z.string().min(1).max(200),
    description: z.string().max(500).optional(),
    configuration: z.object({
      environment: z.record(z.string()).optional(),
      enabledTools: z.array(z.string()).optional(),
      resourceLimits: z.object({
        memory: z.string().regex(/^\d+[kmgKMG]?$/).optional(),
        cpu: z.string().regex(/^\d+(\.\d+)?$/).optional(),
        disk: z.string().regex(/^\d+[kmgKMG]?$/).optional(),
      }).optional(),
      networkConfig: z.object({
        mode: z.enum(['bridge', 'host', 'none', 'overlay']).default('bridge'),
        ports: z.array(z.object({
          containerPort: z.number().int().min(1).max(65535),
          hostPort: z.number().int().min(1).max(65535).optional(),
          protocol: z.enum(['tcp', 'udp']).default('tcp'),
        })).optional(),
        networks: z.array(z.string()).optional(),
        dns: z.array(z.string().ip()).optional(),
      }).optional(),
    }).optional(),
  }),
  
  // サーバー更新
  updateServer: z.object({
    name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/).optional(),
    description: z.string().max(500).optional(),
    configuration: z.object({
      environment: z.record(z.string()).optional(),
      enabledTools: z.array(z.string()).optional(),
      resourceLimits: z.object({
        memory: z.string().regex(/^\d+[kmgKMG]?$/).optional(),
        cpu: z.string().regex(/^\d+(\.\d+)?$/).optional(),
        disk: z.string().regex(/^\d+[kmgKMG]?$/).optional(),
      }).optional(),
      networkConfig: z.object({
        mode: z.enum(['bridge', 'host', 'none', 'overlay']).optional(),
        ports: z.array(z.object({
          containerPort: z.number().int().min(1).max(65535),
          hostPort: z.number().int().min(1).max(65535).optional(),
          protocol: z.enum(['tcp', 'udp']).default('tcp'),
        })).optional(),
        networks: z.array(z.string()).optional(),
        dns: z.array(z.string().ip()).optional(),
      }).optional(),
    }).optional(),
  }),
  
  // サーバーフィルタ
  serverFilters: z.object({
    status: z.enum(['running', 'stopped', 'error']).optional(),
    name: z.string().max(100).optional(),
    image: z.string().max(200).optional(),
  }),
};

/**
 * カタログ関連スキーマ
 */
export const CatalogSchemas = {
  // カタログ検索
  catalogSearch: z.object({
    query: z.string().max(100).optional(),
    category: z.string().max(50).optional(),
    verified: z.coerce.boolean().optional(),
    tags: z.array(z.string().max(20)).optional(),
    author: z.string().max(50).optional(),
    min_popularity: z.coerce.number().min(0).optional(),
  }),
  
  // サーバーインストール
  installServer: z.object({
    entryId: CommonSchemas.id,
    name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
    environment: z.record(z.string()).optional(),
    resourceLimits: z.object({
      memory: z.string().regex(/^\d+[kmgKMG]?$/).optional(),
      cpu: z.string().regex(/^\d+(\.\d+)?$/).optional(),
    }).optional(),
    networkConfig: z.object({
      ports: z.array(z.object({
        containerPort: z.number().int().min(1).max(65535),
        hostPort: z.number().int().min(1).max(65535).optional(),
      })).optional(),
    }).optional(),
  }),
};

/**
 * テスト・ツール関連スキーマ
 */
export const TestSchemas = {
  // ツール実行
  executeTest: z.object({
    toolName: z.string().min(1).max(100),
    input: z.record(z.any()).optional(),
    timeout: z.number().int().min(1000).max(300000).optional(), // 1秒〜5分
  }),
  
  // テスト履歴フィルタ
  testHistoryFilters: z.object({
    toolName: z.string().max(100).optional(),
    success: z.coerce.boolean().optional(),
    since: CommonSchemas.datetime.optional(),
    until: CommonSchemas.datetime.optional(),
  }),
};

/**
 * ログ関連スキーマ
 */
export const LogSchemas = {
  // ログ取得
  getServerLogs: z.object({
    lines: z.coerce.number().int().min(1).max(10000).default(100),
    since: CommonSchemas.datetime.optional(),
    follow: z.coerce.boolean().default(false),
  }),
  
  // ログダウンロード
  downloadLogs: z.object({
    format: z.enum(['txt', 'json']).default('txt'),
    since: CommonSchemas.datetime.optional(),
    until: CommonSchemas.datetime.optional(),
  }),
};

/**
 * 設定管理関連スキーマ
 */
export const ConfigSchemas = {
  // 設定エクスポート
  exportConfig: z.object({
    includeSecrets: z.boolean().default(false),
    format: z.enum(['json', 'yaml']).default('json'),
    servers: z.array(CommonSchemas.id).optional(),
  }),
  
  // 設定インポート
  importConfig: z.object({
    config: z.record(z.any()),
    overwrite: z.boolean().default(false),
    dryRun: z.boolean().default(false),
  }),
};

/**
 * シークレット管理関連スキーマ
 */
export const SecretSchemas = {
  // シークレット作成
  createSecret: z.object({
    name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
    type: z.enum(['api_key', 'token', 'password', 'certificate']),
    value: z.string().min(1),
    bitwardenItemId: z.string().optional(),
  }),
  
  // シークレット更新
  updateSecret: z.object({
    name: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/).optional(),
    value: z.string().min(1).optional(),
    bitwardenItemId: z.string().optional(),
  }),
  
  // シークレット参照
  createSecretReference: z.object({
    secretId: CommonSchemas.id,
    environmentVariable: z.string().min(1).max(100).regex(/^[A-Z_][A-Z0-9_]*$/),
    required: z.boolean().default(false),
  }),
};

/**
 * リクエストボディの検証
 */
export async function validateRequestBody<T>(
  request: NextRequest,
  schema: z.ZodSchema<T>
): Promise<{ success: true; data: T } | { success: false; error: z.ZodError }> {
  try {
    const body = await request.json();
    const result = schema.safeParse(body);
    
    if (!result.success) {
      return { success: false, error: result.error };
    }
    
    return { success: true, data: result.data };
  } catch (error) {
    // JSON解析エラー
    const parseError = new z.ZodError([
      {
        code: 'custom',
        message: 'Invalid JSON format',
        path: ['body'],
      },
    ]);
    
    return { success: false, error: parseError };
  }
}

/**
 * クエリパラメータの検証
 */
export function validateQueryParams<T>(
  searchParams: URLSearchParams,
  schema: z.ZodSchema<T>
): { success: true; data: T } | { success: false; error: z.ZodError } {
  try {
    // URLSearchParamsをオブジェクトに変換
    const params = Object.fromEntries(searchParams.entries());
    
    // 配列パラメータの処理（tags[]=tag1&tags[]=tag2 形式）
    const processedParams: Record<string, any> = { ...params };
    
    for (const [key, value] of searchParams.entries()) {
      if (key.endsWith('[]')) {
        const arrayKey = key.slice(0, -2);
        if (!processedParams[arrayKey]) {
          processedParams[arrayKey] = [];
        }
        if (Array.isArray(processedParams[arrayKey])) {
          processedParams[arrayKey].push(value);
        }
      }
    }
    
    const result = schema.safeParse(processedParams);
    
    if (!result.success) {
      return { success: false, error: result.error };
    }
    
    return { success: true, data: result.data };
  } catch (error) {
    const parseError = new z.ZodError([
      {
        code: 'custom',
        message: 'Query parameter parsing failed',
        path: ['query'],
      },
    ]);
    
    return { success: false, error: parseError };
  }
}

/**
 * パスパラメータの検証
 */
export function validatePathParams<T>(
  params: Record<string, string | string[]>,
  schema: z.ZodSchema<T>
): { success: true; data: T } | { success: false; error: z.ZodError } {
  try {
    const result = schema.safeParse(params);
    
    if (!result.success) {
      return { success: false, error: result.error };
    }
    
    return { success: true, data: result.data };
  } catch (error) {
    const parseError = new z.ZodError([
      {
        code: 'custom',
        message: 'Path parameter validation failed',
        path: ['params'],
      },
    ]);
    
    return { success: false, error: parseError };
  }
}

/**
 * リクエスト全体の検証
 */
export async function validateRequest<
  TBody = any,
  TQuery = any,
  TParams = any
>(
  request: NextRequest,
  params: Record<string, string | string[]> | undefined,
  schemas: {
    body?: z.ZodSchema<TBody>;
    query?: z.ZodSchema<TQuery>;
    params?: z.ZodSchema<TParams>;
  }
): Promise<{
  success: boolean;
  data?: {
    body?: TBody;
    query?: TQuery;
    params?: TParams;
  };
  errors?: {
    body?: z.ZodError;
    query?: z.ZodError;
    params?: z.ZodError;
  };
}> {
  const results: any = {};
  const errors: any = {};
  let hasErrors = false;

  // ボディ検証
  if (schemas.body) {
    const bodyResult = await validateRequestBody(request, schemas.body);
    if (bodyResult.success) {
      results.body = bodyResult.data;
    } else {
      errors.body = bodyResult.error;
      hasErrors = true;
    }
  }

  // クエリパラメータ検証
  if (schemas.query) {
    const queryResult = validateQueryParams(request.nextUrl.searchParams, schemas.query);
    if (queryResult.success) {
      results.query = queryResult.data;
    } else {
      errors.query = queryResult.error;
      hasErrors = true;
    }
  }

  // パスパラメータ検証
  if (schemas.params && params) {
    const paramsResult = validatePathParams(params, schemas.params);
    if (paramsResult.success) {
      results.params = paramsResult.data;
    } else {
      errors.params = paramsResult.error;
      hasErrors = true;
    }
  }

  return {
    success: !hasErrors,
    data: hasErrors ? undefined : results,
    errors: hasErrors ? errors : undefined,
  };
}

/**
 * カスタムバリデーター関数の型定義
 */
export type CustomValidator<T> = (value: T) => Promise<boolean> | boolean;

/**
 * 非同期カスタムバリデーション
 */
export async function validateWithCustomRules<T>(
  data: T,
  rules: Array<{
    field: keyof T;
    validator: CustomValidator<T[keyof T]>;
    message: string;
  }>
): Promise<{ success: boolean; errors?: Array<{ field: keyof T; message: string }> }> {
  const errors: Array<{ field: keyof T; message: string }> = [];

  for (const rule of rules) {
    const value = data[rule.field];
    const isValid = await rule.validator(value);
    
    if (!isValid) {
      errors.push({
        field: rule.field,
        message: rule.message,
      });
    }
  }

  return {
    success: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * セキュリティ検証（XSS、SQL インジェクション対策）
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>"\'/\\&]/g, '') // 基本的な危険文字の除去
    .trim()
    .slice(0, 1000); // 長さ制限
}

/**
 * ファイルアップロード検証
 */
export function validateFileUpload(
  file: File,
  options: {
    maxSize?: number;
    allowedTypes?: string[];
    allowedExtensions?: string[];
  } = {}
): { valid: boolean; error?: string } {
  const {
    maxSize = 10 * 1024 * 1024, // 10MB default
    allowedTypes = ['text/plain', 'application/json'],
    allowedExtensions = ['.txt', '.json'],
  } = options;

  // ファイルサイズ確認
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File size exceeds limit (${maxSize} bytes)`,
    };
  }

  // MIMEタイプ確認
  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `File type not allowed: ${file.type}`,
    };
  }

  // 拡張子確認
  const extension = '.' + file.name.split('.').pop()?.toLowerCase();
  if (!allowedExtensions.includes(extension)) {
    return {
      valid: false,
      error: `File extension not allowed: ${extension}`,
    };
  }

  return { valid: true };
}