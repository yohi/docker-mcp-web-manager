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
// サーバー管理API - メインエンドポイント
// =============================================================================

/**
 * GET /api/v1/servers
 * サーバー一覧取得
 */
export async function GET(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();

  try {
    // 認証・認可チェック
    const authResult = await requirePermissions([PERMISSIONS.SERVERS_READ], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('GET', '/api/v1/servers', requestId, {
        statusCode: 401,
        error: authResult.error,
      });
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    // クエリパラメータのバリデーション
    const validation = await validateRequest(request, {}, {
      query: z.object({
        search: z.string().optional(),
        status: z.enum(['all', 'running', 'stopped', 'error', 'pending']).default('all'),
        category: z.string().optional(),
        page: CommonSchemas.pageNumber.default(1),
        limit: CommonSchemas.pageSize.default(20),
        sortBy: z.enum(['name', 'status', 'createdAt', 'updatedAt']).default('updatedAt'),
        sortOrder: z.enum(['asc', 'desc']).default('desc'),
      }),
    });

    if (!validation.success) {
      const error = validation.errors!.query!;
      return createValidationErrorResponse(error, requestId);
    }

    const query = validation.data!.query;
    
    // サーバーリポジトリでデータ取得
    const serverRepository = new ServerRepository();
    const filters = {
      search: query.search,
      status: query.status === 'all' ? undefined : query.status,
      category: query.category,
      userId: authResult.session.user.role === 'ADMIN' ? undefined : authResult.session.user.id,
    };

    const result = await serverRepository.findMany({
      filters,
      pagination: {
        page: query.page,
        limit: query.limit,
      },
      sorting: {
        field: query.sortBy,
        order: query.sortOrder,
      },
    });

    // Docker MCPから現在のステータスを取得してマージ
    const dockerClient = DockerMCPClient.getInstance();
    const serversWithStatus = await Promise.all(
      result.data.map(async (server) => {
        try {
          const containerInfo = await dockerClient.getContainer(server.name);
          return {
            ...server,
            dockerStatus: containerInfo?.status || 'unknown',
            lastSeen: new Date().toISOString(),
          };
        } catch (error) {
          return {
            ...server,
            dockerStatus: 'not_found',
            lastSeen: null,
          };
        }
      })
    );

    const duration = Date.now() - startTime;

    // 監査ログ
    logAPIRequest('GET', '/api/v1/servers', requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: 200,
      details: {
        filters,
        pagination: query,
        resultsCount: serversWithStatus.length,
        totalCount: result.total,
      },
    });

    return Response.json({
      success: true,
      data: serversWithStatus,
      metadata: {
        pagination: {
          page: query.page,
          limit: query.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / query.limit),
        },
        requestId,
        timestamp: new Date().toISOString(),
        duration,
      },
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] GET /api/v1/servers:', error);
    
    logAPIRequest('GET', '/api/v1/servers', requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to retrieve servers',
      { requestId }
    );
  }
}

/**
 * POST /api/v1/servers
 * 新しいサーバーの作成
 */
export async function POST(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();

  try {
    // 認証・認可チェック
    const authResult = await requirePermissions([PERMISSIONS.SERVERS_MANAGE], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('POST', '/api/v1/servers', requestId, {
        statusCode: 401,
        error: authResult.error,
      });
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    // リクエストボディのバリデーション
    const validation = await validateRequest(request, {}, {
      body: ServerSchemas.create,
    });

    if (!validation.success) {
      const error = validation.errors!.body!;
      return createValidationErrorResponse(error, requestId);
    }

    const serverData = validation.data!.body;

    // サーバー名の重複チェック
    const serverRepository = new ServerRepository();
    const existingServer = await serverRepository.findByName(serverData.name);

    if (existingServer) {
      logAPIRequest('POST', '/api/v1/servers', requestId, {
        userId: authResult.session.user.id,
        statusCode: 400,
        error: 'Server name already exists',
      });

      return createErrorResponse(
        ERROR_CODES.SERVER_002,
        `Server with name '${serverData.name}' already exists`,
        { requestId }
      );
    }

    // Docker MCPクライアントでコンテナ作成
    const dockerClient = DockerMCPClient.getInstance();
    
    try {
      // コンテナ作成
      const containerResult = await dockerClient.createContainer({
        name: serverData.name,
        image: serverData.image,
        ports: serverData.port ? [{ internal: serverData.port, external: serverData.port }] : [],
        environment: serverData.env || {},
        volumes: serverData.volumes || [],
        networks: serverData.networks || [],
        restart: serverData.restart || 'unless-stopped',
        healthCheck: serverData.healthCheck,
      });

      // データベースにサーバー情報を保存
      const newServer = await serverRepository.create({
        ...serverData,
        userId: authResult.session.user.id,
        status: 'created',
        containerId: containerResult.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // オプションでコンテナを自動起動
      if (serverData.autoStart !== false) {
        try {
          await dockerClient.startContainer(serverData.name);
          await serverRepository.updateStatus(newServer.id, 'running');
          newServer.status = 'running';
        } catch (startError) {
          console.warn(`[CONTAINER_START_WARNING] Failed to auto-start container ${serverData.name}:`, startError);
          // 起動失敗は警告レベル（コンテナは作成済み）
        }
      }

      const duration = Date.now() - startTime;

      // 監査ログ
      logAPIRequest('POST', '/api/v1/servers', requestId, {
        userId: authResult.session.user.id,
        userRole: authResult.session.user.role,
        duration,
        statusCode: 201,
        details: {
          serverId: newServer.id,
          serverName: newServer.name,
          image: newServer.image,
          autoStart: serverData.autoStart !== false,
          containerCreated: true,
          containerId: containerResult.id,
        },
      });

      return Response.json({
        success: true,
        data: newServer,
        metadata: {
          requestId,
          timestamp: new Date().toISOString(),
          duration,
        },
      }, { status: 201 });

    } catch (dockerError) {
      console.error(`[DOCKER_ERROR] Failed to create container for server ${serverData.name}:`, dockerError);
      
      const duration = Date.now() - startTime;

      logAPIRequest('POST', '/api/v1/servers', requestId, {
        userId: authResult.session.user.id,
        statusCode: 500,
        error: dockerError instanceof Error ? dockerError.message : 'Container creation failed',
        duration,
      });

      return createErrorResponse(
        ERROR_CODES.SERVER_003,
        `Failed to create container: ${dockerError instanceof Error ? dockerError.message : 'Unknown Docker error'}`,
        { requestId }
      );
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] POST /api/v1/servers:', error);
    
    logAPIRequest('POST', '/api/v1/servers', requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to create server',
      { requestId }
    );
  }
}