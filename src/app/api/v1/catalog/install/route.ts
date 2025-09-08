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
  CatalogSchemas,
} from '@/lib/api/validation';
import {
  requirePermissions,
  PERMISSIONS,
} from '@/lib/auth';
import { CatalogClient } from '@/lib/docker-mcp';
import { ServerRepository } from '@/db/repositories/server-repository';
import { JobRepository } from '@/db/repositories/job-repository';

// =============================================================================
// /api/v1/catalog/install - カタログからのサーバーインストールAPI
// カタログエントリからのサーバーインストール機能
// =============================================================================

/**
 * カタログからサーバーインストール
 * POST /api/v1/catalog/install
 */
export async function POST(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();
  
  try {
    // 認証・認可チェック
    const authResult = await requirePermissions([PERMISSIONS.CATALOG_INSTALL], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('POST', '/api/v1/catalog/install', requestId, {
        statusCode: 401,
        error: authResult.error,
      });
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    // リクエストボディのバリデーション
    const validation = await validateRequest(request, undefined, { 
      body: CatalogSchemas.installServer 
    });
    if (!validation.success || !validation.data?.body) {
      return createValidationErrorResponse(validation.errors!.body!, requestId);
    }

    const installData = validation.data.body;

    // サーバー名の重複チェック
    const serverRepository = new ServerRepository();
    const existingServer = await serverRepository.findByName(installData.name);
    if (existingServer) {
      logAPIRequest('POST', '/api/v1/catalog/install', requestId, {
        userId: authResult.session.user.id,
        statusCode: 409,
        error: 'Server name already exists',
      });
      return createErrorResponse(
        ERROR_CODES.CATALOG_005,
        `Server with name '${installData.name}' already exists`,
        { requestId }
      );
    }

    // カタログエントリの存在確認
    const catalogClient = new CatalogClient();
    let serverInfo;
    
    try {
      serverInfo = await catalogClient.getServerInfo(installData.entryId);
    } catch (error) {
      console.error(`[CATALOG_ERROR] Failed to fetch catalog entry ${installData.entryId}:`, error);
      
      logAPIRequest('POST', '/api/v1/catalog/install', requestId, {
        userId: authResult.session.user.id,
        statusCode: 404,
        error: 'Catalog entry not found',
      });
      
      return createErrorResponse(
        ERROR_CODES.CATALOG_002,
        `Catalog entry with ID '${installData.entryId}' not found`,
        { requestId }
      );
    }

    // インストールジョブの作成（データベースに記録）
    const jobRepository = new JobRepository();
    const installJob = await jobRepository.create({
      type: 'install',
      status: 'pending',
      target: {
        type: 'catalog',
        id: installData.entryId,
      },
      progress: {
        current: 0,
        total: 100,
        message: 'Installation queued',
      },
    });

    // カタログクライアントでインストール開始
    let installResult;
    
    try {
      installResult = await catalogClient.installServer(installData.entryId, {
        name: installData.name,
        environment: installData.environment,
        resourceLimits: installData.resourceLimits,
        networkConfig: installData.networkConfig,
      });

      // ジョブステータスの更新
      await jobRepository.update(installJob.id, {
        status: 'running',
        progress: {
          current: 10,
          total: 100,
          message: 'Installation started',
        },
      });

    } catch (error) {
      console.error(`[INSTALL_ERROR] Failed to start installation for ${installData.entryId}:`, error);
      
      // ジョブステータスの更新
      await jobRepository.update(installJob.id, {
        status: 'failed',
        error: {
          code: ERROR_CODES.CATALOG_003,
          message: error instanceof Error ? error.message : 'Installation failed',
          details: error,
        },
      });
      
      logAPIRequest('POST', '/api/v1/catalog/install', requestId, {
        userId: authResult.session.user.id,
        statusCode: 500,
        error: error instanceof Error ? error.message : 'Installation failed',
      });
      
      return createErrorResponse(
        ERROR_CODES.CATALOG_003,
        `Installation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { requestId }
      );
    }

    // データベースにサーバー情報を事前登録
    const newServer = await serverRepository.create({
      name: installData.name,
      image: serverInfo.image,
      status: 'stopped', // インストール完了まで停止状態
      description: serverInfo.description,
    });

    const duration = Date.now() - startTime;

    // 監査ログ
    logAPIRequest('POST', '/api/v1/catalog/install', requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: 202,
    });

    const responseData = {
      jobId: installJob.id,
      serverId: newServer.id,
      serverName: installData.name,
      catalogEntryId: installData.entryId,
      status: 'running',
      message: 'Installation started successfully',
      estimatedDuration: serverInfo.installMetadata?.installationTime,
      progress: {
        current: 10,
        total: 100,
        message: 'Installation in progress',
      },
    };

    return createSuccessResponse(responseData, { 
      requestId, 
      duration 
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] POST /api/v1/catalog/install:', error);
    
    logAPIRequest('POST', '/api/v1/catalog/install', requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to start server installation',
      { requestId, details: errorMessage }
    );
  }
}