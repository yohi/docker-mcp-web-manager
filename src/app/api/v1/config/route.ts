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
  ConfigSchemas,
} from '@/lib/api/validation';
import {
  requirePermissions,
  PERMISSIONS,
} from '@/lib/auth';
import { ConfigRepository } from '@/db/repositories/config-repository';
import { z } from 'zod';

// =============================================================================
// /api/v1/config - システム設定API
// システム全体の設定管理機能
// =============================================================================

/**
 * 設定一覧取得
 * GET /api/v1/config
 */
export async function GET(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();
  
  try {
    // 認証・認可チェック
    const authResult = await requirePermissions([PERMISSIONS.CONFIG_READ], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('GET', '/api/v1/config', requestId, {
        statusCode: 401,
        error: authResult.error,
      });
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    // クエリパラメータのバリデーション（オプション）
    const validation = await validateRequest(request, undefined, {
      query: z.object({
        category: z.string().optional(),
        search: z.string().optional()
      }),
    });
    if (!validation.success) {
      return createValidationErrorResponse(validation.errors!.query!, requestId);
    }

    const queryParams = validation.data?.query;

    // 設定リポジトリから設定を取得
    const configRepository = new ConfigRepository();
    let configs;

    try {
      if (queryParams?.category) {
        configs = await configRepository.findByCategory(queryParams.category);
      } else {
        configs = await configRepository.findAll();
      }
    } catch (error) {
      console.error('[CONFIG_ERROR] Failed to fetch configurations:', error);
      
      logAPIRequest('GET', '/api/v1/config', requestId, {
        userId: authResult.session.user.id,
        statusCode: 500,
        error: error instanceof Error ? error.message : 'Database error',
      });
      
      return createErrorResponse(
        ERROR_CODES.CONFIG_001,
        'Failed to retrieve system configuration',
        { requestId, details: error instanceof Error ? error.message : 'Unknown error' }
      );
    }

    const duration = Date.now() - startTime;

    // 監査ログ
    logAPIRequest('GET', '/api/v1/config', requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: 200,
    });

    const responseData = {
      configurations: configs,
      totalCount: configs.length,
      category: queryParams?.category,
      timestamp: new Date().toISOString(),
    };

    return createSuccessResponse(responseData, { requestId, duration });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] GET /api/v1/config:', error);
    
    logAPIRequest('GET', '/api/v1/config', requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to retrieve system configuration',
      { requestId, details: errorMessage }
    );
  }
}

/**
 * 設定更新
 * PUT /api/v1/config
 */
export async function PUT(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();
  
  try {
    // 認証・認可チェック（管理者権限が必要）
    const authResult = await requirePermissions([PERMISSIONS.ADMIN_ALL], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('PUT', '/api/v1/config', requestId, {
        statusCode: 401,
        error: authResult.error,
      });
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    // リクエストボディのバリデーション
    const validation = await validateRequest(request, undefined, {
      body: ConfigSchemas.updateConfig,
    });
    if (!validation.success || !validation.data?.body) {
      return createValidationErrorResponse(validation.errors!.body!, requestId);
    }

    const configUpdates = validation.data.body;

    // 設定リポジトリで更新処理
    const configRepository = new ConfigRepository();
    let updatedConfigs;

    try {
      // トランザクション内で複数設定を更新
      updatedConfigs = await configRepository.updateMultiple(
        configUpdates.configurations.map(config => ({
          key: config.key,
          value: config.value,
          category: config.category,
        }))
      );
    } catch (error) {
      console.error('[CONFIG_UPDATE_ERROR] Failed to update configurations:', error);
      
      // エラーの種類による分岐
      if (error && typeof error === 'object' && 'code' in error) {
        const dbError = error as any;
        
        if (dbError.code === 'CONFIG_NOT_FOUND') {
          logAPIRequest('PUT', '/api/v1/config', requestId, {
            userId: authResult.session.user.id,
            statusCode: 404,
            error: 'Configuration key not found',
          });
          
          return createErrorResponse(
            ERROR_CODES.CONFIG_002,
            `Configuration key not found: ${dbError.key}`,
            { requestId }
          );
        }
        
        if (dbError.code === 'CONFIG_VALIDATION_ERROR') {
          logAPIRequest('PUT', '/api/v1/config', requestId, {
            userId: authResult.session.user.id,
            statusCode: 400,
            error: 'Invalid configuration value',
          });
          
          return createErrorResponse(
            ERROR_CODES.CONFIG_003,
            `Invalid configuration value: ${dbError.message}`,
            { requestId }
          );
        }
      }
      
      logAPIRequest('PUT', '/api/v1/config', requestId, {
        userId: authResult.session.user.id,
        statusCode: 500,
        error: error instanceof Error ? error.message : 'Configuration update failed',
      });
      
      return createErrorResponse(
        ERROR_CODES.CONFIG_001,
        `Failed to update configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { requestId }
      );
    }

    const duration = Date.now() - startTime;

    // 監査ログ
    logAPIRequest('PUT', '/api/v1/config', requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: 200,
    });

    const responseData = {
      configurations: updatedConfigs,
      updatedCount: updatedConfigs.length,
      timestamp: new Date().toISOString(),
      message: 'Configuration updated successfully',
    };

    return createSuccessResponse(responseData, { requestId, duration });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] PUT /api/v1/config:', error);
    
    logAPIRequest('PUT', '/api/v1/config', requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to update system configuration',
      { requestId, details: errorMessage }
    );
  }
}