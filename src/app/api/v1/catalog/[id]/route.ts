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
// /api/v1/catalog/[id] - カタログサーバー詳細API
// MCPサーバーカタログから特定のサーバー詳細を取得する機能
// =============================================================================

/**
 * サーバー詳細取得
 * GET /api/v1/catalog/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();

  try {
    // 認証・認可チェック
    const authResult = await requirePermissions([PERMISSIONS.CATALOG_READ], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('GET', `/api/v1/catalog/${params.id}`, requestId, {
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

    // カタログクライアントでサーバー詳細を取得
    const catalogClient = new CatalogClient();
    const serverDetails = await catalogClient.getServerDetails(serverId);

    const duration = Date.now() - startTime;

    // 監査ログ
    logAPIRequest('GET', `/api/v1/catalog/${serverId}`, requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: 200,
      details: {
        serverId,
        serverName: serverDetails.name,
        version: serverDetails.version,
      },
    });

    return Response.json({
      success: true,
      data: serverDetails,
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
        duration,
      },
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error(`[API_ERROR] GET /api/v1/catalog/${params.id}:`, error);
    
    logAPIRequest('GET', `/api/v1/catalog/${params.id}`, requestId, {
      duration,
      statusCode: error instanceof CatalogClientError && error.code === 'SERVER_NOT_FOUND' ? 404 : 500,
      error: errorMessage,
    });

    // カタログクライアント固有のエラーハンドリング
    if (error instanceof CatalogClientError) {
      switch (error.code) {
        case 'SERVER_NOT_FOUND':
          return createErrorResponse(
            ERROR_CODES.CATALOG_003,
            `Server '${params.id}' not found in catalog`,
            { requestId }
          );
        
        case 'SERVER_DETAILS_FAILED':
          return createErrorResponse(
            ERROR_CODES.CATALOG_004,
            'Failed to retrieve server details from catalog',
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
      'Failed to get server details',
      { requestId, details: errorMessage }
    );
  }
}