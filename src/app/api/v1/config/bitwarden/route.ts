import { NextRequest } from 'next/server';
import { 
  createErrorResponse,
  createSuccessResponse,
  createValidationErrorResponse,
  ERROR_CODES,
} from '@/lib/api/response';
import {
  validateRequest,
} from '@/lib/api/validation';
import { apiHandler } from '@/lib/api/middleware';
import { BitwardenClient, BitwardenError } from '@/lib/bitwarden/bitwarden-client';
import { createSecretRepository } from '@/db/repositories';
import { z } from 'zod';

// =============================================================================
// /api/v1/config/bitwarden - Bitwarden統合API
// Bitwardenからのシークレット同期・管理機能
// =============================================================================

// Bitwarden同期リクエストスキーマ
const BitwardenSyncRequestSchema = z.object({
  serverId: z.string().min(1, 'Server ID is required'),
  vaultItems: z.array(z.object({
    itemId: z.string(),
    fieldName: z.string().optional(), // 特定のフィールドを指定
    secretName: z.string(), // ローカルでのシークレット名
    secretType: z.enum(['environment', 'credential', 'token', 'certificate', 'key']).optional().default('credential'),
  })),
  options: z.object({
    overwriteExisting: z.boolean().optional().default(false),
    syncMode: z.enum(['manual', 'auto']).optional().default('manual'),
    encryptLocally: z.boolean().optional().default(true),
  }).optional().default({}),
});

// Bitwarden検索クエリスキーマ
const BitwardenSearchSchema = z.object({
  query: z.string().optional(),
  type: z.enum(['login', 'card', 'identity', 'note']).optional(),
  organizationId: z.string().optional(),
  limit: z.number().min(1).max(100).optional().default(20),
});

type BitwardenSyncRequest = z.infer<typeof BitwardenSyncRequestSchema>;
type BitwardenSearchQuery = z.infer<typeof BitwardenSearchSchema>;

/**
 * Bitwarden Vaultアイテム検索
 * GET /api/v1/config/bitwarden
 */
async function handleSearchBitwardenItems(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  
  try {
    // クエリパラメータのバリデーション
    const validation = await validateRequest(request, {}, {
      query: BitwardenSearchSchema,
    });
    
    if (!validation.success) {
      return createValidationErrorResponse(validation.error, { requestId });
    }
    
    const searchQuery = validation.data.query;
    const bitwardenClient = new BitwardenClient();
    
    // Bitwarden接続状態を確認
    const status = await bitwardenClient.getStatus();
    if (status.status !== 'unlocked') {
      return createErrorResponse(
        ERROR_CODES.BITWARDEN_LOCKED,
        'Bitwarden vault is locked or not authenticated',
        { 
          requestId,
          details: { status: status.status }
        }
      );
    }
    
    // Vault検索実行
    const searchOptions = {
      search: searchQuery.query,
      organizationId: searchQuery.organizationId,
      limit: searchQuery.limit,
    };
    
    let items = [];
    
    if (searchQuery.type) {
      // 特定タイプで検索
      switch (searchQuery.type) {
        case 'login':
          items = await bitwardenClient.searchLogins(searchOptions);
          break;
        case 'card':
          items = await bitwardenClient.searchCards(searchOptions);
          break;
        case 'identity':
          items = await bitwardenClient.searchIdentities(searchOptions);
          break;
        case 'note':
          items = await bitwardenClient.searchNotes(searchOptions);
          break;
      }
    } else {
      // 全タイプで検索
      items = await bitwardenClient.searchAllItems(searchOptions);
    }
    
    // レスポンスデータの構築（機密情報は除外）
    const response = {
      data: items.map((item: any) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        organizationId: item.organizationId,
        folderId: item.folderId,
        favorite: item.favorite,
        fields: item.fields?.map((field: any) => ({
          name: field.name,
          type: field.type,
          // 値は除外（セキュリティ）
        })) || [],
        // 実際の認証情報は除外
        hasLogin: !!item.login,
        hasCard: !!item.card,
        hasIdentity: !!item.identity,
        hasSecureNote: !!item.secureNote,
        creationDate: item.creationDate,
        revisionDate: item.revisionDate,
      })),
      metadata: {
        requestId,
        searchQuery,
        total: items.length,
        bitwardenStatus: status.status,
        serverUrl: status.serverUrl,
      },
    };
    
    return createSuccessResponse(response, { requestId });
    
  } catch (error) {
    if (error instanceof BitwardenError) {
      return createErrorResponse(
        ERROR_CODES.BITWARDEN_ERROR,
        error.message,
        { requestId, details: { code: error.code } }
      );
    }
    
    console.error('Bitwarden search failed:', error);
    return createErrorResponse(
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      'Failed to search Bitwarden items',
      { requestId }
    );
  }
}

/**
 * Bitwardenからシークレット同期
 * POST /api/v1/config/bitwarden
 */
async function handleSyncFromBitwarden(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  
  try {
    // リクエストのバリデーション
    const validation = await validateRequest(request, {}, {
      body: BitwardenSyncRequestSchema,
    });
    
    if (!validation.success) {
      return createValidationErrorResponse(validation.error, { requestId });
    }
    
    const syncRequest = validation.data.body;
    const bitwardenClient = new BitwardenClient();
    const secretRepository = createSecretRepository();
    
    // Bitwarden接続状態を確認
    const status = await bitwardenClient.getStatus();
    if (status.status !== 'unlocked') {
      return createErrorResponse(
        ERROR_CODES.BITWARDEN_LOCKED,
        'Bitwarden vault is locked or not authenticated',
        { 
          requestId,
          details: { status: status.status }
        }
      );
    }
    
    const syncResults = {
      synchronized: 0,
      skipped: 0,
      errors: 0,
      items: [] as any[],
    };
    
    // 各Vaultアイテムを処理
    for (const vaultItem of syncRequest.vaultItems) {
      try {
        // Bitwardenからアイテム取得
        const item = await bitwardenClient.getItem(vaultItem.itemId);
        if (!item) {
          syncResults.errors++;
          syncResults.items.push({
            itemId: vaultItem.itemId,
            secretName: vaultItem.secretName,
            status: 'error',
            error: 'Item not found in Bitwarden',
          });
          continue;
        }
        
        // 値の抽出
        let secretValue = '';
        
        if (vaultItem.fieldName) {
          // 特定のフィールドから値を取得
          const field = item.fields?.find((f: any) => f.name === vaultItem.fieldName);
          if (field) {
            secretValue = field.value || '';
          } else {
            syncResults.errors++;
            syncResults.items.push({
              itemId: vaultItem.itemId,
              secretName: vaultItem.secretName,
              status: 'error',
              error: `Field '${vaultItem.fieldName}' not found`,
            });
            continue;
          }
        } else {
          // デフォルトの値を取得（ログインの場合はパスワード）
          if (item.login?.password) {
            secretValue = item.login.password;
          } else if (item.secureNote?.notes) {
            secretValue = item.secureNote.notes;
          } else {
            syncResults.errors++;
            syncResults.items.push({
              itemId: vaultItem.itemId,
              secretName: vaultItem.secretName,
              status: 'error',
              error: 'No suitable value found in item',
            });
            continue;
          }
        }
        
        // 既存のシークレットをチェック
        const existingSecret = await secretRepository.findFirst({
          where: [
            { serverId: syncRequest.serverId },
            { name: vaultItem.secretName }
          ]
        }).catch(() => null);
        
        if (existingSecret && !syncRequest.options.overwriteExisting) {
          syncResults.skipped++;
          syncResults.items.push({
            itemId: vaultItem.itemId,
            secretName: vaultItem.secretName,
            status: 'skipped',
            reason: 'Secret already exists',
          });
          continue;
        }
        
        // シークレットを作成または更新
        if (existingSecret) {
          await secretRepository.update(existingSecret.id, {
            encryptedValue: await bitwardenClient.encryptValue(secretValue),
            type: vaultItem.secretType,
            updatedAt: new Date(),
            // Bitwardenメタデータ
            tags: [...(existingSecret.tags || []), 'bitwarden-sync'],
            description: `Synchronized from Bitwarden item: ${item.name}`,
          });
        } else {
          await secretRepository.create({
            serverId: syncRequest.serverId,
            name: vaultItem.secretName,
            type: vaultItem.secretType,
            encryptedValue: await bitwardenClient.encryptValue(secretValue),
            description: `Synchronized from Bitwarden item: ${item.name}`,
            tags: ['bitwarden-sync'],
          });
        }
        
        syncResults.synchronized++;
        syncResults.items.push({
          itemId: vaultItem.itemId,
          secretName: vaultItem.secretName,
          status: 'synchronized',
          bitwardenItemName: item.name,
        });
        
      } catch (error) {
        syncResults.errors++;
        syncResults.items.push({
          itemId: vaultItem.itemId,
          secretName: vaultItem.secretName,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
    
    // レスポンスデータの構築
    const response = {
      success: syncResults.errors === 0,
      syncResults,
      summary: {
        totalItems: syncRequest.vaultItems.length,
        synchronized: syncResults.synchronized,
        skipped: syncResults.skipped,
        errors: syncResults.errors,
      },
      metadata: {
        requestId,
        serverId: syncRequest.serverId,
        syncedAt: new Date().toISOString(),
        bitwardenStatus: status.status,
        options: syncRequest.options,
      },
    };
    
    return createSuccessResponse(response, { requestId });
    
  } catch (error) {
    if (error instanceof BitwardenError) {
      return createErrorResponse(
        ERROR_CODES.BITWARDEN_ERROR,
        error.message,
        { requestId, details: { code: error.code } }
      );
    }
    
    console.error('Bitwarden sync failed:', error);
    return createErrorResponse(
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      'Failed to sync from Bitwarden',
      { requestId }
    );
  }
}

// API handlers with security & governance requirements
export const GET = apiHandler(handleSearchBitwardenItems, {
  requireAuth: true,
  rateLimit: { maxRequests: 50, windowMs: 60 * 1000 },
  enableAuditLog: false, // 検索操作は監査ログ不要
});

export const POST = apiHandler(handleSyncFromBitwarden, {
  requireAuth: true,
  rateLimit: { maxRequests: 10, windowMs: 60 * 1000 }, // 同期は制限を厳しく
  enableAuditLog: true, // 同期操作は監査ログが必要
});