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
// /api/v1/catalog/install/[id] - インストール進捗取得API
// サーバーインストールの進捗状況を取得する機能
// =============================================================================

/**
 * インストール進捗取得
 * GET /api/v1/catalog/install/[id]
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
      logAPIRequest('GET', `/api/v1/catalog/install/${params.id}`, requestId, {
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

    const installationId = validation.data?.params?.id;
    if (!installationId) {
      return createErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Invalid installation ID',
        { requestId }
      );
    }

    // カタログクライアントでインストール進捗を取得
    const catalogClient = new CatalogClient();
    const progress = await catalogClient.getInstallationProgress(installationId);

    const duration = Date.now() - startTime;

    // 監査ログ（完了時のみ記録）
    if (progress.status === 'completed' || progress.status === 'failed') {
      logAPIRequest('GET', `/api/v1/catalog/install/${installationId}`, requestId, {
        userId: authResult.session.user.id,
        userRole: authResult.session.user.role,
        duration,
        statusCode: 200,
      });
    }

    return Response.json({
      success: true,
      data: progress,
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
        duration,
      },
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error(`[API_ERROR] GET /api/v1/catalog/install/${params.id}:`, error);
    
    logAPIRequest('GET', `/api/v1/catalog/install/${params.id}`, requestId, {
      duration,
      statusCode: error instanceof CatalogClientError && error.code === 'INSTALLATION_NOT_FOUND' ? 404 : 500,
      error: errorMessage,
    });

    // カタログクライアント固有のエラーハンドリング
    if (error instanceof CatalogClientError) {
      switch (error.code) {
        case 'INSTALLATION_NOT_FOUND':
          return createErrorResponse(
            ERROR_CODES.CATALOG_007,
            `Installation '${params.id}' not found`,
            { requestId }
          );
        
        case 'INSTALL_PROGRESS_FAILED':
          return createErrorResponse(
            ERROR_CODES.CATALOG_008,
            'Failed to retrieve installation progress',
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
      'Failed to get installation progress',
      { requestId, details: errorMessage }
    );
  }
}