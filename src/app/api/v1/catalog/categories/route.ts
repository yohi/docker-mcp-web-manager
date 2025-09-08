import { NextRequest } from 'next/server';
import { 
  createErrorResponse,
  ERROR_CODES,
  logAPIRequest,
} from '@/lib/api/response';
import {
  requirePermissions,
  PERMISSIONS,
} from '@/lib/auth';
import { CatalogClient, CatalogClientError } from '@/lib/catalog/catalog-client';

// =============================================================================
// /api/v1/catalog/categories - カタログカテゴリAPI
// MCPサーバーカタログのカテゴリ一覧を取得する機能
// =============================================================================

/**
 * カタログカテゴリ一覧取得
 * GET /api/v1/catalog/categories
 */
export async function GET(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();

  try {
    // 認証・認可チェック
    const authResult = await requirePermissions([PERMISSIONS.CATALOG_READ], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('GET', '/api/v1/catalog/categories', requestId, {
        statusCode: 401,
        error: authResult.error,
      });
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    // カタログクライアントでカテゴリ一覧を取得
    const catalogClient = new CatalogClient();
    const categories = await catalogClient.getCategories();

    const duration = Date.now() - startTime;

    // 監査ログ（軽微な操作のためdebugレベル）
    logAPIRequest('GET', '/api/v1/catalog/categories', requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: 200,
    });

    return Response.json({
      success: true,
      data: categories,
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
        duration,
      },
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] GET /api/v1/catalog/categories:', error);
    
    logAPIRequest('GET', '/api/v1/catalog/categories', requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    // カタログクライアント固有のエラーハンドリング
    if (error instanceof CatalogClientError) {
      switch (error.code) {
        case 'CATEGORIES_FAILED':
          return createErrorResponse(
            ERROR_CODES.CATALOG_009,
            'Failed to retrieve categories from catalog',
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
      'Failed to get catalog categories',
      { requestId, details: errorMessage }
    );
  }
}