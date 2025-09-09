import { NextRequest } from 'next/server';
import { 
  createSuccessResponse, 
  createErrorResponse,
  ERROR_CODES,
  logAPIRequest,
} from '@/lib/api/response';
import {
  validateRequest,
  CommonSchemas,
} from '@/lib/api/validation';
import {
  requirePermissions,
  PERMISSIONS,
} from '@/lib/auth';
import { ServerRepository } from '@/db/repositories/server-repository';
import { DockerMCPClient } from '@/lib/docker-mcp';
import { z } from 'zod';

// =============================================================================
// /api/v1/servers/[id]/stop - サーバー停止API
// 指定されたサーバーの停止操作
// =============================================================================

/**
 * サーバー停止
 * POST /api/v1/servers/[id]/stop
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();
  
  try {
    // 認証・認可チェック
    const authResult = await requirePermissions([PERMISSIONS.SERVERS_MANAGE], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('POST', `/api/v1/servers/${params.id}/stop`, requestId, {
        statusCode: 401,
        error: authResult.error,
      });
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    // パスパラメータのバリデーション
    const paramsValidation = await validateRequest(request, params, { 
      params: z.object({ id: CommonSchemas.id }) 
    });
    if (!paramsValidation.success || !paramsValidation.data?.params) {
      return createErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Invalid server ID format',
        { requestId }
      );
    }

    const serverId = paramsValidation.data.params.id;

    // サーバーの存在確認
    const serverRepository = new ServerRepository();
    const server = await serverRepository.findById(serverId);

    if (!server) {
      logAPIRequest('POST', `/api/v1/servers/${serverId}/stop`, requestId, {
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

    // サーバーが既に停止中の場合
    if (server.status === 'stopped') {
      logAPIRequest('POST', `/api/v1/servers/${serverId}/stop`, requestId, {
        userId: authResult.session.user.id,
        statusCode: 400,
        error: 'Server already stopped',
      });
      return createErrorResponse(
        ERROR_CODES.SERVER_005,
        'Server is already stopped',
        { requestId }
      );
    }

    // Docker MCPでサーバーを停止
    const dockerClient = new DockerMCPClient();
    let jobResponse;

    try {
      jobResponse = await dockerClient.disableServer(serverId);
    } catch (error) {
      console.error(`[SERVER_STOP_ERROR] Failed to stop server ${serverId}:`, error);
      
      logAPIRequest('POST', `/api/v1/servers/${serverId}/stop`, requestId, {
        userId: authResult.session.user.id,
        statusCode: 500,
        error: error instanceof Error ? error.message : 'Docker MCP error',
      });
      
      return createErrorResponse(
        ERROR_CODES.SERVER_004,
        `Failed to stop server: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { requestId }
      );
    }

    // データベースの状態を更新（楽観的更新）
    try {
      await serverRepository.update(serverId, { status: 'stopped' });
    } catch (dbError) {
      console.warn(`[DB_WARNING] Failed to update server status in database: ${serverId}`, dbError);
      // Docker MCPが成功した場合、DB更新の失敗は警告として扱う
    }

    const duration = Date.now() - startTime;

    // 監査ログ
    logAPIRequest('POST', `/api/v1/servers/${serverId}/stop`, requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: 200,
    });

    const responseData = {
      serverId,
      jobId: jobResponse.id,
      status: jobResponse.status,
      message: jobResponse.message || 'Server stop initiated',
      estimatedDuration: jobResponse.estimatedDuration,
    };

    return createSuccessResponse(responseData, { requestId, duration });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] POST /api/v1/servers/[id]/stop:', error);
    
    logAPIRequest('POST', `/api/v1/servers/${params.id}/stop`, requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to stop server',
      { requestId, details: errorMessage }
    );
  }
}