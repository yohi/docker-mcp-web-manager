/**
 * API セキュリティユーティリティ
 * API エンドポイントのセキュリティ強化機能を提供
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { appLogger } from '@/lib/utils/logger';
import { config } from '@/lib/config/app-config';

/**
 * リクエストサイズ制限（10MB）
 */
const MAX_REQUEST_SIZE = 10 * 1024 * 1024;

/**
 * レート制限ストア（本番環境ではRedisなど外部ストレージを使用）
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * リクエストサイズをチェック
 */
export function validateRequestSize(request: NextRequest): boolean {
  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > MAX_REQUEST_SIZE) {
    appLogger.warn('Request size exceeded limit', {
      contentLength: parseInt(contentLength),
      maxSize: MAX_REQUEST_SIZE,
      userAgent: request.headers.get('user-agent'),
      ip: request.ip,
    });
    return false;
  }
  return true;
}

/**
 * Content-Type をチェック
 */
export function validateContentType(
  request: NextRequest,
  allowedTypes: string[] = ['application/json']
): boolean {
  if (request.method !== 'GET' && request.method !== 'DELETE') {
    const contentType = request.headers.get('content-type');
    if (!contentType || !allowedTypes.some(type => contentType.includes(type))) {
      appLogger.warn('Invalid content type', {
        contentType,
        allowedTypes,
        method: request.method,
        url: request.url,
      });
      return false;
    }
  }
  return true;
}

/**
 * CSRF トークンをチェック
 */
export function validateCSRFToken(request: NextRequest): boolean {
  // GET, HEAD, OPTIONS メソッドはCSRFチェック不要
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    return true;
  }

  const csrfToken = request.headers.get('x-csrf-token');
  const sessionToken = request.headers.get('x-session-token');

  if (!csrfToken || !sessionToken) {
    appLogger.warn('Missing CSRF or session token', {
      method: request.method,
      url: request.url,
      hasCSRF: !!csrfToken,
      hasSession: !!sessionToken,
    });
    return false;
  }

  // TODO: 実際のトークン検証ロジックを実装
  // セッションストアからトークンを検証

  return true;
}

/**
 * レート制限をチェック
 */
export function checkRateLimit(
  identifier: string,
  limit: number = config.security.rateLimit.max,
  windowMs: number = config.security.rateLimit.windowMs
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const windowStart = now - windowMs;

  // 期限切れのエントリを削除
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }

  const entry = rateLimitStore.get(identifier);

  if (!entry) {
    // 新しいエントリを作成
    rateLimitStore.set(identifier, {
      count: 1,
      resetTime: now + windowMs,
    });
    return {
      allowed: true,
      remaining: limit - 1,
      resetTime: now + windowMs,
    };
  }

  if (entry.resetTime < now) {
    // ウィンドウをリセット
    entry.count = 1;
    entry.resetTime = now + windowMs;
    return {
      allowed: true,
      remaining: limit - 1,
      resetTime: entry.resetTime,
    };
  }

  if (entry.count >= limit) {
    appLogger.warn('Rate limit exceeded', {
      identifier,
      count: entry.count,
      limit,
      resetTime: entry.resetTime,
    });
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime,
    };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: limit - entry.count,
    resetTime: entry.resetTime,
  };
}

/**
 * IP アドレスを取得（プロキシ対応）
 */
export function getClientIP(request: NextRequest): string {
  // プロキシ経由の場合のヘッダーをチェック
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  const clientIP = request.headers.get('x-client-ip');

  if (forwardedFor) {
    // 最初のIPアドレスを使用（複数の場合はカンマ区切り）
    return forwardedFor.split(',')[0].trim();
  }

  if (realIP) {
    return realIP;
  }

  if (clientIP) {
    return clientIP;
  }

  // フォールバック
  return request.ip || 'unknown';
}

/**
 * 入力値のサニタイズ
 */
export function sanitizeInput(input: any): any {
  if (typeof input === 'string') {
    // HTMLタグを除去
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<[^>]*>/g, '')
      .trim();
  }

  if (Array.isArray(input)) {
    return input.map(sanitizeInput);
  }

  if (typeof input === 'object' && input !== null) {
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[key] = sanitizeInput(value);
    }
    return sanitized;
  }

  return input;
}

/**
 * SQLインジェクション検出
 */
export function detectSQLInjection(input: string): boolean {
  const sqlPatterns = [
    /('|(\\')|(;|%3B)|(--)|(\s*OR\s+\d+\s*=\s*\d+))/i,
    /(UNION\s+SELECT)/i,
    /(DROP\s+TABLE)/i,
    /(INSERT\s+INTO)/i,
    /(DELETE\s+FROM)/i,
    /(UPDATE\s+\w+\s+SET)/i,
    /(\bOR\s+1\s*=\s*1\b)/i,
    /(\bAND\s+1\s*=\s*1\b)/i,
  ];

  return sqlPatterns.some(pattern => pattern.test(input));
}

/**
 * セキュリティヘッダーを設定
 */
export function setSecurityHeaders(response: NextResponse): NextResponse {
  // XSS Protection
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // Content Type Options
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // Frame Options
  response.headers.set('X-Frame-Options', 'DENY');

  // Referrer Policy
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions Policy
  response.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  // HSTS (HTTPSの場合のみ)
  if (config.isProduction) {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  return response;
}

/**
 * API ミドルウェア：包括的セキュリティチェック
 */
export function securityMiddleware(
  handler: (request: NextRequest) => Promise<NextResponse>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      // IP アドレス取得
      const clientIP = getClientIP(request);

      // リクエストサイズチェック
      if (!validateRequestSize(request)) {
        return NextResponse.json(
          { error: 'Request size too large' },
          { status: 413 }
        );
      }

      // Content-Type チェック
      if (!validateContentType(request)) {
        return NextResponse.json(
          { error: 'Invalid content type' },
          { status: 400 }
        );
      }

      // CSRF トークンチェック
      if (!validateCSRFToken(request)) {
        return NextResponse.json(
          { error: 'Invalid CSRF token' },
          { status: 403 }
        );
      }

      // レート制限チェック
      const rateLimit = checkRateLimit(clientIP);
      if (!rateLimit.allowed) {
        const resetTimeSeconds = Math.ceil((rateLimit.resetTime - Date.now()) / 1000);
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          {
            status: 429,
            headers: {
              'X-RateLimit-Limit': config.security.rateLimit.max.toString(),
              'X-RateLimit-Remaining': rateLimit.remaining.toString(),
              'X-RateLimit-Reset': resetTimeSeconds.toString(),
            },
          }
        );
      }

      // ハンドラー実行
      const response = await handler(request);

      // セキュリティヘッダー設定
      return setSecurityHeaders(response);

    } catch (error) {
      appLogger.error('Security middleware error', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}

export default {
  validateRequestSize,
  validateContentType,
  validateCSRFToken,
  checkRateLimit,
  getClientIP,
  sanitizeInput,
  detectSQLInjection,
  setSecurityHeaders,
  securityMiddleware,
};