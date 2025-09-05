/**
 * バリデーション・サニタイゼーションミドルウェア
 * 
 * 機能要件：
 * - API リクエストの自動バリデーション
 * - 入力データのサニタイゼーション
 * - エラーレスポンスの統一化
 * - セキュリティヘッダーの追加
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import { CustomError, createValidationError } from '@/lib/errors/CustomError';
import { ErrorCodes, ErrorLevel, ErrorCategory, ErrorContext } from '@/lib/errors/types';
import { globalErrorHandler } from '@/lib/errors/ErrorHandler';
import { handleValidationError } from './schemas';
import { sanitizeComplexData, sanitizePlainText } from './sanitizer';

/**
 * バリデーションミドルウェアの設定
 */
export interface ValidationMiddlewareConfig {
  /** 入力スキーマ */
  inputSchema?: z.ZodSchema;
  /** 出力スキーマ */
  outputSchema?: z.ZodSchema;
  /** クエリパラメータスキーマ */
  querySchema?: z.ZodSchema;
  /** レート制限設定 */
  rateLimit?: {
    windowMs: number;
    max: number;
    message?: string;
    skipSuccessfulRequests?: boolean;
  };
  /** スロー制限設定 */
  slowDown?: {
    windowMs: number;
    delayAfter: number;
    delayMs: number | ((hits: number) => number);
  };
  /** CSRFトークンの検証 */
  csrfProtection?: boolean;
  /** 認証が必要か */
  requireAuth?: boolean;
  /** 必要なロール */
  requiredRole?: string;
  /** 必要な権限 */
  requiredPermissions?: string[];
  /** IPホワイトリスト */
  ipWhitelist?: string[];
  /** ログ記録レベル */
  logLevel?: ErrorLevel;
  /** カスタムサニタイザー */
  customSanitizers?: Record<string, (value: unknown) => any>;
}

/**
 * リクエストコンテキスト
 */
interface RequestContext extends ErrorContext {
  startTime: number;
  requestSize: number;
  clientFingerprint: string;
}

/**
 * IPアドレス抽出
 */
function extractClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfIp = request.headers.get('cf-connecting-ip');
  
  if (cfIp) return cfIp;
  if (realIp) return realIp;
  if (forwarded) return forwarded.split(',')[0].trim();
  
  return request.ip || 'unknown';
}

/**
 * クライアントフィンガープリント生成
 */
function generateClientFingerprint(request: NextRequest): string {
  const userAgent = request.headers.get('user-agent') || '';
  const acceptLanguage = request.headers.get('accept-language') || '';
  const acceptEncoding = request.headers.get('accept-encoding') || '';
  const ip = extractClientIP(request);
  
  const fingerprint = `${ip}:${userAgent}:${acceptLanguage}:${acceptEncoding}`;
  return Buffer.from(fingerprint).toString('base64').substring(0, 32);
}

/**
 * セキュリティヘッダーを追加
 */
function addSecurityHeaders(response: NextResponse): NextResponse {
  // XSS Protection
  response.headers.set('X-XSS-Protection', '1; mode=block');
  
  // Content Type Options
  response.headers.set('X-Content-Type-Options', 'nosniff');
  
  // Frame Options
  response.headers.set('X-Frame-Options', 'DENY');
  
  // Content Security Policy (基本的な設定)
  response.headers.set('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' data:; " +
    "connect-src 'self' https:; " +
    "frame-src 'none';"
  );
  
  // Referrer Policy
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Strict Transport Security (HTTPS環境でのみ)
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  // Cross-Origin Embedder Policy
  response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  
  // Cross-Origin Opener Policy
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  
  // Cross-Origin Resource Policy
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  
  return response;
}

/**
 * リクエストサイズをチェック
 */
async function checkRequestSize(request: NextRequest, maxSize: number = 10 * 1024 * 1024): Promise<void> {
  const contentLength = request.headers.get('content-length');
  
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (size > maxSize) {
      throw createValidationError(
        ErrorCodes.VALID_003,
        `Request body too large: ${size} bytes (max: ${maxSize} bytes)`,
        {
          messageJa: `リクエストボディが大きすぎます: ${size}バイト (最大: ${maxSize}バイト)`,
          details: { size, maxSize },
        }
      );
    }
  }
}

/**
 * CSRFトークンを検証
 */
function validateCSRFToken(request: NextRequest): void {
  const token = request.headers.get('x-csrf-token') || request.headers.get('x-xsrf-token');
  const cookie = request.cookies.get('csrf-token')?.value;
  
  if (!token || !cookie || token !== cookie) {
    throw createValidationError(
      ErrorCodes.VALID_005,
      'Invalid or missing CSRF token',
      {
        messageJa: 'CSRFトークンが無効か存在しません',
      }
    );
  }
}

/**
 * IPホワイトリストをチェック
 */
function checkIPWhitelist(request: NextRequest, whitelist: string[]): void {
  const clientIP = extractClientIP(request);
  
  if (!whitelist.includes(clientIP) && !whitelist.includes('*')) {
    throw createValidationError(
      ErrorCodes.VALID_004,
      `IP address not in whitelist: ${clientIP}`,
      {
        messageJa: `IPアドレスがホワイトリストに登録されていません: ${clientIP}`,
        details: { clientIP, whitelist },
      }
    );
  }
}

/**
 * リクエストボディを取得・パース
 */
async function parseRequestBody(request: NextRequest): Promise<any> {
  const contentType = request.headers.get('content-type') || '';
  
  try {
    if (contentType.includes('application/json')) {
      const text = await request.text();
      if (!text.trim()) return {};
      return JSON.parse(text);
    }
    
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      const data: Record<string, any> = {};
      formData.forEach((value, key) => {
        data[key] = value;
      });
      return data;
    }
    
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const data: Record<string, any> = {};
      formData.forEach((value, key) => {
        if (value instanceof File) {
          data[key] = {
            name: value.name,
            size: value.size,
            type: value.type,
            lastModified: value.lastModified,
          };
        } else {
          data[key] = value;
        }
      });
      return data;
    }
    
    return {};
  } catch (error) {
    throw createValidationError(
      ErrorCodes.VALID_006,
      'Failed to parse request body',
      {
        messageJa: 'リクエストボディの解析に失敗しました',
        cause: error as Error,
      }
    );
  }
}

/**
 * クエリパラメータを取得・サニタイズ
 */
function parseQueryParams(request: NextRequest): Record<string, any> {
  const params: Record<string, any> = {};
  
  request.nextUrl.searchParams.forEach((value, key) => {
    // 配列形式のパラメータをサポート (key[]=value1&key[]=value2)
    if (key.endsWith('[]')) {
      const actualKey = key.slice(0, -2);
      if (!params[actualKey]) {
        params[actualKey] = [];
      }
      params[actualKey].push(sanitizePlainText(value));
    } else {
      // 既存のキーがある場合は配列に変換
      if (params[key]) {
        if (Array.isArray(params[key])) {
          params[key].push(sanitizePlainText(value));
        } else {
          params[key] = [params[key], sanitizePlainText(value)];
        }
      } else {
        params[key] = sanitizePlainText(value);
      }
    }
  });
  
  return params;
}

/**
 * メインのバリデーションミドルウェア関数
 */
export function createValidationMiddleware(config: ValidationMiddlewareConfig = {}) {
  return function validationMiddleware(
    handler: (request: NextRequest, context: { params?: any; validatedInput?: any; validatedQuery?: any }) => Promise<NextResponse>
  ) {
    return async (request: NextRequest, context?: { params?: any }): Promise<NextResponse> => {
      const startTime = Date.now();
      const requestId = `req_${startTime}_${Math.random().toString(36).substr(2, 9)}`;
      
      // リクエストコンテキストを作成
      const requestContext: RequestContext = {
        requestId,
        method: request.method,
        path: request.nextUrl.pathname,
        ipAddress: extractClientIP(request),
        userAgent: request.headers.get('user-agent') || undefined,
        startTime,
        requestSize: parseInt(request.headers.get('content-length') || '0', 10),
        clientFingerprint: generateClientFingerprint(request),
      };
      
      try {
        // リクエストサイズチェック
        await checkRequestSize(request, 10 * 1024 * 1024); // 10MB制限
        
        // IPホワイトリストチェック
        if (config.ipWhitelist) {
          checkIPWhitelist(request, config.ipWhitelist);
        }
        
        // CSRFトークン検証
        if (config.csrfProtection && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)) {
          validateCSRFToken(request);
        }
        
        // 入力データの取得とサニタイゼーション
        let validatedInput: any = {};
        let validatedQuery: any = {};
        
        // リクエストボディの処理
        if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
          const rawBody = await parseRequestBody(request);
          
          // カスタムサニタイザーの適用
          if (config.customSanitizers) {
            const sanitizerSchema: Record<string, any> = {};
            Object.entries(config.customSanitizers).forEach(([key, sanitizer]) => {
              sanitizerSchema[key] = { type: 'string', sanitizer };
            });
            const sanitized = sanitizeComplexData(rawBody, sanitizerSchema);
            Object.assign(rawBody, sanitized);
          }
          
          // 入力スキーマでバリデーション
          if (config.inputSchema) {
            const result = config.inputSchema.safeParse(rawBody);
            if (!result.success) {
              const validationError = handleValidationError(result.error);
              throw createValidationError(
                validationError.code as any,
                validationError.message,
                {
                  messageJa: 'リクエストデータに不正があります',
                  details: validationError.fields,
                  context: requestContext,
                }
              );
            }
            validatedInput = result.data;
          } else {
            validatedInput = rawBody;
          }
        }
        
        // クエリパラメータの処理
        const rawQuery = parseQueryParams(request);
        if (config.querySchema) {
          const result = config.querySchema.safeParse(rawQuery);
          if (!result.success) {
            const validationError = handleValidationError(result.error);
            throw createValidationError(
              validationError.code as any,
              validationError.message,
              {
                messageJa: 'クエリパラメータに不正があります',
                details: validationError.fields,
                context: requestContext,
              }
            );
          }
          validatedQuery = result.data;
        } else {
          validatedQuery = rawQuery;
        }
        
        // ハンドラーの実行
        let response = await handler(request, {
          ...context,
          validatedInput,
          validatedQuery,
        });
        
        // 出力スキーマでレスポンスをバリデーション（開発環境のみ）
        if (config.outputSchema && process.env.NODE_ENV === 'development') {
          try {
            const responseBody = await response.text();
            if (responseBody) {
              const parsedResponse = JSON.parse(responseBody);
              const result = config.outputSchema.safeParse(parsedResponse);
              if (!result.success) {
                console.warn('Response validation failed:', result.error);
              }
            }
            // レスポンスを再構築
            response = new NextResponse(responseBody, {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
            });
          } catch (error) {
            console.warn('Failed to validate response:', error);
          }
        }
        
        // セキュリティヘッダーを追加
        response = addSecurityHeaders(response);
        
        // リクエストIDを追加
        response.headers.set('X-Request-ID', requestId);
        
        // 処理時間を追加
        const processingTime = Date.now() - startTime;
        response.headers.set('X-Processing-Time', `${processingTime}ms`);
        
        // 成功ログ（設定レベルに応じて）
        if (config.logLevel && [ErrorLevel.DEBUG, ErrorLevel.INFO].includes(config.logLevel)) {
          console.log(`[${request.method}] ${request.nextUrl.pathname} - ${response.status} (${processingTime}ms)`);
        }
        
        return response;
        
      } catch (error) {
        // エラーコンテキストを追加
        const errorContext = {
          ...requestContext,
          metadata: {
            processingTime: Date.now() - startTime,
            validationConfig: {
              hasInputSchema: !!config.inputSchema,
              hasQuerySchema: !!config.querySchema,
              hasOutputSchema: !!config.outputSchema,
              csrfProtection: config.csrfProtection,
              requireAuth: config.requireAuth,
            },
          },
        };
        
        // CustomErrorの場合はコンテキストを追加
        if (error instanceof CustomError) {
          const enhancedError = error.withContext(errorContext);
          return globalErrorHandler.createApiErrorResponse(enhancedError, errorContext);
        }
        
        // その他のエラーの場合は新しいCustomErrorを作成
        const customError = createValidationError(
          ErrorCodes.SYS_005,
          error instanceof Error ? error.message : 'Unknown error occurred',
          {
            messageJa: '予期しないエラーが発生しました',
            context: errorContext,
            cause: error instanceof Error ? error : undefined,
          }
        );
        
        return globalErrorHandler.createApiErrorResponse(customError, errorContext);
      }
    };
  };
}

/**
 * 標準的なAPIバリデーションミドルウェア
 */
export const standardApiValidation = createValidationMiddleware({
  rateLimit: {
    windowMs: 60 * 1000, // 1分
    max: 100, // 100リクエスト/分
    message: 'Too many requests',
  },
  csrfProtection: true,
  logLevel: ErrorLevel.INFO,
});

/**
 * 厳密なAPIバリデーションミドルウェア（管理者用）
 */
export const strictApiValidation = createValidationMiddleware({
  rateLimit: {
    windowMs: 60 * 1000, // 1分
    max: 50, // 50リクエスト/分
    message: 'Rate limit exceeded for admin operations',
  },
  slowDown: {
    windowMs: 60 * 1000,
    delayAfter: 10,
    delayMs: 500,
  },
  csrfProtection: true,
  requireAuth: true,
  requiredRole: 'admin',
  logLevel: ErrorLevel.DEBUG,
});

/**
 * パブリックAPIバリデーションミドルウェア
 */
export const publicApiValidation = createValidationMiddleware({
  rateLimit: {
    windowMs: 60 * 1000, // 1分
    max: 200, // 200リクエスト/分
    message: 'Rate limit exceeded',
  },
  csrfProtection: false,
  logLevel: ErrorLevel.WARNING,
});