import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { 
  createSuccessResponse, 
  createErrorResponse,
  ERROR_CODES
} from '@/lib/api/response';
import { getUserPermissions } from '@/lib/auth/permissions';
import { CatalogClient, CatalogClientError } from '@/lib/catalog/catalog-client';

// /api/v1/catalog/refresh - カタログ更新API

const CatalogRefreshRequestSchema = z.object({
  useDynamicDiscovery: z.boolean().optional().default(true),
  forceUpdate: z.boolean().optional().default(false)
});

/**
 * POST /api/v1/catalog/refresh
 * カタログの強制更新を実行
 */
export async function POST(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  
  try {
    console.log(`[API_REQUEST] POST /api/v1/catalog/refresh (${requestId})`);

    // 認証確認（SKIP_AUTH環境では認証をスキップ）
    if (process.env.NEXT_PUBLIC_SKIP_AUTH === 'true') {
      console.log(`[API_INFO] Authentication skipped due to SKIP_AUTH (${requestId})`);
    } else {
      const session = await getServerSession(authOptions);
      if (!session || !session.user?.id) {
        console.log(`[API_ERROR] Authentication failed (${requestId})`);
        return createErrorResponse(
          ERROR_CODES.UNAUTHORIZED,
          'Authentication required',
          { requestId }
        );
      }
    }

    // SKIP_AUTH環境では権限チェックをスキップ
    if (process.env.NEXT_PUBLIC_SKIP_AUTH !== 'true') {
      const session = await getServerSession(authOptions);
      if (session?.user?.id) {
        const userPermissions = await getUserPermissions(session.user.id);
        if (!userPermissions.admin.catalogRefresh) {
          console.log(`[API_ERROR] Insufficient permissions (${requestId})`);
          return createErrorResponse(
            ERROR_CODES.FORBIDDEN,
            'Insufficient permissions',
            { requestId }
          );
        }
      }
    }

    // リクエストボディの検証
    const body = await request.json().catch(() => ({}));
    const refreshOptions = CatalogRefreshRequestSchema.parse(body);

    const catalogClient = new CatalogClient();
    const refreshResult = await catalogClient.refreshCatalog(refreshOptions);

    console.log(`[API_SUCCESS] Catalog refresh completed (${requestId}):`, refreshResult);

    return createSuccessResponse(refreshResult, {
      message: 'Catalog refresh completed successfully',
      requestId
    });

  } catch (error) {
    console.error('[API_ERROR] POST /api/v1/catalog/refresh:', error);

    if (error instanceof CatalogClientError) {
      return createErrorResponse(
        ERROR_CODES.INTERNAL_ERROR,
        `Catalog refresh failed: ${error.message}`,
        {
          details: error.details,
          requestId
        }
      );
    }

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to refresh catalog',
      { requestId }
    );
  }
}