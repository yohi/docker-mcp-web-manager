import { NextRequest } from 'next/server';
import { 
  createSuccessResponse, 
  createErrorResponse,
  createValidationErrorResponse,
  ERROR_CODES,
  processPagination,
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
import { z } from 'zod';

// =============================================================================
// /api/v1/servers/[id]/logs - サーバーログ取得API
// MCPサーバーのログ閲覧機能
// =============================================================================

/**
 * サーバーログ取得
 * GET /api/v1/servers/[id]/logs
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();
  
  try {
    // 認証・認可チェック
    const authResult = await requirePermissions([PERMISSIONS.LOGS_READ], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('GET', `/api/v1/servers/${params.id}/logs`, requestId, {
        statusCode: 401,
        error: authResult.error,
      });
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    // パラメータとクエリのバリデーション
    const validation = await validateRequest(request, params, {
      params: z.object({ id: CommonSchemas.id }),
      query: CommonSchemas.pagination.merge(LogSchemas.getServerLogs),
    });
    if (!validation.success) {
      const error = validation.errors!.params || validation.errors!.query!;
      return createValidationErrorResponse(error, requestId);
    }

    if (!validation.data || !validation.data.params || !validation.data.query) {
      return createErrorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid request data', { requestId });
    }

    const serverId = validation.data.params.id;
    const queryParams = validation.data.query;

    // サーバーの存在確認
    const serverRepository = new ServerRepository();
    const server = await serverRepository.findById(serverId);

    if (!server) {
      logAPIRequest('GET', `/api/v1/servers/${serverId}/logs`, requestId, {
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

    // ページネーション処理
    const { page, limit } = processPagination(request.nextUrl.searchParams);

    // Docker MCPでログを取得
    const dockerClient = new DockerMCPClient();
    let logData;

    try {
      logData = await dockerClient.getServerLogs(serverId, {
        lines: queryParams.lines || limit,
        follow: false,
        since: queryParams.since,
        // until, level, searchプロパティはLogSchemas.getServerLogsに定義されていないため削除
        // until: queryParams.until,
        // level: queryParams.level,
        // search: queryParams.search,
      });
    } catch (error) {
      console.error(`[LOG_ERROR] Failed to fetch logs for server ${serverId}:`, error);
      
      // エラーの種類による分岐
      if (error && typeof error === 'object' && 'code' in error) {
        const commandError = error as any;
        
        if (commandError.code === 'RESOURCE_NOT_FOUND') {
          logAPIRequest('GET', `/api/v1/servers/${serverId}/logs`, requestId, {
            userId: authResult.session.user.id,
            statusCode: 404,
            error: 'Server container not found',
          });
          
          return createErrorResponse(
            ERROR_CODES.LOG_001,
            `Server container '${serverId}' not found or not running`,
            { requestId }
          );
        }
        
        if (commandError.code === 'PERMISSION_DENIED') {
          logAPIRequest('GET', `/api/v1/servers/${serverId}/logs`, requestId, {
            userId: authResult.session.user.id,
            statusCode: 403,
            error: 'Insufficient permissions to access logs',
          });
          
          return createErrorResponse(
            ERROR_CODES.LOG_002,
            'Insufficient permissions to access server logs',
            { requestId }
          );
        }
      }
      
      logAPIRequest('GET', `/api/v1/servers/${serverId}/logs`, requestId, {
        userId: authResult.session.user.id,
        statusCode: 500,
        error: error instanceof Error ? error.message : 'Log retrieval failed',
      });
      
      return createErrorResponse(
        ERROR_CODES.LOG_003,
        `Failed to retrieve logs: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { requestId }
      );
    }

    const duration = Date.now() - startTime;

    // 監査ログ
    logAPIRequest('GET', `/api/v1/servers/${serverId}/logs`, requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: 200,
    });

    const responseData = {
      serverId,
      serverName: server.name,
      logs: logData, // logDataは string[] 型
      totalLines: logData.length,
      hasMore: false, // 簡易実装
      timestamp: new Date().toISOString(),
      filters: {
        // level, until, searchプロパティは存在しないためコメントアウト
        // level: queryParams.level,
        since: queryParams.since,
        // until: queryParams.until,
        // search: queryParams.search,
      },
    };

    return createSuccessResponse(responseData, {
      pagination: {
        page,
        limit,
        total: logData.length, // logData は string[] 型
      },
      requestId,
      duration,
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] GET /api/v1/servers/[id]/logs:', error);
    
    logAPIRequest('GET', `/api/v1/servers/${params.id}/logs`, requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to retrieve server logs',
      { requestId, details: errorMessage }
    );
  }
}