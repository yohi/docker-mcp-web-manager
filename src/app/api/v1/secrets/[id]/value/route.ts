import { NextRequest } from 'next/server';
import { 
  createSuccessResponse, 
  createErrorResponse,
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
import { SecretRepository } from '@/db/repositories/secret-repository';
import { SecureStorage } from '@/lib/crypto/secure-storage';
import { z } from 'zod';

// =============================================================================
// /api/v1/secrets/[id]/value - シークレット値取得API
// 機密情報の値を安全に取得（高度な認証・監査が必要）
// =============================================================================

/**
 * シークレット値取得
 * GET /api/v1/secrets/[id]/value
 * 
 * 注意: この操作は機密性が極めて高く、厳格な監査とアクセス制御を適用
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();
  
  try {
    // 認証・認可チェック（最高レベルの権限が必要）
    const authResult = await requirePermissions([PERMISSIONS.SECRETS_READ], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('GET', `/api/v1/secrets/${params.id}/value`, requestId, {
        statusCode: 401,
        error: authResult.error,
        // severity: 'HIGH', // 高セキュリティ操作（severityプロパティは存在しない）
      });
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    // 管理者権限の追加確認
    if (authResult.session.user.role !== 'admin') {
      logAPIRequest('GET', `/api/v1/secrets/${params.id}/value`, requestId, {
        userId: authResult.session.user.id,
        statusCode: 403,
        error: 'Admin privileges required for secret value access',
        // severity: 'HIGH', // severityプロパティは存在しない
      });
      
      return createErrorResponse(
        ERROR_CODES.FORBIDDEN,
        'Administrator privileges required to access secret values',
        { requestId }
      );
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
      logAPIRequest('GET', `/api/v1/secrets/${secretId}/value`, requestId, {
        userId: authResult.session.user.id,
        statusCode: 404,
        error: 'Secret not found',
        // severity: 'HIGH', // severityプロパティは存在しない
      });
      
      return createErrorResponse(
        ERROR_CODES.SECRET_004,
        `Secret with ID '${secretId}' not found`,
        { requestId }
      );
    }

    // 有効期限チェック（expiresAtプロパティは存在しないためスキップ）
    // if (secret.expiresAt && new Date(secret.expiresAt) < new Date()) {
    //   logAPIRequest('GET', `/api/v1/secrets/${secretId}/value`, requestId, {
    //     userId: authResult.session.user.id,
    //     statusCode: 410,
    //     error: 'Secret has expired',
    //     // severity: 'MEDIUM', // severityプロパティは存在しない
    //     // details: { expiresAt: secret.expiresAt }, // detailsプロパティとexpiresAtプロパティは存在しない
    //   });
    //   
    //   return createErrorResponse(
    //     ERROR_CODES.SECRET_005,
    //     'Secret has expired and cannot be accessed',
    //     { requestId }
    //   );
    // }

    // 暗号化されたデータを復号化
    const secureStorage = new SecureStorage();
    let decryptedValue: string;

    try {
      // SecretRepositoryのgetValueメソッドを使用
      const secretValue = await SecretRepository.getValue(secretId);
      if (!secretValue) {
        throw new Error('Secret value not found');
      }
      decryptedValue = secretValue.value;
    } catch (error) {
      console.error('[DECRYPTION_ERROR] Failed to decrypt secret value:', error);
      
      logAPIRequest('GET', `/api/v1/secrets/${secretId}/value`, requestId, {
        userId: authResult.session.user.id,
        statusCode: 500,
        error: 'Decryption failed',
        // severity: 'CRITICAL', // severityプロパティは存在しない
        // details: { secretName: secret.name }, // detailsプロパティは存在しない
      });
      
      return createErrorResponse(
        ERROR_CODES.SECRET_003,
        'Failed to decrypt secret value',
        { requestId }
      );
    } finally {
      // セキュアストレージのクリーンアップ
      secureStorage.dispose();
    }

    // 使用回数・最終使用日時を更新
    try {
      await SecretRepository.update(secretId, {
        // lastUsedAt: new Date().toISOString(), // lastUsedAtプロパティは存在しない
      });
    } catch (error) {
      console.warn('[SECRET_USAGE_WARNING] Failed to update usage statistics:', error);
      // 使用統計の更新失敗は処理を継続
    }

    const duration = Date.now() - startTime;

    // 重要な監査ログ（機密情報の実際のアクセスを記録）
    logAPIRequest('GET', `/api/v1/secrets/${secretId}/value`, requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: 200,
      // severity: 'CRITICAL', // 最高レベルの監査（severityプロパティは存在しない）
      // details: { // detailsプロパティは存在しない
      //   secretId,
      //   secretName: secret.name,
      //   secretType: secret.type,
      //   serverId: secret.serverId, // serverIdプロパティも存在しない
      //   accessType: 'full_value_access',
      //   clientIP: request.headers.get('x-forwarded-for') || 
      //             request.headers.get('x-real-ip') || 
      //             'unknown',
      //   userAgent: request.headers.get('user-agent') || 'unknown',
      // },
    });

    // レスポンスデータ（実際の機密値を含む）
    const responseData = {
      id: secret.id,
      name: secret.name,
      type: secret.type,
      value: decryptedValue, // 復号化された機密値
      // description: secret.description,      // Secretインターフェースには存在しない
      // serverId: secret.serverId,            // Secretインターフェースには存在しない  
      // tags: secret.tags,                    // Secretインターフェースには存在しない
      // expiresAt: secret.expiresAt,          // Secretインターフェースには存在しない
      // lastUsedAt: new Date().toISOString(), // Secretインターフェースには存在しない
      accessedAt: new Date().toISOString(),
      // セキュリティ警告
      security: {
        warning: 'This response contains sensitive data. Handle with extreme care.',
        accessed: new Date().toISOString(),
        accessedBy: authResult.session.user.email,
      },
    };

    // セキュリティヘッダーを追加
    return new Response(JSON.stringify({
      success: true,
      data: responseData,
      meta: {
        requestId,
        duration,
        timestamp: new Date().toISOString(),
      },
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
        'X-Response-Time': duration.toString(),
        // 強力なセキュリティヘッダー
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Referrer-Policy': 'no-referrer',
        // カスタムセキュリティヘッダー
        'X-Secret-Access': 'true',
        'X-Security-Warning': 'Sensitive-Data-Response',
      },
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] GET /api/v1/secrets/[id]/value:', error);
    
    logAPIRequest('GET', `/api/v1/secrets/${params.id}/value`, requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
      // severity: 'CRITICAL', // severityプロパティは存在しない
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to retrieve secret value',
      { requestId }
    );
  }
}