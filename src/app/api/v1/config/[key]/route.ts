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
  CommonSchemas,
  ConfigSchemas,
} from '@/lib/api/validation';
import {
  requirePermissions,
  PERMISSIONS,
} from '@/lib/auth';
import { ConfigRepository } from '@/db/repositories/config-repository';
import { z } from 'zod';

// =============================================================================
// /api/v1/config/[key] - 個別設定管理API
// 特定の設定キーに対する操作
// =============================================================================

/**
 * 設定詳細取得
 * GET /api/v1/config/[key]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { key: string } }
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();
  
  try {
    // 認証・認可チェック
    const authResult = await requirePermissions([PERMISSIONS.CONFIG_READ], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('GET', `/api/v1/config/${params.key}`, requestId, {
        statusCode: 401,
        error: authResult.error,
      });
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    // パスパラメータのバリデーション
    const paramsValidation = validateRequest(request, params, {
      params: z.object({ key: CommonSchemas.configKey }),
    });
    if (!paramsValidation.success || !paramsValidation.data?.params) {
      return createErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Invalid configuration key format',
        { requestId }
      );
    }

    const configKey = paramsValidation.data.params.key;

    // 設定リポジトリから設定を取得
    const configRepository = new ConfigRepository();
    let config;

    try {
      config = await configRepository.findByKey(configKey);
    } catch (error) {
      console.error(`[CONFIG_ERROR] Failed to fetch configuration ${configKey}:`, error);
      
      logAPIRequest('GET', `/api/v1/config/${configKey}`, requestId, {
        userId: authResult.session.user.id,
        statusCode: 500,
        error: error instanceof Error ? error.message : 'Database error',
      });
      
      return createErrorResponse(
        ERROR_CODES.CONFIG_001,
        'Failed to retrieve configuration',
        { requestId, details: error instanceof Error ? error.message : 'Unknown error' }
      );
    }

    if (!config) {
      logAPIRequest('GET', `/api/v1/config/${configKey}`, requestId, {
        userId: authResult.session.user.id,
        statusCode: 404,
        error: 'Configuration not found',
      });
      
      return createErrorResponse(
        ERROR_CODES.CONFIG_002,
        `Configuration with key '${configKey}' not found`,
        { requestId }
      );
    }

    const duration = Date.now() - startTime;

    // 監査ログ
    logAPIRequest('GET', `/api/v1/config/${configKey}`, requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: 200,
    });

    return createSuccessResponse(config, { requestId, duration });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] GET /api/v1/config/[key]:', error);
    
    logAPIRequest('GET', `/api/v1/config/${params.key}`, requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to retrieve configuration',
      { requestId, details: errorMessage }
    );
  }
}

/**
 * 設定更新
 * PUT /api/v1/config/[key]
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { key: string } }
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();
  
  try {
    // 認証・認可チェック（管理者権限が必要）
    const authResult = await requirePermissions([PERMISSIONS.CONFIG_WRITE], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('PUT', `/api/v1/config/${params.key}`, requestId, {
        statusCode: 401,
        error: authResult.error,
      });
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    // パラメータとボディのバリデーション
    const validation = await validateRequest(request, params, {
      params: z.object({ key: CommonSchemas.configKey }),
      body: ConfigSchemas.updateSingleConfig,
    });
    if (!validation.success) {
      const error = validation.errors!.params || validation.errors!.body!;
      return createValidationErrorResponse(error, requestId);
    }

    const configKey = validation.data!.params.key;
    const configUpdate = validation.data!.body;

    // 設定リポジトリで更新処理
    const configRepository = new ConfigRepository();
    let updatedConfig;

    try {
      updatedConfig = await configRepository.update(configKey, {
        value: configUpdate.value,
        description: configUpdate.description,
      });
    } catch (error) {
      console.error(`[CONFIG_UPDATE_ERROR] Failed to update configuration ${configKey}:`, error);
      
      // エラーの種類による分岐
      if (error && typeof error === 'object' && 'code' in error) {
        const dbError = error as any;
        
        if (dbError.code === 'CONFIG_NOT_FOUND') {
          logAPIRequest('PUT', `/api/v1/config/${configKey}`, requestId, {
            userId: authResult.session.user.id,
            statusCode: 404,
            error: 'Configuration key not found',
          });
          
          return createErrorResponse(
            ERROR_CODES.CONFIG_002,
            `Configuration with key '${configKey}' not found`,
            { requestId }
          );
        }
        
        if (dbError.code === 'CONFIG_VALIDATION_ERROR') {
          logAPIRequest('PUT', `/api/v1/config/${configKey}`, requestId, {
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
        
        if (dbError.code === 'CONFIG_READ_ONLY') {
          logAPIRequest('PUT', `/api/v1/config/${configKey}`, requestId, {
            userId: authResult.session.user.id,
            statusCode: 403,
            error: 'Configuration is read-only',
          });
          
          return createErrorResponse(
            ERROR_CODES.CONFIG_004,
            `Configuration '${configKey}' is read-only and cannot be modified`,
            { requestId }
          );
        }
      }
      
      logAPIRequest('PUT', `/api/v1/config/${configKey}`, requestId, {
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
    logAPIRequest('PUT', `/api/v1/config/${configKey}`, requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: 200,
      details: {
        key: configKey,
        category: updatedConfig.category,
        valueChanged: true,
      },
    });

    const responseData = {
      ...updatedConfig,
      message: 'Configuration updated successfully',
      timestamp: new Date().toISOString(),
    };

    return createSuccessResponse(responseData, { requestId, duration });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] PUT /api/v1/config/[key]:', error);
    
    logAPIRequest('PUT', `/api/v1/config/${params.key}`, requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to update configuration',
      { requestId, details: errorMessage }
    );
  }
}

/**
 * 設定リセット
 * DELETE /api/v1/config/[key]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { key: string } }
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();
  
  try {
    // 認証・認可チェック（管理者権限が必要）
    const authResult = await requirePermissions([PERMISSIONS.CONFIG_WRITE], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('DELETE', `/api/v1/config/${params.key}`, requestId, {
        statusCode: 401,
        error: authResult.error,
      });
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    // パスパラメータのバリデーション
    const paramsValidation = validateRequest(request, params, {
      params: z.object({ key: CommonSchemas.configKey }),
    });
    if (!paramsValidation.success || !paramsValidation.data?.params) {
      return createErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Invalid configuration key format',
        { requestId }
      );
    }

    const configKey = paramsValidation.data.params.key;

    // 設定リポジトリでリセット処理（デフォルト値に戻す）
    const configRepository = new ConfigRepository();
    let resetConfig;

    try {
      resetConfig = await configRepository.resetToDefault(configKey);
    } catch (error) {
      console.error(`[CONFIG_RESET_ERROR] Failed to reset configuration ${configKey}:`, error);
      
      // エラーの種類による分岐
      if (error && typeof error === 'object' && 'code' in error) {
        const dbError = error as any;
        
        if (dbError.code === 'CONFIG_NOT_FOUND') {
          logAPIRequest('DELETE', `/api/v1/config/${configKey}`, requestId, {
            userId: authResult.session.user.id,
            statusCode: 404,
            error: 'Configuration key not found',
          });
          
          return createErrorResponse(
            ERROR_CODES.CONFIG_002,
            `Configuration with key '${configKey}' not found`,
            { requestId }
          );
        }
        
        if (dbError.code === 'CONFIG_NO_DEFAULT') {
          logAPIRequest('DELETE', `/api/v1/config/${configKey}`, requestId, {
            userId: authResult.session.user.id,
            statusCode: 400,
            error: 'No default value available',
          });
          
          return createErrorResponse(
            ERROR_CODES.CONFIG_005,
            `Configuration '${configKey}' has no default value to reset to`,
            { requestId }
          );
        }
      }
      
      logAPIRequest('DELETE', `/api/v1/config/${configKey}`, requestId, {
        userId: authResult.session.user.id,
        statusCode: 500,
        error: error instanceof Error ? error.message : 'Configuration reset failed',
      });
      
      return createErrorResponse(
        ERROR_CODES.CONFIG_001,
        `Failed to reset configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { requestId }
      );
    }

    const duration = Date.now() - startTime;

    // 監査ログ
    logAPIRequest('DELETE', `/api/v1/config/${configKey}`, requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: 200,
      details: {
        key: configKey,
        category: resetConfig.category,
        resetToDefault: true,
      },
    });

    const responseData = {
      ...resetConfig,
      message: 'Configuration reset to default value successfully',
      timestamp: new Date().toISOString(),
    };

    return createSuccessResponse(responseData, { requestId, duration });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] DELETE /api/v1/config/[key]:', error);
    
    logAPIRequest('DELETE', `/api/v1/config/${params.key}`, requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to reset configuration',
      { requestId, details: errorMessage }
    );
  }
}