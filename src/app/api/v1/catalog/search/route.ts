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
// /api/v1/catalog/search - カタログ検索API
// MCPサーバーカタログからサーバーを検索する機能
// =============================================================================

/**
 * カタログ検索クエリのスキーマ
 */
const CatalogSearchQuerySchema = z.object({
  search: z.string().min(1).max(100).optional(),
  tags: z.string().optional().transform((val) => val ? val.split(',').filter(Boolean) : undefined),
  category: z.string().min(1).max(50).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['name', 'popularity', 'updated', 'rating']).default('popularity'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * カタログ検索
 * GET /api/v1/catalog/search
 */
export async function GET(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();

  try {
    // 認証・認可チェック
    const authResult = await requirePermissions([PERMISSIONS.CATALOG_READ], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('GET', '/api/v1/catalog/search', requestId, {
        statusCode: 401,
        error: authResult.error,
      });
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    // クエリパラメータのバリデーション
    const url = new URL(request.url);
    const searchParams = Object.fromEntries(url.searchParams.entries());
    
    const queryValidation = CatalogSearchQuerySchema.safeParse(searchParams);
    if (!queryValidation.success) {
      return createValidationErrorResponse(queryValidation.error, requestId);
    }

    const query = queryValidation.data;

    // カタログクライアントでサーバー検索
    const catalogClient = new CatalogClient();
    const searchResult = await catalogClient.searchServers({
      search: query.search,
      tags: query.tags,
      category: query.category,
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    const duration = Date.now() - startTime;

    // 監査ログ
    logAPIRequest('GET', '/api/v1/catalog/search', requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: 200,
    });

    return Response.json({
      success: true,
      data: searchResult,
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
        duration,
      },
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] GET /api/v1/catalog/search:', error);
    
    logAPIRequest('GET', '/api/v1/catalog/search', requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    // カタログクライアント固有のエラーハンドリング
    if (error instanceof CatalogClientError) {
      switch (error.code) {
        case 'CATALOG_SEARCH_FAILED':
          return createErrorResponse(
            ERROR_CODES.CATALOG_001,
            'Failed to search catalog. The catalog service may be temporarily unavailable.',
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
      'Failed to search catalog',
      { requestId, details: errorMessage }
    );
  }
}