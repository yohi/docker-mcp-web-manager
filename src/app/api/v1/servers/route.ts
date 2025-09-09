import { NextRequest } from 'next/server';
import { 
  createSuccessResponse, 
  createErrorResponse, 
  createValidationErrorResponse,
  ERROR_CODES,
  processPagination,
  processSorting,
  processFilters,
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
// /api/v1/servers - サーバー管理API
// サーバーの一覧取得、作成、検索機能
// =============================================================================

/**
 * サーバー一覧取得
 * GET /api/v1/servers
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
    const querySchema = CommonSchemas.pagination
      .merge(CommonSchemas.sorting)
      .merge(ServerSchemas.serverFilters);

    const validation = await validateRequest(request, undefined, { query: querySchema });
    if (!validation.success || !validation.data?.query) {
      return createValidationErrorResponse(validation.errors!.query!, requestId);
    }

    const { page, limit } = processPagination(request.nextUrl.searchParams);
    const { sortBy, sortOrder } = processSorting(
      request.nextUrl.searchParams,
      ['name', 'status', 'createdAt', 'updatedAt'],
      { sortBy: 'updatedAt', sortOrder: 'desc' }
    );
    const filters = processFilters(
      request.nextUrl.searchParams,
      ['status', 'name', 'image']
    );

    // データベースからサーバー一覧を取得（将来実装予定）
    // const serverRepository = new ServerRepository();
    // const { servers, total } = await serverRepository.findMany({
    //   page,
    //   limit,
    //   sortBy,
    //   sortOrder,
    //   filters,
    // });
    // 一時的なモックデータ
    const servers: any[] = [];
    const total = 0;

    // Docker MCPクライアントからリアルタイム状態を取得
    const dockerClient = new DockerMCPClient();
    const enhancedServers = await Promise.all(
      servers.map(async (server) => {
        try {
          // リアルタイム状態の取得
          const liveStatus = await dockerClient.getServerDetails(server.id);
          return {
            ...server,
            status: liveStatus.status, // リアルタイム状態で上書き
            tools: liveStatus.tools,
            resources: liveStatus.resources,
          };
        } catch (error) {
          // Docker MCP接続エラーの場合はDB状態を維持
          console.warn(`[SERVER_STATUS] Failed to get live status for ${server.id}:`, error);
          return server;
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
    });

    return createSuccessResponse(enhancedServers, {
      pagination: { page, limit, total },
      requestId,
      duration,
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
      { requestId, details: errorMessage }
    );
  }
}

/**
 * サーバー作成
 * POST /api/v1/servers
 */
export async function POST(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();
  
  try {
    // 認証・認可チェック
    const authResult = await requirePermissions([PERMISSIONS.SERVERS_CREATE], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('POST', '/api/v1/servers', requestId, {
        statusCode: 401,
        error: authResult.error,
      });
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    // リクエストボディのバリデーション
    const validation = await validateRequest(request, undefined, { 
      body: ServerSchemas.createServer 
    });
    if (!validation.success || !validation.data?.body) {
      return createValidationErrorResponse(validation.errors!.body!, requestId);
    }

    const serverData = validation.data.body;

    // 名前の重複チェック
    const serverRepository = new ServerRepository();
    const existingServer = await serverRepository.findByName(serverData.name);
    if (existingServer) {
      logAPIRequest('POST', '/api/v1/servers', requestId, {
        userId: authResult.session.user.id,
        statusCode: 409,
        error: 'Server name already exists',
      });
      return createErrorResponse(
        ERROR_CODES.SERVER_002,
        `Server with name '${serverData.name}' already exists`,
        { requestId }
      );
    }

    // サーバーの作成
    const newServer = await serverRepository.create({
      name: serverData.name,
      image: serverData.image,
      status: 'stopped',
      description: serverData.description,
    });

    // 設定情報の作成（将来実装予定）
    if (serverData.configuration) {
      // const configRepository = new ConfigurationRepository();
      // await configRepository.create({
      //   serverId: newServer.id,
      //   environment: serverData.configuration.environment || {},
      //   enabledTools: serverData.configuration.enabledTools || [],
      //   resourceLimits: serverData.configuration.resourceLimits || {},
      //   networkConfig: serverData.configuration.networkConfig || { mode: 'bridge' },
      // });
      console.log('[CONFIG_CREATE] Configuration creation not yet implemented for server:', newServer.id);
    }

    // Docker MCPでサーバーをインストール
    const dockerClient = new DockerMCPClient();
    try {
      // ここでは作成のみで、実際のインストールは別途カタログAPIで実行
      console.log(`[SERVER_CREATED] New server created: ${newServer.id}`);
    } catch (error) {
      console.warn('[SERVER_WARNING] Docker MCP integration failed:', error);
    }

    const duration = Date.now() - startTime;

    // 監査ログ
    logAPIRequest('POST', '/api/v1/servers', requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: 201,
    });

    return createSuccessResponse(newServer, { requestId, duration });

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
      { requestId, details: errorMessage }
    );
  }
}