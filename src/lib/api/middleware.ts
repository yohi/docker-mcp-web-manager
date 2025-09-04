import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateApiSession, validateAdminSession } from '../auth/session-utils';

/**
 * API共通ミドルウェア
 * 認証、レート制限、エラーハンドリングを統一
 */

// レート制限用のメモリストレージ（本番環境ではRedisなどを使用）
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * レート制限設定
 */
interface RateLimitConfig {
  maxRequests: number;  // 制限時間内での最大リクエスト数
  windowMs: number;     // 制限時間（ミリ秒）
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

/**
 * デフォルトレート制限設定
 */
const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 100,
  windowMs: 60 * 1000, // 1分
};

/**
 * レート制限チェック
 */
export function rateLimitCheck(
  identifier: string,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT
): { allowed: boolean; resetTime: number; remaining: number } {
  const now = Date.now();
  const windowStart = now - config.windowMs;

  // 古いエントリをクリーンアップ
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetTime < windowStart) {
      rateLimitStore.delete(key);
    }
  }

  const current = rateLimitStore.get(identifier);
  const resetTime = now + config.windowMs;

  if (!current || current.resetTime < windowStart) {
    // 新しいウィンドウを開始
    rateLimitStore.set(identifier, { count: 1, resetTime });
    return {
      allowed: true,
      resetTime,
      remaining: config.maxRequests - 1,
    };
  }

  if (current.count >= config.maxRequests) {
    return {
      allowed: false,
      resetTime: current.resetTime,
      remaining: 0,
    };
  }

  current.count++;
  return {
    allowed: true,
    resetTime: current.resetTime,
    remaining: config.maxRequests - current.count,
  };
}

/**
 * APIエラーレスポンスの作成
 */
export function createApiErrorResponse(
  code: string,
  message: string,
  status: number = 500,
  details?: any
): NextResponse {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        details,
        timestamp: new Date().toISOString(),
      },
    },
    { status }
  );
}

/**
 * APIレスポンスヘッダーの設定
 */
export function setApiHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return response;
}

/**
 * ページネーション用のクエリパラメータスキーマ
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sort_by: z.string().optional(),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * ページネーション結果の作成
 */
export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
) {
  const totalPages = Math.ceil(total / limit);
  
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

/**
 * API認証ミドルウェア
 */
export async function withAuth(
  request: NextRequest,
  handler: (req: NextRequest, session: any) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    const validation = await validateApiSession(request);
    
    if (!validation.valid) {
      return createApiErrorResponse(
        'AUTH_ERROR',
        validation.error || 'Authentication required',
        validation.status || 401
      );
    }

    return await handler(request, validation.session);
  } catch (error) {
    console.error('Auth middleware error:', error);
    return createApiErrorResponse('INTERNAL_ERROR', 'Internal server error', 500);
  }
}

/**
 * 管理者認証ミドルウェア
 */
export async function withAdminAuth(
  request: NextRequest,
  handler: (req: NextRequest, session: any) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    const validation = await validateAdminSession(request);
    
    if (!validation.valid) {
      return createApiErrorResponse(
        'ADMIN_ERROR',
        validation.error || 'Admin privileges required',
        validation.status || 403
      );
    }

    return await handler(request, validation.session);
  } catch (error) {
    console.error('Admin auth middleware error:', error);
    return createApiErrorResponse('INTERNAL_ERROR', 'Internal server error', 500);
  }
}

/**
 * レート制限ミドルウェア
 */
export async function withRateLimit(
  request: NextRequest,
  handler: (req: NextRequest) => Promise<NextResponse>,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT
): Promise<NextResponse> {
  try {
    const identifier = request.ip || request.headers.get('x-forwarded-for') || 'unknown';
    const result = rateLimitCheck(identifier, config);

    if (!result.allowed) {
      const response = createApiErrorResponse(
        'RATE_LIMIT_EXCEEDED',
        'Too many requests',
        429
      );
      
      response.headers.set('Retry-After', Math.ceil((result.resetTime - Date.now()) / 1000).toString());
      response.headers.set('X-RateLimit-Limit', config.maxRequests.toString());
      response.headers.set('X-RateLimit-Remaining', '0');
      response.headers.set('X-RateLimit-Reset', result.resetTime.toString());
      
      return response;
    }

    const response = await handler(request);
    
    // レート制限ヘッダーを追加
    response.headers.set('X-RateLimit-Limit', config.maxRequests.toString());
    response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
    response.headers.set('X-RateLimit-Reset', result.resetTime.toString());

    return response;
  } catch (error) {
    console.error('Rate limit middleware error:', error);
    return createApiErrorResponse('INTERNAL_ERROR', 'Internal server error', 500);
  }
}

/**
 * 入力検証ミドルウェア
 */
export async function withValidation<T>(
  request: NextRequest,
  schema: z.ZodSchema<T>,
  handler: (req: NextRequest, data: T) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    let data: any;

    if (request.method === 'GET') {
      // GETリクエストの場合はクエリパラメータを検証
      const url = new URL(request.url);
      const params = Object.fromEntries(url.searchParams);
      data = schema.parse(params);
    } else {
      // POST/PUT/PATCHの場合はボディを検証
      const body = await request.json();
      data = schema.parse(body);
    }

    return await handler(request, data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createApiErrorResponse(
        'VALIDATION_ERROR',
        'Invalid request data',
        400,
        error.errors
      );
    }

    console.error('Validation middleware error:', error);
    return createApiErrorResponse('INTERNAL_ERROR', 'Internal server error', 500);
  }
}

/**
 * APIミドルウェアチェーン
 */
export function apiHandler(
  handler: (req: NextRequest) => Promise<NextResponse>,
  options: {
    requireAuth?: boolean;
    requireAdmin?: boolean;
    rateLimit?: RateLimitConfig;
  } = {}
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    let response: NextResponse;

    try {
      // レート制限を適用
      if (options.rateLimit) {
        const rateLimitResult = await withRateLimit(request, handler, options.rateLimit);
        if (rateLimitResult.status === 429) {
          return setApiHeaders(rateLimitResult);
        }
      }

      // 管理者認証が必要な場合
      if (options.requireAdmin) {
        response = await withAdminAuth(request, async (req, session) => {
          return await handler(req);
        });
      }
      // 通常認証が必要な場合
      else if (options.requireAuth) {
        response = await withAuth(request, async (req, session) => {
          return await handler(req);
        });
      }
      // 認証不要の場合
      else {
        response = await handler(request);
      }

      return setApiHeaders(response);
    } catch (error) {
      console.error('API handler error:', error);
      response = createApiErrorResponse('INTERNAL_ERROR', 'Internal server error', 500);
      return setApiHeaders(response);
    }
  };
}