import { NextRequest } from 'next/server';
import { 
  createErrorResponse,
  createSuccessResponse,
  createValidationErrorResponse,
  ERROR_CODES,
} from '@/lib/api/response';
import {
  validateRequest,
  CommonSchemas,
} from '@/lib/api/validation';
import { apiHandler } from '@/lib/api/middleware';
import { createSecretRepository } from '@/db/repositories';
import { encryptionService } from '@/lib/crypto/encryption-service';
import { z } from 'zod';

// =============================================================================
// /api/v1/config/secrets/[id] - 個別シークレット管理API
// 特定のシークレット情報の取得・更新・削除機能
// =============================================================================

// シークレット更新リクエストスキーマ
const UpdateSecretRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(['environment', 'credential', 'token', 'certificate', 'key']).optional(),
  value: z.string().min(1).optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

// シークレット取得クエリスキーマ（値の取得オプション）
const SecretQuerySchema = z.object({
  includeValue: z.boolean().optional().default(false), // セキュリティ上デフォルトはfalse
});

type UpdateSecretRequest = z.infer<typeof UpdateSecretRequestSchema>;
type SecretQuery = z.infer<typeof SecretQuerySchema>;

/**
 * シークレット詳細取得
 * GET /api/v1/config/secrets/[id]
 */
async function handleGetSecret(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  
  try {
    // パラメータとクエリのバリデーション
    const validation = await validateRequest(request, params, {
      params: z.object({ id: CommonSchemas.id }),
      query: SecretQuerySchema,
    });
    
    if (!validation.success) {
      return createValidationErrorResponse(validation.error, { requestId });
    }
    
    const { id } = validation.data.params;
    const query = validation.data.query;
    const secretRepository = createSecretRepository();
    
    // シークレット取得
    const secret = await secretRepository.findById(id);
    if (!secret) {
      return createErrorResponse(
        ERROR_CODES.RESOURCE_NOT_FOUND,
        `Secret with ID ${id} not found`,
        { requestId }
      );
    }
    
    // レスポンスデータの構築
    const response: any = {
      id: secret.id,
      serverId: secret.serverId,
      name: secret.name,
      type: secret.type,
      description: secret.description,
      tags: secret.tags,
      createdAt: secret.createdAt.toISOString(),
      updatedAt: secret.updatedAt.toISOString(),
      metadata: {
        requestId,
        hasValue: !!secret.encryptedValue,
        encrypted: true,
      },
    };
    
    // 値の取得が要求された場合（セキュリティ要注意）
    if (query.includeValue && secret.encryptedValue) {
      try {
        const decryptedValue = await encryptionService.decrypt(secret.encryptedValue);
        response.value = decryptedValue;
        response.metadata.valueIncluded = true;
        
        // セキュリティログ記録
        console.warn(`Secret value accessed: ${id} by user`); // TODO: ユーザー情報を追加
      } catch (error) {
        response.metadata.decryptionError = 'Failed to decrypt secret value';
        console.error(`Failed to decrypt secret ${id}:`, error);
      }
    }
    
    return createSuccessResponse(response, { requestId });
    
  } catch (error) {
    console.error('Secret retrieval failed:', error);
    return createErrorResponse(
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      'Failed to retrieve secret',
      { requestId }
    );
  }
}

/**
 * シークレット更新
 * PATCH /api/v1/config/secrets/[id]
 */
async function handleUpdateSecret(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  
  try {
    // パラメータとボディのバリデーション
    const validation = await validateRequest(request, params, {
      params: z.object({ id: CommonSchemas.id }),
      body: UpdateSecretRequestSchema,
    });
    
    if (!validation.success) {
      return createValidationErrorResponse(validation.error, { requestId });
    }
    
    const { id } = validation.data.params;
    const updateData = validation.data.body;
    const secretRepository = createSecretRepository();
    
    // シークレット存在確認
    const existingSecret = await secretRepository.findById(id);
    if (!existingSecret) {
      return createErrorResponse(
        ERROR_CODES.RESOURCE_NOT_FOUND,
        `Secret with ID ${id} not found`,
        { requestId }
      );
    }
    
    // 同名チェック（名前を変更する場合）
    if (updateData.name && updateData.name !== existingSecret.name) {
      const duplicateSecret = await secretRepository.findFirst({
        where: [
          { serverId: existingSecret.serverId },
          { name: updateData.name }
        ]
      }).catch(() => null);
      
      if (duplicateSecret) {
        return createErrorResponse(
          ERROR_CODES.RESOURCE_ALREADY_EXISTS,
          `Secret with name '${updateData.name}' already exists for this server`,
          { requestId }
        );
      }
    }
    
    // 更新データの構築
    const updateFields: any = {
      updatedAt: new Date(),
    };
    
    if (updateData.name) updateFields.name = updateData.name;
    if (updateData.type) updateFields.type = updateData.type;
    if (updateData.description !== undefined) updateFields.description = updateData.description;
    if (updateData.tags) updateFields.tags = updateData.tags;
    
    // 値の更新（暗号化）
    if (updateData.value) {
      updateFields.encryptedValue = await encryptionService.encrypt(updateData.value);
    }
    
    // シークレット更新
    await secretRepository.update(id, updateFields);
    
    // 更新されたシークレットを取得
    const updatedSecret = await secretRepository.findById(id);
    
    // レスポンスデータの構築（値は除外）
    const response = {
      id: updatedSecret!.id,
      serverId: updatedSecret!.serverId,
      name: updatedSecret!.name,
      type: updatedSecret!.type,
      description: updatedSecret!.description,
      tags: updatedSecret!.tags,
      createdAt: updatedSecret!.createdAt.toISOString(),
      updatedAt: updatedSecret!.updatedAt.toISOString(),
      metadata: {
        requestId,
        updated: Object.keys(updateData),
        valueUpdated: !!updateData.value,
      },
    };
    
    return createSuccessResponse(response, { requestId });
    
  } catch (error) {
    console.error('Secret update failed:', error);
    return createErrorResponse(
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      'Failed to update secret',
      { requestId }
    );
  }
}

/**
 * シークレット削除
 * DELETE /api/v1/config/secrets/[id]
 */
async function handleDeleteSecret(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  
  try {
    // パラメータのバリデーション
    const validation = await validateRequest(request, params, {
      params: z.object({ id: CommonSchemas.id }),
    });
    
    if (!validation.success) {
      return createValidationErrorResponse(validation.error, { requestId });
    }
    
    const { id } = validation.data.params;
    const secretRepository = createSecretRepository();
    
    // シークレット存在確認
    const existingSecret = await secretRepository.findById(id);
    if (!existingSecret) {
      return createErrorResponse(
        ERROR_CODES.RESOURCE_NOT_FOUND,
        `Secret with ID ${id} not found`,
        { requestId }
      );
    }
    
    // シークレット削除
    await secretRepository.delete(id);
    
    // レスポンスデータの構築
    const response = {
      id,
      deleted: true,
      deletedAt: new Date().toISOString(),
      metadata: {
        requestId,
        secretName: existingSecret.name,
        serverId: existingSecret.serverId,
      },
    };
    
    return createSuccessResponse(response, { requestId });
    
  } catch (error) {
    console.error('Secret deletion failed:', error);
    return createErrorResponse(
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      'Failed to delete secret',
      { requestId }
    );
  }
}

// API handlers with security & governance requirements
export const GET = apiHandler(handleGetSecret, {
  requireAuth: true,
  rateLimit: { maxRequests: 200, windowMs: 60 * 1000 },
  enableAuditLog: false, // GET操作は監査ログ不要（ただし値取得時は別途ログ記録）
});

export const PATCH = apiHandler(handleUpdateSecret, {
  requireAuth: true,
  rateLimit: { maxRequests: 50, windowMs: 60 * 1000 },
  enableAuditLog: true, // シークレット更新は監査ログが必要
});

export const DELETE = apiHandler(handleDeleteSecret, {
  requireAuth: true,
  rateLimit: { maxRequests: 20, windowMs: 60 * 1000 },
  enableAuditLog: true, // シークレット削除は監査ログが必要
});