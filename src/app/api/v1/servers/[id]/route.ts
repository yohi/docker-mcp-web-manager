import { NextRequest } from 'next/server';
import { 
  createSuccessResponse, 
  createErrorResponse, 
  createValidationErrorResponse,
  ERROR_CODES,
  logAPIRequest,
} from '@/lib/api/response';
import {
  validateRequest,
  ServerSchemas,
  CommonSchemas,
} from '@/lib/api/validation';
import {
  getSessionFromRequest,
  requirePermissions,
  PERMISSIONS,
} from '@/lib/auth';
import { ServerRepository } from '@/db/repositories/server-repository';
import { ConfigurationRepository } from '@/db/repositories/configuration-repository';
import { DockerMCPClient } from '@/lib/docker-mcp';
import { z } from 'zod';

// =============================================================================
// /api/v1/servers/[id] - 個別サーバー管理API
// サーバーの詳細取得、更新、削除機能
// =============================================================================

/**
 * サーバー詳細取得
 * GET /api/v1/servers/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();
  
  try {
    // 認証・認可チェック
    const authResult = await requirePermissions([PERMISSIONS.SERVERS_READ], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('GET', `/api/v1/servers/${params.id}`, requestId, {
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
      return createValidationErrorResponse(paramsValidation.errors!.params!, requestId);
    }

    const serverId = paramsValidation.data.params.id;

    // データベースからサーバー情報を取得
    const serverRepository = new ServerRepository();
    const server = await serverRepository.findById(serverId);

    if (!server) {
      logAPIRequest('GET', `/api/v1/servers/${serverId}`, requestId, {
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

    // Docker MCPからリアルタイム詳細情報を取得
    const dockerClient = new DockerMCPClient();
    let enhancedServer = { ...server };

    try {
      const liveDetails = await dockerClient.getServerDetails(serverId);
      enhancedServer = {
        ...server,
        status: liveDetails.status,
        tools: liveDetails.tools,
        resources: liveDetails.resources,
        prompts: liveDetails.prompts || [],
      };
    } catch (error) {
      console.warn(`[SERVER_DETAILS] Failed to get live details for ${serverId}:`, error);
      // Docker MCP接続エラーの場合はDB状態を使用
    }

    const duration = Date.now() - startTime;

    // 監査ログ
    logAPIRequest('GET', `/api/v1/servers/${serverId}`, requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: 200,
    });

    return createSuccessResponse(enhancedServer, { requestId, duration });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] GET /api/v1/servers/[id]:', error);
    
    logAPIRequest('GET', `/api/v1/servers/${params.id}`, requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to retrieve server details',
      { requestId, details: errorMessage }
    );
  }
}

/**
 * サーバー情報更新
 * PUT /api/v1/servers/[id]
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();
  
  try {
    // 認証・認可チェック
    const authResult = await requirePermissions([PERMISSIONS.SERVERS_MANAGE], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('PUT', `/api/v1/servers/${params.id}`, requestId, {
        statusCode: 401,
        error: authResult.error,
      });
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    // パラメータとボディのバリデーション
    const validation = await validateRequest(request, params, {
      params: z.object({ id: CommonSchemas.id }),
      body: ServerSchemas.updateServer,
    });
    if (!validation.success || !validation.data?.params || !validation.data?.body) {
      const error = validation.errors!.params || validation.errors!.body!;
      return createValidationErrorResponse(error, requestId);
    }

    const serverId = validation.data.params.id;
    const updateData = validation.data.body;

    // サーバーの存在確認
    const serverRepository = new ServerRepository();
    const existingServer = await serverRepository.findById(serverId);

    if (!existingServer) {
      logAPIRequest('PUT', `/api/v1/servers/${serverId}`, requestId, {
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

    // 名前変更の場合の重複チェック
    if (updateData.name && updateData.name !== existingServer.name) {
      const duplicateServer = await serverRepository.findByName(updateData.name);
      if (duplicateServer) {
        logAPIRequest('PUT', `/api/v1/servers/${serverId}`, requestId, {
          userId: authResult.session.user.id,
          statusCode: 409,
          error: 'Server name already exists',
        });
        return createErrorResponse(
          ERROR_CODES.SERVER_002,
          `Server with name '${updateData.name}' already exists`,
          { requestId }
        );
      }
    }

    // サーバー情報の更新
    const updatedServer = await serverRepository.update(serverId, {
      name: updateData.name,
      description: updateData.description,
    });

    // 設定情報の更新（将来実装予定）
    if (updateData.configuration) {
      // const configRepository = new ConfigurationRepository();
      // await configRepository.updateByServerId(serverId, {
      //   environment: updateData.configuration.environment,
      //   enabledTools: updateData.configuration.enabledTools,
      //   resourceLimits: updateData.configuration.resourceLimits,
      //   networkConfig: updateData.configuration.networkConfig,
      // });
      console.log('[CONFIG_UPDATE] Configuration update not yet implemented for server:', serverId);
    }

    const duration = Date.now() - startTime;

    // 監査ログ
    logAPIRequest('PUT', `/api/v1/servers/${serverId}`, requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: 200,
    });

    return createSuccessResponse(updatedServer, { requestId, duration });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] PUT /api/v1/servers/[id]:', error);
    
    logAPIRequest('PUT', `/api/v1/servers/${params.id}`, requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to update server',
      { requestId, details: errorMessage }
    );
  }
}

/**
 * サーバー削除
 * DELETE /api/v1/servers/[id]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();
  
  try {
    // 認証・認可チェック
    const authResult = await requirePermissions([PERMISSIONS.SERVERS_DELETE], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('DELETE', `/api/v1/servers/${params.id}`, requestId, {
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
      return createValidationErrorResponse(paramsValidation.errors!.params!, requestId);
    }

    const serverId = paramsValidation.data.params.id;

    // サーバーの存在確認
    const serverRepository = new ServerRepository();
    const existingServer = await serverRepository.findById(serverId);

    if (!existingServer) {
      logAPIRequest('DELETE', `/api/v1/servers/${serverId}`, requestId, {
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

    // サーバーが実行中の場合は削除を拒否
    if (existingServer.status === 'running') {
      logAPIRequest('DELETE', `/api/v1/servers/${serverId}`, requestId, {
        userId: authResult.session.user.id,
        statusCode: 400,
        error: 'Server is running',
      });
      return createErrorResponse(
        ERROR_CODES.SERVER_005,
        'Cannot delete running server. Stop the server first.',
        { requestId }
      );
    }

    // Docker MCPでサーバーを停止・削除
    const dockerClient = new DockerMCPClient();
    try {
      await dockerClient.disableServer(serverId);
      console.log(`[SERVER_DISABLED] Server disabled via Docker MCP: ${serverId}`);
    } catch (error) {
      console.warn(`[SERVER_WARNING] Failed to disable server via Docker MCP: ${serverId}`, error);
      // Docker MCP エラーは警告として扱い、データベース削除は継続
    }

    // データベースからサーバーを削除
    await serverRepository.delete(serverId);

    const duration = Date.now() - startTime;

    // 監査ログ
    logAPIRequest('DELETE', `/api/v1/servers/${serverId}`, requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: 204,
    });

    return new Response(null, { status: 204 });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] DELETE /api/v1/servers/[id]:', error);
    
    logAPIRequest('DELETE', `/api/v1/servers/${params.id}`, requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to delete server',
      { requestId, details: errorMessage }
    );
  }
}