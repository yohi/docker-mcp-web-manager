import { NextRequest } from 'next/server';
import { 
  createSuccessResponse, 
  createErrorResponse,
  createValidationErrorResponse,
  ERROR_CODES,
  processPagination,
  processSorting,
  logAPIRequest,
} from '@/lib/api/response';
import {
  validateRequest,
  CommonSchemas,
  SecretSchemas,
} from '@/lib/api/validation';
import {
  requirePermissions,
  PERMISSIONS,
} from '@/lib/auth';
import { SecretRepository } from '@/db/repositories/secret-repository';
import { SecureStorage } from '@/lib/crypto/secure-storage';
import { BitwardenClient } from '@/lib/bitwarden/client';

// =============================================================================
// /api/v1/secrets - シークレット管理API
// 暗号化されたシークレットの安全な管理機能
// =============================================================================

/**
 * シークレット一覧取得
 * GET /api/v1/secrets
 */
export async function GET(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();
  
  try {
    // 認証・認可チェック（管理者権限が必要）
    const authResult = await requirePermissions([PERMISSIONS.SECRETS_READ], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('GET', '/api/v1/secrets', requestId, {
        statusCode: 401,
        error: authResult.error,
      });
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    // クエリパラメータのバリデーション
    const querySchema = CommonSchemas.pagination
      .merge(CommonSchemas.sorting)
      .merge(SecretSchemas.secretQuery);

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
      ['name', 'type', 'createdAt', 'updatedAt'],
      { sortBy: 'name', sortOrder: 'asc' }
    );

    const queryParams = validation.data.query;

    // シークレットリポジトリからデータを取得
    const secretRepository = new SecretRepository();
    let secretResult;

    try {
      const filters = {
        type: queryParams.type,
        name: queryParams.search,
        serverId: queryParams.serverId,
        tags: queryParams.tags,
      };

      secretResult = await secretRepository.findWithFilters(filters, {
        page,
        limit,
        sortBy,
        sortOrder,
      });
    } catch (error) {
      console.error('[SECRET_ERROR] Failed to fetch secrets:', error);
      
      logAPIRequest('GET', '/api/v1/secrets', requestId, {
        userId: authResult.session.user.id,
        statusCode: 500,
        error: error instanceof Error ? error.message : 'Database error',
      });
      
      return createErrorResponse(
        ERROR_CODES.SECRET_001,
        'Failed to retrieve secrets',
        { requestId, details: error instanceof Error ? error.message : 'Unknown error' }
      );
    }

    // レスポンスから機密情報を除外（メタデータのみ返す）
    const sanitizedSecrets = secretResult.secrets.map(secret => ({
      id: secret.id,
      name: secret.name,
      type: secret.type,
      description: secret.description,
      serverId: secret.serverId,
      tags: secret.tags,
      lastUsedAt: secret.lastUsedAt,
      expiresAt: secret.expiresAt,
      createdAt: secret.createdAt,
      updatedAt: secret.updatedAt,
      // 実際の値は含めない
    }));

    const duration = Date.now() - startTime;

    // 監査ログ（機密情報へのアクセスを記録）
    logAPIRequest('GET', '/api/v1/secrets', requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: 200,
      details: {
        secretCount: sanitizedSecrets.length,
        filters: queryParams,
      },
    });

    return createSuccessResponse(sanitizedSecrets, {
      pagination: {
        page,
        limit,
        total: secretResult.total,
        totalPages: Math.ceil(secretResult.total / limit),
        hasNext: page * limit < secretResult.total,
        hasPrev: page > 1,
      },
      requestId,
      duration,
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] GET /api/v1/secrets:', error);
    
    logAPIRequest('GET', '/api/v1/secrets', requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to retrieve secrets',
      { requestId, details: errorMessage }
    );
  }
}

/**
 * 新しいシークレット作成
 * POST /api/v1/secrets
 */
export async function POST(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();
  
  try {
    // 認証・認可チェック（管理者権限が必要）
    const authResult = await requirePermissions([PERMISSIONS.SECRETS_WRITE], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('POST', '/api/v1/secrets', requestId, {
        statusCode: 401,
        error: authResult.error,
      });
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    // リクエストボディのバリデーション
    const validation = await validateRequest(request, undefined, {
      body: SecretSchemas.createSecret,
    });
    if (!validation.success || !validation.data?.body) {
      return createValidationErrorResponse(validation.errors!.body!, requestId);
    }

    const secretData = validation.data.body;

    // シークレット名の重複チェック
    const secretRepository = new SecretRepository();
    const existingSecret = await secretRepository.findByName(secretData.name);
    if (existingSecret) {
      logAPIRequest('POST', '/api/v1/secrets', requestId, {
        userId: authResult.session.user.id,
        statusCode: 409,
        error: 'Secret name already exists',
      });
      
      return createErrorResponse(
        ERROR_CODES.SECRET_002,
        `Secret with name '${secretData.name}' already exists`,
        { requestId }
      );
    }

    // セキュアストレージで値を暗号化
    const secureStorage = new SecureStorage();
    let encryptedEntry;

    try {
      encryptedEntry = await secureStorage.encrypt(
        secretData.value,
        undefined, // キーIDは自動生成
        {
          type: secretData.type,
          serverId: secretData.serverId,
          tags: secretData.tags?.join(','),
        }
      );
    } catch (error) {
      console.error('[ENCRYPTION_ERROR] Failed to encrypt secret value:', error);
      
      logAPIRequest('POST', '/api/v1/secrets', requestId, {
        userId: authResult.session.user.id,
        statusCode: 500,
        error: 'Encryption failed',
      });
      
      return createErrorResponse(
        ERROR_CODES.SECRET_003,
        'Failed to encrypt secret value',
        { requestId }
      );
    }

    // データベースにシークレットを保存
    let newSecret;
    
    try {
      newSecret = await secretRepository.create({
        name: secretData.name,
        type: secretData.type,
        description: secretData.description,
        serverId: secretData.serverId,
        encryptedValue: JSON.stringify(encryptedEntry),
        tags: secretData.tags || [],
        expiresAt: secretData.expiresAt,
      });
    } catch (error) {
      console.error('[SECRET_CREATE_ERROR] Failed to create secret:', error);
      
      logAPIRequest('POST', '/api/v1/secrets', requestId, {
        userId: authResult.session.user.id,
        statusCode: 500,
        error: error instanceof Error ? error.message : 'Database error',
      });
      
      return createErrorResponse(
        ERROR_CODES.SECRET_001,
        'Failed to create secret',
        { requestId, details: error instanceof Error ? error.message : 'Unknown error' }
      );
    }

    // Bitwardenに同期（オプション）
    if (secretData.syncToBitwarden) {
      try {
        const bitwardenClient = new BitwardenClient();
        const status = await bitwardenClient.getStatus();
        
        if (status.status === 'unlocked') {
          await bitwardenClient.createItem({
            name: secretData.name,
            type: secretData.type === 'password' ? 1 : 2, // LOGIN or SECURE_NOTE
            login: secretData.type === 'password' ? {
              username: secretData.description || '',
              password: secretData.value,
            } : undefined,
            notes: secretData.type !== 'password' ? secretData.value : secretData.description,
          });
        }
      } catch (error) {
        // Bitwarden同期の失敗は警告として扱い、処理を続行
        console.warn('[BITWARDEN_SYNC_WARNING] Failed to sync to Bitwarden:', error);
      }
    }

    const duration = Date.now() - startTime;

    // 監査ログ（機密情報作成を記録）
    logAPIRequest('POST', '/api/v1/secrets', requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: 201,
      details: {
        secretId: newSecret.id,
        secretName: secretData.name,
        secretType: secretData.type,
        serverId: secretData.serverId,
        syncToBitwarden: secretData.syncToBitwarden,
      },
    });

    // レスポンスデータ（機密情報は除外）
    const responseData = {
      id: newSecret.id,
      name: newSecret.name,
      type: newSecret.type,
      description: newSecret.description,
      serverId: newSecret.serverId,
      tags: newSecret.tags,
      expiresAt: newSecret.expiresAt,
      createdAt: newSecret.createdAt,
      updatedAt: newSecret.updatedAt,
      message: 'Secret created successfully',
    };

    return createSuccessResponse(responseData, { 
      requestId, 
      duration,
      statusCode: 201,
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] POST /api/v1/secrets:', error);
    
    logAPIRequest('POST', '/api/v1/secrets', requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to create secret',
      { requestId, details: errorMessage }
    );
  } finally {
    // セキュアストレージのクリーンアップ
    try {
      const secureStorage = new SecureStorage();
      secureStorage.dispose();
    } catch {
      // クリーンアップエラーは無視
    }
  }
}