import { NextRequest } from 'next/server';
import { 
  createSuccessResponse, 
  createErrorResponse,
  ERROR_CODES,
  processPagination,
  processSorting,
  logAPIRequest,
} from '@/lib/api/response';
import {
  validateRequest,
  CatalogSchemas,
  CommonSchemas,
} from '@/lib/api/validation';
import {
  requirePermissions,
  PERMISSIONS,
} from '@/lib/auth';
import { CatalogClient } from '@/lib/docker-mcp';

// =============================================================================
// /api/v1/catalog - カタログAPI
// MCPサーバーカタログの閲覧・検索機能
// =============================================================================

/**
 * カタログエントリ一覧取得
 * GET /api/v1/catalog
 */
export async function GET(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();
  
  try {
    // 認証・認可チェック
    const authResult = await requirePermissions([PERMISSIONS.CATALOG_READ], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('GET', '/api/v1/catalog', requestId, {
        statusCode: 401,
        error: authResult.error,
      });
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    // クエリパラメータのバリデーション
    const querySchema = CommonSchemas.pagination
      .merge(CommonSchemas.sorting)
      .merge(CatalogSchemas.catalogSearch);

    const validation = validateRequest(request, undefined, { query: querySchema });
    if (!validation.success || !validation.data?.query) {
      return createErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Invalid query parameters',
        { requestId }
      );
    }

    const { page, limit } = processPagination(request.nextUrl.searchParams);
    const { sortBy, sortOrder } = processSorting(
      request.nextUrl.searchParams,
      ['name', 'popularity', 'lastUpdated', 'verified'],
      { sortBy: 'popularity', sortOrder: 'desc' }
    );

    const searchParams = validation.data.query;

    // カタログクライアントでエントリを取得
    const catalogClient = new CatalogClient();
    
    try {
      const catalogResult = await catalogClient.listEntries({
        page,
        pageSize: limit,
        category: searchParams.category,
        search: searchParams.query,
        verified: searchParams.verified,
        sortBy: sortBy === 'lastUpdated' ? 'updated' : sortBy,
        sortOrder,
      });

      const duration = Date.now() - startTime;

      // 監査ログ
      logAPIRequest('GET', '/api/v1/catalog', requestId, {
        userId: authResult.session.user.id,
        userRole: authResult.session.user.role,
        duration,
        statusCode: 200,
      });

      return createSuccessResponse(catalogResult.entries, {
        pagination: { 
          page, 
          limit, 
          total: catalogResult.total 
        },
        requestId,
        duration,
      });

    } catch (error) {
      console.error('[CATALOG_ERROR] Failed to fetch catalog entries:', error);
      
      logAPIRequest('GET', '/api/v1/catalog', requestId, {
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
    
    console.error('[API_ERROR] GET /api/v1/catalog:', error);
    
    logAPIRequest('GET', '/api/v1/catalog', requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to retrieve catalog entries',
      { requestId, details: errorMessage }
    );
  }
}