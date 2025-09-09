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
  SecretSchemas,
} from '@/lib/api/validation';
import {
  requirePermissions,
  PERMISSIONS,
} from '@/lib/auth';
import { SecretRepository } from '@/db/repositories/secret-repository';
import { SecureStorage } from '@/lib/crypto/secure-storage';
import { BitwardenClient } from '@/lib/bitwarden/client';
import { z } from 'zod';

// =============================================================================
// /api/v1/secrets/[id] - 個別シークレット管理API
// 特定のシークレットの詳細操作
// =============================================================================

/**
 * シークレット詳細取得（値は含まない）
 * GET /api/v1/secrets/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();
  
  try {
    // 認証・認可チェック
    const authResult = await requirePermissions([PERMISSIONS.SECRETS_READ], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('GET', `/api/v1/secrets/${params.id}`, requestId, {
        statusCode: 401,
        error: authResult.error,
      });
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    // パスパラメータのバリデーション
    const paramsValidation = await validateRequest(request, params, {
      params: z.object({ id: CommonSchemas.id }),
    });
    if (!paramsValidation.success || !paramsValidation.data?.params) {
      return createErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Invalid secret ID format',
        { requestId }
      );
    }

    const secretId = paramsValidation.data.params.id;

    // シークレットの存在確認
    const secret = await SecretRepository.get(secretId);

    if (!secret) {
      logAPIRequest('GET', `/api/v1/secrets/${secretId}`, requestId, {
        userId: authResult.session.user.id,
        statusCode: 404,
        error: 'Secret not found',
      });
      
      return createErrorResponse(
        ERROR_CODES.SECRET_004,
        `Secret with ID '${secretId}' not found`,
        { requestId }
      );
    }

    const duration = Date.now() - startTime;

    // 監査ログ（機密情報へのアクセスを記録）
    logAPIRequest('GET', `/api/v1/secrets/${secretId}`, requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: 200,
    });

    // レスポンスデータ（機密情報は除外）
    const responseData = {
      id: secret.id,
      name: secret.name,
      type: secret.type,
      description: undefined,
      serverId: undefined,
      tags: undefined,
      lastUsedAt: undefined,
      expiresAt: undefined,
      createdAt: secret.createdAt,
      updatedAt: secret.updatedAt,
    };

    return createSuccessResponse(responseData, { requestId, duration });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] GET /api/v1/secrets/[id]:', error);
    
    logAPIRequest('GET', `/api/v1/secrets/${params.id}`, requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to retrieve secret details',
      { requestId, details: errorMessage }
    );
  }
}

/**
 * シークレット更新
 * PUT /api/v1/secrets/[id]
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();
  
  try {
    // 認証・認可チェック（管理者権限が必要）
    const authResult = await requirePermissions([PERMISSIONS.SECRETS_MANAGE], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('PUT', `/api/v1/secrets/${params.id}`, requestId, {
        statusCode: 401,
        error: authResult.error,
      });
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    // パラメータとボディのバリデーション
    const validation = await validateRequest(request, params, {
      params: z.object({ id: CommonSchemas.id }),
      body: SecretSchemas.updateSecret,
    });
    if (!validation.success) {
      const error = validation.errors!.params || validation.errors!.body!;
      return createValidationErrorResponse(error, requestId);
    }

    const secretId = validation.data?.params?.id;
    const updateData = validation.data?.body;
    
    if (!secretId || !updateData) {
      return createErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Missing required parameters',
        { requestId }
      );
    }

    // シークレットの存在確認
    const existingSecret = await SecretRepository.get(secretId);

    if (!existingSecret) {
      logAPIRequest('PUT', `/api/v1/secrets/${secretId}`, requestId, {
        userId: authResult.session.user.id,
        statusCode: 404,
        error: 'Secret not found',
      });
      
      return createErrorResponse(
        ERROR_CODES.SECRET_004,
        `Secret with ID '${secretId}' not found`,
        { requestId }
      );
    }

    // 名前の重複チェック（将来実装予定）
    if (updateData.name && updateData.name !== existingSecret.name) {
      // 現在は重複チェックをスキップ
      // TODO: findByName メソッドの実装が必要
    }

    // 値が変更される場合、再暗号化
    let encryptedEntry: string | undefined;
    if (updateData.value) {
      const secureStorage = new SecureStorage();
      
      try {
        const newEncryptedEntry = await secureStorage.encrypt(
          updateData.value,
          undefined, // 新しいキーIDを生成
          {
            type: existingSecret.type, // タイプは変更不可
            // serverId:  existingSecret.serverId, // serverIdは将来実装予定（Secretインターフェースには存在しない）
            // tags: (updateData.tags || existingSecret.tags)?.join(','), // tagsは将来実装予定（Secretインターフェースには存在しない）
          }
        );
        
        encryptedEntry = JSON.stringify(newEncryptedEntry);
        
        // 古い暗号化データのクリーンアップ
        secureStorage.dispose();
        
      } catch (error) {
        console.error('[ENCRYPTION_ERROR] Failed to encrypt updated secret value:', error);
        
        logAPIRequest('PUT', `/api/v1/secrets/${secretId}`, requestId, {
          userId: authResult.session.user.id,
          statusCode: 500,
          error: 'Encryption failed',
        });
        
        return createErrorResponse(
          ERROR_CODES.SECRET_003,
          'Failed to encrypt updated secret value',
          { requestId }
        );
      }
    }

    // シークレットを更新
    let updatedSecret;
    
    try {
      const updatePayload: any = {
        name: updateData.name,
        // type: updateData.type,        // Secret interface doesn't have type property
        // description: updateData.description,  // Secret interface doesn't have description property
        // serverId: undefined,          // Secret interface doesn't have serverId property
        // tags: updateData.tags,        // Secret interface doesn't have tags property
        // expiresAt: updateData.expiresAt,     // Secret interface doesn't have expiresAt property
      };
      
      if (encryptedEntry) {
        updatePayload.encryptedValue = encryptedEntry;
      }
      
      updatedSecret = await SecretRepository.update(secretId, updatePayload);
      
    } catch (error) {
      console.error('[SECRET_UPDATE_ERROR] Failed to update secret:', error);
      
      logAPIRequest('PUT', `/api/v1/secrets/${secretId}`, requestId, {
        userId: authResult.session.user.id,
        statusCode: 500,
        error: error instanceof Error ? error.message : 'Database error',
      });
      
      return createErrorResponse(
        ERROR_CODES.SECRET_001,
        'Failed to update secret',
        { requestId, details: error instanceof Error ? error.message : 'Unknown error' }
      );
    }

    // Bitwardenとの同期（値が変更された場合のみ）
    // syncToBitwardenプロパティは存在しないため、Bitwarden同期機能は無効化
    // if (updateData.value && updateData.syncToBitwarden) {
    //   try {
    //     const bitwardenClient = new BitwardenClient();
    //     const status = await bitwardenClient.getStatus();
    //     
    //     if (status.status === 'unlocked') {
    //       // 既存のBitwardenエントリを検索して更新
    //       const searchResult = await bitwardenClient.searchItems(existingSecret.name);
    //       if (searchResult.items.length > 0) {
    //         const existingItem = searchResult.items[0];
    //         await bitwardenClient.updateItem(existingItem.id, {
    //           name: updateData.name || existingSecret.name,
    //           login: updateData.type === 'password' ? {
    //             username: '', // description property doesn't exist in Secret interface
    //             password: updateData.value,
    //           } : undefined,
    //           notes: updateData.type !== 'password' ? 
    //             updateData.value : 
    //             '', // description property doesn't exist in Secret interface
    //         });
    //       }
    //     }
    //   } catch (error) {
    //     // Bitwarden同期の失敗は警告として扱い、処理を続行
    //     console.warn('[BITWARDEN_SYNC_WARNING] Failed to sync to Bitwarden:', error);
    //   }
    // }

    const duration = Date.now() - startTime;

    // 監査ログ（機密情報更新を記録）
    logAPIRequest('PUT', `/api/v1/secrets/${secretId}`, requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: 200,
      // details: {  // detailsプロパティは存在しない
      //   secretName: updatedSecret.name,
      //   secretType: updatedSecret.type,
      //   // serverId: updatedSecret.serverId,        // Secret interface doesn't have serverId property
      //   valueChanged: !!updateData.value,
      //   // syncToBitwarden: updateData.syncToBitwarden, // syncToBitwardenプロパティは存在しない
      // },
    });

    // レスポンスデータ（機密情報は除外）
    const responseData = {
      id: updatedSecret?.id || secretId,
      name: updatedSecret?.name || existingSecret.name,
      type: updatedSecret?.type || existingSecret.type,
      // description: updatedSecret.description,  // Secret interface doesn't have description property
      // serverId: updatedSecret.serverId,        // Secret interface doesn't have serverId property
      // tags: updatedSecret.tags,                // Secret interface doesn't have tags property
      // expiresAt: updatedSecret.expiresAt,      // Secret interface doesn't have expiresAt property
      updatedAt: updatedSecret?.updatedAt || new Date(),
      message: 'Secret updated successfully',
    };

    return createSuccessResponse(responseData, { requestId, duration });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] PUT /api/v1/secrets/[id]:', error);
    
    logAPIRequest('PUT', `/api/v1/secrets/${params.id}`, requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to update secret',
      { requestId, details: errorMessage }
    );
  }
}

/**
 * シークレット削除
 * DELETE /api/v1/secrets/[id]
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();
  
  try {
    // 認証・認可チェック（管理者権限が必要）
    const authResult = await requirePermissions([PERMISSIONS.SECRETS_MANAGE], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('DELETE', `/api/v1/secrets/${params.id}`, requestId, {
        statusCode: 401,
        error: authResult.error,
      });
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    // パスパラメータのバリデーション
    const paramsValidation = await validateRequest(request, params, {
      params: z.object({ id: CommonSchemas.id }),
    });
    if (!paramsValidation.success || !paramsValidation.data?.params) {
      return createErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        'Invalid secret ID format',
        { requestId }
      );
    }

    const secretId = paramsValidation.data.params.id;

    // シークレットの存在確認
    const secret = await SecretRepository.get(secretId);

    if (!secret) {
      logAPIRequest('DELETE', `/api/v1/secrets/${secretId}`, requestId, {
        userId: authResult.session.user.id,
        statusCode: 404,
        error: 'Secret not found',
      });
      
      return createErrorResponse(
        ERROR_CODES.SECRET_004,
        `Secret with ID '${secretId}' not found`,
        { requestId }
      );
    }

    // 関連するサーバーがある場合の使用状況チェック（現在は未実装）
    // if (secret.serverId) {  // serverIdプロパティは存在しないため無効化
    //   // サーバーで使用中のシークレットかチェック（警告のみ）
    //   console.warn(`[SECRET_DELETE_WARNING] Deleting secret ${secret.name} that may be used by server ${secret.serverId}`);
    // }

    // シークレットを削除
    try {
      await SecretRepository.delete(secretId);
    } catch (error) {
      console.error('[SECRET_DELETE_ERROR] Failed to delete secret:', error);
      
      logAPIRequest('DELETE', `/api/v1/secrets/${secretId}`, requestId, {
        userId: authResult.session.user.id,
        statusCode: 500,
        error: error instanceof Error ? error.message : 'Database error',
      });
      
      return createErrorResponse(
        ERROR_CODES.SECRET_001,
        'Failed to delete secret',
        { requestId, details: error instanceof Error ? error.message : 'Unknown error' }
      );
    }

    // Bitwardenからも削除を試行（ベストエフォート）
    try {
      const bitwardenClient = new BitwardenClient();
      const status = await bitwardenClient.getStatus();
      
      if (status.status === 'unlocked') {
        const searchResult = await bitwardenClient.searchItems(secret.name);
        if (searchResult.items.length > 0) {
          const bitwardenItem = searchResult.items[0];
          await bitwardenClient.deleteItem(bitwardenItem.id);
        }
      }
    } catch (error) {
      // Bitwarden削除の失敗は警告として扱い、処理を続行
      console.warn('[BITWARDEN_DELETE_WARNING] Failed to delete from Bitwarden:', error);
    }

    const duration = Date.now() - startTime;

    // 監査ログ（機密情報削除を記録）
    logAPIRequest('DELETE', `/api/v1/secrets/${secretId}`, requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: 200,
      // details: {  // detailsプロパティは存在しない
      //   secretName: secret.name,
      //   secretType: secret.type,
      //   serverId: undefined,
      //   deletedPermanently: true,
      // },
    });

    const responseData = {
      id: secretId,
      name: secret.name,
      message: 'Secret deleted successfully',
      deletedAt: new Date().toISOString(),
    };

    return createSuccessResponse(responseData, { requestId, duration });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] DELETE /api/v1/secrets/[id]:', error);
    
    logAPIRequest('DELETE', `/api/v1/secrets/${params.id}`, requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to delete secret',
      { requestId, details: errorMessage }
    );
  }
}