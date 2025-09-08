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
} from '@/lib/api/validation';
import {
  requirePermissions,
  PERMISSIONS,
} from '@/lib/auth';
import { CatalogClient, CatalogClientError } from '@/lib/catalog/catalog-client';
import { z } from 'zod';

// =============================================================================
// /api/v1/catalog/install - サーバーインストールAPI
// MCPサーバーカタログからサーバーをインストールする機能
// =============================================================================

/**
 * サーバーインストールリクエストのスキーマ
 */
const InstallRequestSchema = z.object({
  serverId: CommonSchemas.id,
  name: z.string().min(1).max(100).optional(),
  version: z.string().min(1).max(20).optional(),
  config: z.record(z.any()).optional(),
  secrets: z.record(z.string()).optional(),
});

/**
 * サーバーインストール
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
    const validation = await validateRequest(request, {}, {
      body: InstallRequestSchema,
    });
    if (!validation.success) {
      const error = validation.errors!.body!;
      return createValidationErrorResponse(error, requestId);
    }

    const { serverId, name, version, config, secrets } = validation.data!.body;

    // カタログクライアントでサーバーをインストール
    const catalogClient = new CatalogClient();
    const installationId = await catalogClient.installServer(serverId, {
      name,
      version,
      config,
      secrets,
    });

    const duration = Date.now() - startTime;

    // 監査ログ
    logAPIRequest('POST', '/api/v1/catalog/install', requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: 202,
      details: {
        serverId,
        installationId,
        customName: name,
        version,
        hasConfig: !!config,
        hasSecrets: !!secrets,
      },
    });

    // 非同期処理のため202 Acceptedを返す
    return Response.json({
      success: true,
      data: {
        installationId,
        serverId,
        status: 'pending',
        message: 'Server installation started successfully',
      },
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
        duration,
      },
    }, { status: 202 });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] POST /api/v1/catalog/install:', error);
    
    logAPIRequest('POST', '/api/v1/catalog/install', requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    // カタログクライアント固有のエラーハンドリング
    if (error instanceof CatalogClientError) {
      switch (error.code) {
        case 'SERVER_NOT_FOUND':
          return createErrorResponse(
            ERROR_CODES.CATALOG_003,
            `Server not found in catalog`,
            { requestId }
          );
        
        case 'SERVER_INSTALL_FAILED':
          return createErrorResponse(
            ERROR_CODES.CATALOG_005,
            'Server installation failed',
            { requestId, details: error.details }
          );
        
        case 'INSTALL_ID_MISSING':
          return createErrorResponse(
            ERROR_CODES.CATALOG_006,
            'Installation started but tracking failed',
            { requestId, details: error.details }
          );
        
        default:
          return createErrorResponse(
            ERROR_CODES.CATALOG_002,
            `Catalog operation failed: ${error.message}`,
            { requestId, details: error.details }
          );
      }
    }

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to install server',
      { requestId, details: errorMessage }
    );
  }
}