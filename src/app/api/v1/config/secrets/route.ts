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
// /api/v1/config/secrets - シークレット管理API
// 暗号化されたシークレット情報の管理機能
// =============================================================================

// シークレット作成リクエストスキーマ
const CreateSecretRequestSchema = z.object({
  serverId: CommonSchemas.id,
  name: z.string().min(1, 'Secret name is required').max(100, 'Secret name too long'),
  type: z.enum(['environment', 'credential', 'token', 'certificate', 'key']),
  value: z.string().min(1, 'Secret value is required'),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

// シークレット更新リクエストスキーマ
const UpdateSecretRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(['environment', 'credential', 'token', 'certificate', 'key']).optional(),
  value: z.string().min(1).optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

// シークレット検索クエリスキーマ
const SecretsQuerySchema = z.object({
  page: z.number().min(1).optional().default(1),
  limit: z.number().min(1).max(100).optional().default(20),
  sort_by: z.enum(['name', 'type', 'created_at', 'updated_at']).optional().default('created_at'),
  sort_order: z.enum(['asc', 'desc']).optional().default('desc'),
  serverId: CommonSchemas.id.optional(),
  type: z.enum(['environment', 'credential', 'token', 'certificate', 'key']).optional(),
  search: z.string().optional(), // 名前での部分一致検索
});

type CreateSecretRequest = z.infer<typeof CreateSecretRequestSchema>;
type UpdateSecretRequest = z.infer<typeof UpdateSecretRequestSchema>;
type SecretsQuery = z.infer<typeof SecretsQuerySchema>;

/**
 * シークレット一覧取得
 * GET /api/v1/config/secrets
 */
async function handleGetSecrets(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  
  try {
    // クエリパラメータのバリデーション
    const validation = await validateRequest(request, {}, {
      query: SecretsQuerySchema,
    });
    
    if (!validation.success) {
      return createValidationErrorResponse(validation.error, { requestId });
    }
    
    const query = validation.data.query;
    const secretRepository = createSecretRepository();
    
    // 検索条件の構築
    const whereConditions: any[] = [];
    
    if (query.serverId) {
      whereConditions.push({ serverId: query.serverId });
    }
    if (query.type) {
      whereConditions.push({ type: query.type });
    }
    if (query.search) {
      whereConditions.push({ name: { like: `%${query.search}%` } });
    }
    
    const offset = (query.page - 1) * query.limit;
    
    const [secrets, total] = await Promise.all([
      secretRepository.findMany({
        where: whereConditions,
        orderBy: { [query.sort_by]: query.sort_order },
        limit: query.limit,
        offset,
      }),
      secretRepository.count({ where: whereConditions }),
    ]);
    
    // レスポンスデータの構築（値は除外）
    const response = {
      data: secrets.map(secret => ({
        id: secret.id,
        serverId: secret.serverId,
        name: secret.name,
        type: secret.type,
        description: secret.description,
        tags: secret.tags,
        // セキュリティ: 実際の値は返さない
        hasValue: !!secret.encryptedValue,
        createdAt: secret.createdAt.toISOString(),
        updatedAt: secret.updatedAt.toISOString(),
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
        hasNext: offset + query.limit < total,
        hasPrev: query.page > 1,
      },
      metadata: {
        requestId,
        filters: {
          serverId: query.serverId,
          type: query.type,
          search: query.search,
        },
        sort: {
          sort_by: query.sort_by,
          sort_order: query.sort_order,
        },
      },
    };
    
    return createSuccessResponse(response, { requestId });
    
  } catch (error) {
    console.error('Secrets retrieval failed:', error);
    return createErrorResponse(
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      'Failed to retrieve secrets',
      { requestId }
    );
  }
}

/**
 * シークレット作成
 * POST /api/v1/config/secrets
 */
async function handleCreateSecret(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  
  try {
    // リクエストのバリデーション
    const validation = await validateRequest(request, {}, {
      body: CreateSecretRequestSchema,
    });
    
    if (!validation.success) {
      return createValidationErrorResponse(validation.error, { requestId });
    }
    
    const secretData = validation.data.body;
    const secretRepository = createSecretRepository();
    
    // 同名のシークレットが同じサーバーに存在しないかチェック
    const existingSecret = await secretRepository.findFirst({
      where: [
        { serverId: secretData.serverId },
        { name: secretData.name }
      ]
    }).catch(() => null);
    
    if (existingSecret) {
      return createErrorResponse(
        ERROR_CODES.RESOURCE_ALREADY_EXISTS,
        `Secret with name '${secretData.name}' already exists for server ${secretData.serverId}`,
        { requestId }
      );
    }
    
    // 値を暗号化
    const encryptedValue = await encryptionService.encrypt(secretData.value);
    
    // シークレット作成
    const secret = await secretRepository.create({
      serverId: secretData.serverId,
      name: secretData.name,
      type: secretData.type,
      encryptedValue,
      description: secretData.description,
      tags: secretData.tags || [],
    });
    
    // レスポンスデータの構築（値は除外）
    const response = {
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
        encrypted: true,
      },
    };
    
    return createSuccessResponse(response, { requestId, statusCode: 201 });
    
  } catch (error) {
    console.error('Secret creation failed:', error);
    return createErrorResponse(
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      'Failed to create secret',
      { requestId }
    );
  }
}

// API handlers with security & governance requirements
export const GET = apiHandler(handleGetSecrets, {
  requireAuth: true,
  rateLimit: { maxRequests: 100, windowMs: 60 * 1000 },
  enableAuditLog: false, // GET操作は監査ログ不要
});

export const POST = apiHandler(handleCreateSecret, {
  requireAuth: true,
  rateLimit: { maxRequests: 20, windowMs: 60 * 1000 }, // シークレット作成は制限を厳しく
  enableAuditLog: true, // シークレット作成は監査ログが必要
});