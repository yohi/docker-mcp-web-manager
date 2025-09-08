import { NextRequest } from 'next/server';
import { 
  createErrorResponse,
  createValidationErrorResponse,
  ERROR_CODES,
  logAPIRequest,
} from '@/lib/api/response';
import {
  validateRequest,
  CommonSchemas,
  LogSchemas,
} from '@/lib/api/validation';
import {
  requirePermissions,
  PERMISSIONS,
} from '@/lib/auth';
import { ServerRepository } from '@/db/repositories/server-repository';
import { SecureFileAccess } from '@/lib/docker-mcp';
import { z } from 'zod';

// =============================================================================
// /api/v1/servers/[id]/logs/download - ログファイルダウンロードAPI
// MCPサーバーのログファイルダウンロード機能
// =============================================================================

/**
 * ログファイルダウンロード
 * GET /api/v1/servers/[id]/logs/download
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();
  
  try {
    // 認証・認可チェック
    const authResult = await requirePermissions([PERMISSIONS.LOGS_DOWNLOAD], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('GET', `/api/v1/servers/${params.id}/logs/download`, requestId, {
        statusCode: 401,
        error: authResult.error,
      });
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    // パラメータとクエリのバリデーション
    const validation = await validateRequest(request, params, {
      params: z.object({ id: CommonSchemas.id }),
      query: LogSchemas.downloadQuery,
    });
    if (!validation.success) {
      const error = validation.errors!.params || validation.errors!.query!;
      return createValidationErrorResponse(error, requestId);
    }

    const serverId = validation.data!.params.id;
    const queryParams = validation.data!.query;

    // サーバーの存在確認
    const serverRepository = new ServerRepository();
    const server = await serverRepository.findById(serverId);

    if (!server) {
      logAPIRequest('GET', `/api/v1/servers/${serverId}/logs/download`, requestId, {
        userId: authResult.session.user.id,
        statusCode: 404,
        error: 'Server not found',
      });
      return createErrorResponse(
        ERROR_CODES.SERVER_001,
        `Server with ID '${serverId}' not found`,
        { requestId }
      );
    }

    // セキュアファイルアクセスでログファイルを取得
    const fileAccess = new SecureFileAccess();
    let logFile;

    try {
      logFile = await fileAccess.downloadLogFile(serverId, {
        format: queryParams.format || 'txt',
        compress: queryParams.compress || false,
        since: queryParams.since,
        until: queryParams.until,
        level: queryParams.level,
        maxSize: 50 * 1024 * 1024, // 50MB制限
      });
    } catch (error) {
      console.error(`[LOG_DOWNLOAD_ERROR] Failed to download logs for server ${serverId}:`, error);
      
      // エラーの種類による分岐
      if (error && typeof error === 'object' && 'code' in error) {
        const fileError = error as any;
        
        if (fileError.code === 'RESOURCE_NOT_FOUND') {
          logAPIRequest('GET', `/api/v1/servers/${serverId}/logs/download`, requestId, {
            userId: authResult.session.user.id,
            statusCode: 404,
            error: 'Log files not found',
          });
          
          return createErrorResponse(
            ERROR_CODES.LOG_001,
            `Log files for server '${serverId}' not found`,
            { requestId }
          );
        }
        
        if (fileError.code === 'FILE_TOO_LARGE') {
          logAPIRequest('GET', `/api/v1/servers/${serverId}/logs/download`, requestId, {
            userId: authResult.session.user.id,
            statusCode: 413,
            error: 'Log file too large',
          });
          
          return createErrorResponse(
            ERROR_CODES.LOG_004,
            'Log file exceeds maximum download size (50MB). Use streaming or filter options.',
            { requestId }
          );
        }
        
        if (fileError.code === 'PERMISSION_DENIED') {
          logAPIRequest('GET', `/api/v1/servers/${serverId}/logs/download`, requestId, {
            userId: authResult.session.user.id,
            statusCode: 403,
            error: 'Insufficient permissions to download logs',
          });
          
          return createErrorResponse(
            ERROR_CODES.LOG_002,
            'Insufficient permissions to download server logs',
            { requestId }
          );
        }
      }
      
      logAPIRequest('GET', `/api/v1/servers/${serverId}/logs/download`, requestId, {
        userId: authResult.session.user.id,
        statusCode: 500,
        error: error instanceof Error ? error.message : 'Log download failed',
      });
      
      return createErrorResponse(
        ERROR_CODES.LOG_003,
        `Failed to download logs: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { requestId }
      );
    }

    const duration = Date.now() - startTime;

    // 監査ログ
    logAPIRequest('GET', `/api/v1/servers/${serverId}/logs/download`, requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: 200,
      details: {
        fileSize: logFile.size,
        format: queryParams.format,
        compressed: queryParams.compress,
      },
    });

    // ファイル名を生成
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const extension = queryParams.compress ? 
      (queryParams.format === 'json' ? 'json.gz' : 'txt.gz') :
      (queryParams.format === 'json' ? 'json' : 'txt');
    const filename = `${server.name}_logs_${timestamp}.${extension}`;

    // レスポンスヘッダーを設定してファイルを返す
    return new Response(logFile.content, {
      status: 200,
      headers: {
        'Content-Type': queryParams.compress ? 
          'application/gzip' : 
          (queryParams.format === 'json' ? 'application/json' : 'text/plain'),
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': logFile.size.toString(),
        'X-Request-ID': requestId,
        'X-Response-Time': duration.toString(),
        // セキュリティヘッダー
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] GET /api/v1/servers/[id]/logs/download:', error);
    
    logAPIRequest('GET', `/api/v1/servers/${params.id}/logs/download`, requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to download server logs',
      { requestId, details: errorMessage }
    );
  }
}