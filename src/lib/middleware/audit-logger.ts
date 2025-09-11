// 監査ログミドルウェア - タスク5.1要件

import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

export interface AuditLogEntry {
  timestamp: string;
  userId?: string;
  userEmail?: string;
  method: string;
  url: string;
  path: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  requestId: string;
  userAgent?: string;
  ipAddress: string;
  statusCode?: number;
  duration?: number;
  requestBody?: any;
  responseBody?: any;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * 監査ログ用のリクエスト識別子を生成
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * IPアドレスを取得（プロキシ対応）
 */
export function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const clientIp = request.headers.get('x-client-ip');
  
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  if (realIp) {
    return realIp.trim();
  }
  if (clientIp) {
    return clientIp.trim();
  }
  
  return request.ip || 'unknown';
}

/**
 * APIパスからアクションとリソースタイプを推定
 */
export function inferActionAndResource(method: string, pathname: string): {
  action: string;
  resourceType: string;
  resourceId?: string;
} {
  const pathSegments = pathname.split('/').filter(Boolean);
  
  // /api/v1/servers/[id] パターン
  if (pathSegments[0] === 'api' && pathSegments[1] === 'v1') {
    const resourceType = pathSegments[2] || 'unknown';
    const resourceId = pathSegments[3];
    
    let action: string;
    
    switch (method) {
      case 'GET':
        action = resourceId ? 'read' : 'list';
        break;
      case 'POST':
        // POSTでIDがある場合はアクション（start, stop等）
        action = resourceId ? 'action' : 'create';
        break;
      case 'PUT':
      case 'PATCH':
        action = 'update';
        break;
      case 'DELETE':
        action = 'delete';
        break;
      default:
        action = method.toLowerCase();
    }
    
    return { action, resourceType, resourceId };
  }
  
  return {
    action: method.toLowerCase(),
    resourceType: 'unknown',
  };
}

/**
 * 監査ログエントリを作成
 */
export async function createAuditLogEntry(
  request: NextRequest,
  response?: NextResponse,
  startTime?: number,
  error?: Error
): Promise<AuditLogEntry> {
  const requestId = generateRequestId();
  const timestamp = new Date().toISOString();
  const pathname = new URL(request.url).pathname;
  const { action, resourceType, resourceId } = inferActionAndResource(request.method, pathname);
  
  // 認証情報の取得
  let userId: string | undefined;
  let userEmail: string | undefined;
  
  try {
    const token = await getToken({ 
      req: request,
      secret: process.env.NEXTAUTH_SECRET 
    });
    
    if (token) {
      userId = token.sub;
      userEmail = token.email || undefined;
    }
  } catch (tokenError) {
    // 認証情報の取得に失敗した場合は続行
  }
  
  const auditEntry: AuditLogEntry = {
    timestamp,
    userId,
    userEmail,
    method: request.method,
    url: request.url,
    path: pathname,
    action,
    resourceType,
    resourceId,
    requestId,
    userAgent: request.headers.get('user-agent') || undefined,
    ipAddress: getClientIP(request),
  };
  
  // レスポンス情報
  if (response) {
    auditEntry.statusCode = response.status;
  }
  
  // 実行時間
  if (startTime) {
    auditEntry.duration = Date.now() - startTime;
  }
  
  // エラー情報
  if (error) {
    auditEntry.error = error.message;
  }
  
  return auditEntry;
}

/**
 * 監査ログを出力（構造化ログ形式）
 */
export function writeAuditLog(entry: AuditLogEntry): void {
  // 機密データをマスク
  const maskedEntry = maskSensitiveData(entry);
  
  // 構造化ログとして出力
  console.log(JSON.stringify({
    level: 'info',
    type: 'audit',
    ...maskedEntry,
  }));
}

/**
 * 機密データをマスク
 */
function maskSensitiveData(entry: AuditLogEntry): AuditLogEntry {
  const masked = { ...entry };
  
  // リクエストボディの機密データをマスク
  if (masked.requestBody) {
    masked.requestBody = maskObjectSensitiveFields(masked.requestBody);
  }
  
  // レスポンスボディの機密データをマスク
  if (masked.responseBody) {
    masked.responseBody = maskObjectSensitiveFields(masked.responseBody);
  }
  
  return masked;
}

/**
 * オブジェクト内の機密フィールドをマスク
 */
function maskObjectSensitiveFields(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  
  const sensitiveFields = [
    'password', 'token', 'secret', 'key', 'authorization',
    'cookie', 'session', 'credential', 'private', 'auth'
  ];
  
  const masked = Array.isArray(obj) ? [...obj] : { ...obj };
  
  Object.keys(masked).forEach(key => {
    const lowerKey = key.toLowerCase();
    const isSensitive = sensitiveFields.some(field => lowerKey.includes(field));
    
    if (isSensitive) {
      masked[key] = '***MASKED***';
    } else if (typeof masked[key] === 'object' && masked[key] !== null) {
      masked[key] = maskObjectSensitiveFields(masked[key]);
    }
  });
  
  return masked;
}

/**
 * 監査ログミドルウェア関数
 */
export function auditLogger() {
  return async function(
    request: NextRequest,
    handler: (req: NextRequest) => Promise<NextResponse>,
  ): Promise<NextResponse> {
    const startTime = Date.now();
    let response: NextResponse;
    let error: Error | undefined;
    
    try {
      response = await handler(request);
      return response;
    } catch (err) {
      error = err as Error;
      throw err;
    } finally {
      try {
        const auditEntry = await createAuditLogEntry(
          request,
          response!,
          startTime,
          error
        );
        
        writeAuditLog(auditEntry);
      } catch (auditError) {
        // 監査ログの記録に失敗してもメインの処理は継続
        console.error('Failed to write audit log:', auditError);
      }
    }
  };
}