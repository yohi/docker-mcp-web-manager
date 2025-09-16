import { NextRequest } from 'next/server';
import { 
  createSuccessResponse, 
  createErrorResponse,
  ERROR_CODES,
  logAPIRequest,
} from '@/lib/api/response';
import {
  requirePermissions,
  PERMISSIONS,
} from '@/lib/auth';
import { CatalogClient } from '@/lib/catalog/catalog-client';

// =============================================================================
// /api/v1/catalog/[serverId] - カタログサーバー詳細API
// MCPサーバーの詳細情報取得
// =============================================================================

/**
 * サーバー詳細取得
 * GET /api/v1/catalog/[serverId]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { serverId: string } }
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();
  
  try {
    // 開発環境では認証をバイパス
    let authResult: any = null;
    if (process.env.NODE_ENV === 'development') {
      // 開発環境用のモックセッション
      authResult = {
        valid: true,
        session: {
          user: {
            id: 'dev-user',
            role: 'admin'
          }
        }
      };
    } else {
      // 認証・認可チェック
      authResult = await requirePermissions([PERMISSIONS.CATALOG_READ], request);
      if (!authResult.valid || !authResult.session) {
        logAPIRequest('GET', `/api/v1/catalog/${params.serverId}`, requestId, {
          statusCode: 401,
          error: authResult.error,
        });
        return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
      }
    }

    const serverId = decodeURIComponent(params.serverId);
    console.log(`[API_DEBUG] Getting server details for: ${serverId}`);

    // カタログクライアントでサーバー詳細を取得
    const catalogClient = new CatalogClient();
    
    try {
      const serverDetails = await catalogClient.getServerDetails(serverId);

      const duration = Date.now() - startTime;

      // 監査ログ
      logAPIRequest('GET', `/api/v1/catalog/${serverId}`, requestId, {
        userId: authResult.session.user.id,
        userRole: authResult.session.user.role,
        duration,
        statusCode: 200,
      });

      return createSuccessResponse(serverDetails, {
        requestId,
        duration,
      });

    } catch (error) {
      console.error('[CATALOG_ERROR] Failed to fetch server details:', error);
      
      const statusCode = error instanceof Error && error.message.includes('not found') ? 404 : 503;
      
      logAPIRequest('GET', `/api/v1/catalog/${serverId}`, requestId, {
        userId: authResult.session.user.id,
        statusCode,
        error: error instanceof Error ? error.message : 'Server details fetch error',
      });
      
      return createErrorResponse(
        statusCode === 404 ? ERROR_CODES.NOT_FOUND : ERROR_CODES.CATALOG_001,
        statusCode === 404 ? 'Server not found in catalog' : 'Catalog service is currently unavailable',
        { requestId, details: error instanceof Error ? error.message : 'Unknown error' }
      );
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] GET /api/v1/catalog/[serverId]:', error);
    
    logAPIRequest('GET', `/api/v1/catalog/${params.serverId}`, requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to retrieve server details',
      { requestId, details: errorMessage }
    );
  }
}