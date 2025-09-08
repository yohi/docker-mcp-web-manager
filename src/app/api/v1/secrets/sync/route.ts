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
// /api/v1/secrets/sync - Bitwarden同期API
// BitwardenとローカルDBのシークレット同期機能
// =============================================================================

/**
 * Bitwardenとの同期実行
 * POST /api/v1/secrets/sync
 */
export async function POST(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();
  
  try {
    // 認証・認可チェック（管理者権限が必要）
    const authResult = await requirePermissions([PERMISSIONS.SECRETS_SYNC], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('POST', '/api/v1/secrets/sync', requestId, {
        statusCode: 401,
        error: authResult.error,
      });
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    // リクエストボディのバリデーション（オプション）
    const validation = await validateRequest(request, undefined, {
      body: SecretSchemas.syncOptions.optional(),
    });
    if (!validation.success) {
      return createValidationErrorResponse(validation.errors!.body!, requestId);
    }

    const syncOptions = validation.data?.body || {
      direction: 'bidirectional',
      dryRun: false,
      includeExpired: false,
    };

    // Bitwardenクライアントの初期化
    const bitwardenClient = new BitwardenClient();
    let bitwardenStatus;

    try {
      bitwardenStatus = await bitwardenClient.getStatus();
    } catch (error) {
      console.error('[BITWARDEN_STATUS_ERROR] Failed to get Bitwarden status:', error);
      
      logAPIRequest('POST', '/api/v1/secrets/sync', requestId, {
        userId: authResult.session.user.id,
        statusCode: 503,
        error: 'Bitwarden service unavailable',
      });
      
      return createErrorResponse(
        ERROR_CODES.SECRET_006,
        'Bitwarden service is unavailable',
        { requestId }
      );
    }

    // Bitwardenがアンロックされているかチェック
    if (bitwardenStatus.status !== 'unlocked') {
      logAPIRequest('POST', '/api/v1/secrets/sync', requestId, {
        userId: authResult.session.user.id,
        statusCode: 423,
        error: 'Bitwarden vault is locked',
      });
      
      return createErrorResponse(
        ERROR_CODES.SECRET_007,
        'Bitwarden vault must be unlocked before synchronization',
        { requestId }
      );
    }

    const syncResult = {
      imported: 0,
      exported: 0,
      updated: 0,
      conflicts: 0,
      errors: [] as string[],
      summary: {} as Record<string, any>,
    };

    // ===== インポート処理 (Bitwarden -> Local DB) =====
    if (syncOptions.direction === 'import' || syncOptions.direction === 'bidirectional') {
      try {
        const bitwardenItems = await bitwardenClient.searchItems('');
        const secretRepository = new SecretRepository();
        const secureStorage = new SecureStorage();

        for (const item of bitwardenItems.items) {
          try {
            // 既存のローカルシークレットをチェック
            const existingSecret = await secretRepository.findByName(item.name);
            
            if (existingSecret) {
              // 衝突の処理
              syncResult.conflicts++;
              syncResult.errors.push(`Conflict: Secret '${item.name}' exists both locally and in Bitwarden`);
              continue;
            }

            // Bitwardenアイテムからシークレットデータを抽出
            const secretValue = item.password || item.notes || '';
            if (!secretValue) {
              continue; // 値が無い場合はスキップ
            }

            // 暗号化して保存
            const encryptedEntry = await secureStorage.encrypt(
              secretValue,
              undefined,
              {
                source: 'bitwarden',
                bitwardenId: item.id,
                importedAt: new Date().toISOString(),
              }
            );

            const newSecret = await secretRepository.create({
              name: item.name,
              type: item.password ? 'password' : 'note',
              description: item.notes || `Imported from Bitwarden: ${item.name}`,
              encryptedValue: JSON.stringify(encryptedEntry),
              tags: ['bitwarden-import'],
              serverId: null, // インポート時はサーバー関連付けなし
            });

            syncResult.imported++;
            
          } catch (error) {
            syncResult.errors.push(`Import error for '${item.name}': ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

        secureStorage.dispose();
        
      } catch (error) {
        syncResult.errors.push(`Bitwarden import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // ===== エクスポート処理 (Local DB -> Bitwarden) =====
    if (syncOptions.direction === 'export' || syncOptions.direction === 'bidirectional') {
      try {
        const secretRepository = new SecretRepository();
        const secureStorage = new SecureStorage();
        
        // エクスポート対象のシークレットを取得
        const localSecrets = await secretRepository.findWithFilters({
          tags: syncOptions.includeExpired ? undefined : ['bitwarden-export'],
        }, { page: 1, limit: 1000 });

        for (const secret of localSecrets.secrets) {
          try {
            // Bitwardenで既存のアイテムをチェック
            const searchResult = await bitwardenClient.searchItems(secret.name);
            
            if (searchResult.items.length > 0) {
              // 衝突の処理
              syncResult.conflicts++;
              syncResult.errors.push(`Conflict: Secret '${secret.name}' exists both locally and in Bitwarden`);
              continue;
            }

            // 有効期限チェック
            if (!syncOptions.includeExpired && secret.expiresAt) {
              const expiryDate = new Date(secret.expiresAt);
              if (expiryDate < new Date()) {
                continue; // 期限切れはスキップ
              }
            }

            // シークレット値を復号化
            const encryptedEntry = JSON.parse(secret.encryptedValue);
            const decryptedValue = await secureStorage.decrypt(encryptedEntry);

            // Bitwardenアイテムを作成
            await bitwardenClient.createItem({
              name: secret.name,
              type: secret.type === 'password' ? 1 : 2, // LOGIN or SECURE_NOTE
              login: secret.type === 'password' ? {
                username: secret.description || '',
                password: decryptedValue,
              } : undefined,
              notes: secret.type !== 'password' ? decryptedValue : secret.description,
            });

            syncResult.exported++;
            
          } catch (error) {
            syncResult.errors.push(`Export error for '${secret.name}': ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

        secureStorage.dispose();
        
      } catch (error) {
        syncResult.errors.push(`Bitwarden export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Bitwardenとの同期
    if (!syncOptions.dryRun) {
      try {
        await bitwardenClient.sync();
      } catch (error) {
        syncResult.errors.push(`Bitwarden sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    const duration = Date.now() - startTime;

    // サマリーの生成
    syncResult.summary = {
      direction: syncOptions.direction,
      dryRun: syncOptions.dryRun,
      includeExpired: syncOptions.includeExpired,
      totalOperations: syncResult.imported + syncResult.exported + syncResult.updated,
      successRate: syncResult.errors.length === 0 ? 100 : 
        Math.round(((syncResult.imported + syncResult.exported) / 
        (syncResult.imported + syncResult.exported + syncResult.errors.length)) * 100),
      duration,
    };

    // 監査ログ（同期操作を記録）
    logAPIRequest('POST', '/api/v1/secrets/sync', requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: syncResult.errors.length > 0 ? 207 : 200, // 部分成功の場合は207
      details: {
        syncDirection: syncOptions.direction,
        imported: syncResult.imported,
        exported: syncResult.exported,
        conflicts: syncResult.conflicts,
        errorCount: syncResult.errors.length,
        dryRun: syncOptions.dryRun,
      },
    });

    const responseData = {
      synchronization: {
        status: syncResult.errors.length === 0 ? 'completed' : 'partial',
        imported: syncResult.imported,
        exported: syncResult.exported,
        updated: syncResult.updated,
        conflicts: syncResult.conflicts,
        errors: syncResult.errors,
        summary: syncResult.summary,
      },
      bitwarden: {
        status: bitwardenStatus.status,
        email: bitwardenStatus.email,
        lastSync: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
      message: syncResult.errors.length === 0 ? 
        'Synchronization completed successfully' :
        'Synchronization completed with some errors',
    };

    return createSuccessResponse(responseData, { 
      requestId, 
      duration,
      statusCode: syncResult.errors.length > 0 ? 207 : 200,
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] POST /api/v1/secrets/sync:', error);
    
    logAPIRequest('POST', '/api/v1/secrets/sync', requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to synchronize with Bitwarden',
      { requestId, details: errorMessage }
    );
  } finally {
    // Bitwardenクライアントのクリーンアップ
    try {
      const bitwardenClient = new BitwardenClient();
      bitwardenClient.dispose();
    } catch {
      // クリーンアップエラーは無視
    }
  }
}