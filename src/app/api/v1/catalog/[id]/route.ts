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
import { CatalogClient } from '@/lib/docker-mcp';
import { z } from 'zod';

// =============================================================================
// /api/v1/catalog/[id] - カタログエントリ詳細API
// 特定のカタログエントリの詳細情報取得
// =============================================================================

/**
 * カタログエントリ詳細取得
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

    // パスパラメータのバリデーション
    const paramsValidation = validateRequest(request, params, { 
      params: z.object({ id: CommonSchemas.id }) 
    });
    if (!paramsValidation.success || !paramsValidation.data?.params) {
      return createErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Invalid catalog entry ID format',
        { requestId }
      );
    }

    const entryId = paramsValidation.data.params.id;

    // カタログクライアントでエントリ詳細を取得
    const catalogClient = new CatalogClient();
    
    try {
      const serverInfo = await catalogClient.getServerInfo(entryId);

      const duration = Date.now() - startTime;

      // 監査ログ
      logAPIRequest('GET', `/api/v1/catalog/${entryId}`, requestId, {
        userId: authResult.session.user.id,
        userRole: authResult.session.user.role,
        duration,
        statusCode: 200,
      });

      return createSuccessResponse(serverInfo, { requestId, duration });

    } catch (error) {
      console.error(`[CATALOG_ERROR] Failed to fetch catalog entry ${entryId}:`, error);
      
      // エラーの種類による分岐
      if (error && typeof error === 'object' && 'code' in error) {
        const commandError = error as any;
        if (commandError.code === 'RESOURCE_NOT_FOUND') {
          logAPIRequest('GET', `/api/v1/catalog/${entryId}`, requestId, {
            userId: authResult.session.user.id,
            statusCode: 404,
            error: 'Catalog entry not found',
          });
          
          return createErrorResponse(
            ERROR_CODES.CATALOG_002,
            `Catalog entry with ID '${entryId}' not found`,
            { requestId }
          );
        }
      }
      
      logAPIRequest('GET', `/api/v1/catalog/${entryId}`, requestId, {
        userId: authResult.session.user.id,
        statusCode: 503,
        error: error instanceof Error ? error.message : 'Catalog service error',
      });
      
      return createErrorResponse(
        ERROR_CODES.CATALOG_001,
        'Catalog service is currently unavailable',
        { requestId, details: error instanceof Error ? error.message : 'Unknown error' }
      );
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] GET /api/v1/catalog/[id]:', error);
    
    logAPIRequest('GET', `/api/v1/catalog/${params.id}`, requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to retrieve catalog entry details',
      { requestId, details: errorMessage }
    );
  }
}