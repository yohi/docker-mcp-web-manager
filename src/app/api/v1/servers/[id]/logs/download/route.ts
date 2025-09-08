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
import { DockerMCPClient } from '@/lib/docker-mcp';
import { 
  secureFileAccess,
  logFileAccess,
  generateSecureHeaders,
} from '@/lib/utils/secure-file-access';
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

    // Docker MCP経由でログファイルパスを取得
    const dockerClient = new DockerMCPClient();
    let logFilePath: string;
    
    try {
      // ログファイルのパスを取得（実際のDocker MCPコマンド実装に依存）
      logFilePath = `/var/log/docker-mcp/servers/${serverId}/server.log`;
    } catch (error) {
      console.error(`[LOG_PATH_ERROR] Failed to get log path for server ${serverId}:`, error);
      
      return createErrorResponse(
        ERROR_CODES.LOG_001,
        `Log files for server '${serverId}' not found`,
        { requestId }
      );
    }

    // セキュアファイルアクセスでログファイルを取得
    const fileAccess = await secureFileAccess(logFilePath);
    
    if (!fileAccess.success) {
      console.error(`[LOG_SECURITY_ERROR] Secure file access failed for ${logFilePath}:`, fileAccess.error);
      
      // エラーの種類による分岐
      if (fileAccess.error?.includes('not found') || fileAccess.error?.includes('does not exist')) {
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
      
      if (fileAccess.error?.includes('too large') || fileAccess.error?.includes('exceeds maximum')) {
        logAPIRequest('GET', `/api/v1/servers/${serverId}/logs/download`, requestId, {
          userId: authResult.session.user.id,
          statusCode: 413,
          error: 'Log file too large',
        });
        
        return createErrorResponse(
          ERROR_CODES.LOG_004,
          'Log file exceeds maximum download size (100MB). Use streaming or filter options.',
          { requestId }
        );
      }
      
      if (fileAccess.error?.includes('permission') || fileAccess.error?.includes('access denied')) {
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
      
      // その他のセキュリティエラー
      logAPIRequest('GET', `/api/v1/servers/${serverId}/logs/download`, requestId, {
        userId: authResult.session.user.id,
        statusCode: 500,
        error: fileAccess.error || 'Security validation failed',
      });
      
      return createErrorResponse(
        ERROR_CODES.LOG_003,
        `Failed to download logs: ${fileAccess.error || 'Security validation failed'}`,
        { requestId }
      );
    }

    const logFile = fileAccess.file!;
    const duration = Date.now() - startTime;

    // 監査ログ
    logAPIRequest('GET', `/api/v1/servers/${serverId}/logs/download`, requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: 200,
      details: {
        fileSize: logFile.size,
        filePath: logFile.path,
        mimeType: logFile.mimeType,
      },
    });

    // アクセスログ記録
    await logFileAccess(logFile.path, authResult.session.user.id, 'download');

    // セキュアヘッダーを生成
    const secureHeaders = generateSecureHeaders(logFile.sanitizedName, logFile.mimeType);
    
    // レスポンスヘッダーを設定してファイルを返す
    return new Response(logFile.readStream as any, {
      status: 200,
      headers: {
        ...secureHeaders,
        'Content-Length': logFile.size.toString(),
        'X-Request-ID': requestId,
        'X-Response-Time': duration.toString(),
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