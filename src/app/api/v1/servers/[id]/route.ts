import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  requirePermissions,
  PERMISSIONS,
  validateRequest,
  createErrorResponse,
  createValidationErrorResponse,
  ERROR_CODES,
  logAPIRequest,
} from '@/lib/api/middleware';
import { ServerRepository } from '@/lib/repositories/server-repository';
import { DockerMCPClient } from '@/lib/docker-mcp/client';
import { ServerSchemas, CommonSchemas } from '@/lib/api/schemas';

// =============================================================================
// サーバー管理API - 個別サーバー操作
// =============================================================================

/**
 * GET /api/v1/servers/[id]
 * 特定のサーバーの詳細情報取得
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

    // パラメータバリデーション
    const validation = await validateRequest(request, params, {
      params: z.object({ id: CommonSchemas.id }),
    });

    if (!validation.success) {
      const error = validation.errors!.params!;
      return createValidationErrorResponse(error, requestId);
    }

    const serverId = validation.data!.params.id;

    // サーバーの取得
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

    // 権限チェック - Adminではないユーザーは自分のサーバーのみアクセス可能
    if (authResult.session.user.role !== 'ADMIN' && server.userId !== authResult.session.user.id) {
      logAPIRequest('GET', `/api/v1/servers/${serverId}`, requestId, {
        userId: authResult.session.user.id,
        statusCode: 403,
        error: 'Access denied to server',
      });

      return createErrorResponse(
        ERROR_CODES.FORBIDDEN,
        'You do not have permission to access this server',
        { requestId }
      );
    }

    // Docker MCPから最新ステータスを取得
    const dockerClient = DockerMCPClient.getInstance();
    let containerInfo = null;
    let dockerMetrics = null;

    try {
      containerInfo = await dockerClient.getContainer(server.name);
      dockerMetrics = await dockerClient.getContainerStats(server.name);
    } catch (dockerError) {
      console.warn(`[DOCKER_WARNING] Failed to get container info for ${server.name}:`, dockerError);
      containerInfo = { status: 'not_found' };
    }

    const serverWithStatus = {
      ...server,
      containerStatus: containerInfo,
      metrics: dockerMetrics,
      lastUpdated: new Date().toISOString(),
    };

    const duration = Date.now() - startTime;

    // 監査ログ
    logAPIRequest('GET', `/api/v1/servers/${serverId}`, requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: 200,
      details: {
        serverId,
        serverName: server.name,
        dockerStatus: containerInfo?.status || 'unknown',
      },
    });

    return Response.json({
      success: true,
      data: serverWithStatus,
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
        duration,
      },
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error(`[API_ERROR] GET /api/v1/servers/${params.id}:`, error);
    
    logAPIRequest('GET', `/api/v1/servers/${params.id}`, requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to retrieve server details',
      { requestId }
    );
  }
}

/**
 * PATCH /api/v1/servers/[id]
 * サーバー設定の更新
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();

  try {
    // 認証・認可チェック
    const authResult = await requirePermissions([PERMISSIONS.SERVERS_MANAGE], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('PATCH', `/api/v1/servers/${params.id}`, requestId, {
        statusCode: 401,
        error: authResult.error,
      });
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    // パラメータとボディのバリデーション
    const validation = await validateRequest(request, params, {
      params: z.object({ id: CommonSchemas.id }),
      body: ServerSchemas.update,
    });

    if (!validation.success) {
      const error = validation.errors!.params || validation.errors!.body!;
      return createValidationErrorResponse(error, requestId);
    }

    const serverId = validation.data!.params.id;
    const updateData = validation.data!.body;

    // サーバーの存在確認
    const serverRepository = new ServerRepository();
    const server = await serverRepository.findById(serverId);

    if (!server) {
      logAPIRequest('PATCH', `/api/v1/servers/${serverId}`, requestId, {
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

    // 権限チェック
    if (authResult.session.user.role !== 'ADMIN' && server.userId !== authResult.session.user.id) {
      logAPIRequest('PATCH', `/api/v1/servers/${serverId}`, requestId, {
        userId: authResult.session.user.id,
        statusCode: 403,
        error: 'Access denied to server',
      });

      return createErrorResponse(
        ERROR_CODES.FORBIDDEN,
        'You do not have permission to modify this server',
        { requestId }
      );
    }

    // 名前変更の場合は重複チェック
    if (updateData.name && updateData.name !== server.name) {
      const existingServer = await serverRepository.findByName(updateData.name);
      if (existingServer && existingServer.id !== serverId) {
        logAPIRequest('PATCH', `/api/v1/servers/${serverId}`, requestId, {
          userId: authResult.session.user.id,
          statusCode: 400,
          error: 'Server name already exists',
        });

        return createErrorResponse(
          ERROR_CODES.SERVER_002,
          `Server with name '${updateData.name}' already exists`,
          { requestId }
        );
      }
    }

    // Docker設定の更新が必要かチェック
    const requiresDockerUpdate = !!(
      updateData.image ||
      updateData.port ||
      updateData.env ||
      updateData.volumes ||
      updateData.networks ||
      updateData.healthCheck
    );

    let dockerUpdateResult = null;

    if (requiresDockerUpdate) {
      const dockerClient = DockerMCPClient.getInstance();
      
      try {
        // コンテナが実行中の場合は停止
        const wasRunning = server.status === 'running';
        if (wasRunning) {
          await dockerClient.stopContainer(server.name);
        }

        // コンテナ削除と再作成
        await dockerClient.deleteContainer(server.name);
        
        dockerUpdateResult = await dockerClient.createContainer({
          name: updateData.name || server.name,
          image: updateData.image || server.image,
          ports: updateData.port ? [{ internal: updateData.port, external: updateData.port }] : 
                 server.port ? [{ internal: server.port, external: server.port }] : [],
          environment: updateData.env || server.env || {},
          volumes: updateData.volumes || server.volumes || [],
          networks: updateData.networks || server.networks || [],
          restart: updateData.restart || server.restart || 'unless-stopped',
          healthCheck: updateData.healthCheck || server.healthCheck,
        });

        // 以前実行中だった場合は再起動
        if (wasRunning) {
          await dockerClient.startContainer(updateData.name || server.name);
        }

      } catch (dockerError) {
        console.error(`[DOCKER_UPDATE_ERROR] Failed to update container for ${server.name}:`, dockerError);
        
        const duration = Date.now() - startTime;

        logAPIRequest('PATCH', `/api/v1/servers/${serverId}`, requestId, {
          userId: authResult.session.user.id,
          statusCode: 500,
          error: dockerError instanceof Error ? dockerError.message : 'Container update failed',
          duration,
        });

        return createErrorResponse(
          ERROR_CODES.SERVER_004,
          `Failed to update container: ${dockerError instanceof Error ? dockerError.message : 'Unknown Docker error'}`,
          { requestId }
        );
      }
    }

    // データベースの更新
    const updatedServer = await serverRepository.update(serverId, {
      ...updateData,
      updatedAt: new Date().toISOString(),
    });

    const duration = Date.now() - startTime;

    // 監査ログ
    logAPIRequest('PATCH', `/api/v1/servers/${serverId}`, requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: 200,
      details: {
        serverId,
        updatedFields: Object.keys(updateData),
        dockerUpdateRequired: requiresDockerUpdate,
        dockerUpdateSuccess: dockerUpdateResult !== null,
      },
    });

    return Response.json({
      success: true,
      data: updatedServer,
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
        duration,
        dockerUpdated: requiresDockerUpdate,
      },
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error(`[API_ERROR] PATCH /api/v1/servers/${params.id}:`, error);
    
    logAPIRequest('PATCH', `/api/v1/servers/${params.id}`, requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to update server',
      { requestId }
    );
  }
}

/**
 * DELETE /api/v1/servers/[id]
 * サーバーの削除
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();

  try {
    // 認証・認可チェック
    const authResult = await requirePermissions([PERMISSIONS.SERVERS_MANAGE], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('DELETE', `/api/v1/servers/${params.id}`, requestId, {
        statusCode: 401,
        error: authResult.error,
      });
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    // パラメータバリデーション
    const validation = await validateRequest(request, params, {
      params: z.object({ id: CommonSchemas.id }),
    });

    if (!validation.success) {
      const error = validation.errors!.params!;
      return createValidationErrorResponse(error, requestId);
    }

    const serverId = validation.data!.params.id;

    // サーバーの存在確認
    const serverRepository = new ServerRepository();
    const server = await serverRepository.findById(serverId);

    if (!server) {
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

    // 権限チェック
    if (authResult.session.user.role !== 'ADMIN' && server.userId !== authResult.session.user.id) {
      logAPIRequest('DELETE', `/api/v1/servers/${serverId}`, requestId, {
        userId: authResult.session.user.id,
        statusCode: 403,
        error: 'Access denied to server',
      });

      return createErrorResponse(
        ERROR_CODES.FORBIDDEN,
        'You do not have permission to delete this server',
        { requestId }
      );
    }

    // Dockerコンテナの削除
    const dockerClient = DockerMCPClient.getInstance();
    let dockerDeletionErrors: string[] = [];

    try {
      // コンテナを停止（実行中の場合）
      if (server.status === 'running') {
        try {
          await dockerClient.stopContainer(server.name);
        } catch (stopError) {
          console.warn(`[DOCKER_STOP_WARNING] Failed to stop container ${server.name}:`, stopError);
          dockerDeletionErrors.push(`Stop error: ${stopError instanceof Error ? stopError.message : 'Unknown'}`);
        }
      }

      // コンテナを削除
      await dockerClient.deleteContainer(server.name);

    } catch (dockerError) {
      console.warn(`[DOCKER_DELETE_WARNING] Failed to delete container ${server.name}:`, dockerError);
      dockerDeletionErrors.push(`Delete error: ${dockerError instanceof Error ? dockerError.message : 'Unknown'}`);
      // Dockerエラーは警告レベル（データベースからは削除を継続）
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
      details: {
        serverId,
        serverName: server.name,
        dockerDeletionErrors: dockerDeletionErrors.length > 0 ? dockerDeletionErrors : undefined,
      },
    });

    return new Response(null, { 
      status: 204,
      headers: {
        'X-Request-ID': requestId,
        'X-Response-Time': duration.toString(),
      },
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error(`[API_ERROR] DELETE /api/v1/servers/${params.id}:`, error);
    
    logAPIRequest('DELETE', `/api/v1/servers/${params.id}`, requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to delete server',
      { requestId }
    );
  }
}