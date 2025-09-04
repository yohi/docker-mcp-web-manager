import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  apiHandler,
  withValidation,
  createApiErrorResponse,
} from '../../../../../../../lib/api/middleware';
import { BitwardenClient } from '../../../../../../../lib/bitwarden';
import { validateAndSanitizeArgs } from '../../../../../../../lib/utils/command-security';

/**
 * 環境変数値取得用のクエリスキーマ
 */
const getValueQuerySchema = z.object({
  field: z.string().max(100).optional(),
  type: z.enum(['password', 'field']).default('password'),
});

type GetValueQuery = z.infer<typeof getValueQuerySchema>;

/**
 * GET /api/v1/secrets/bitwarden/items/[id]/value - Bitwardenアイテムから値取得
 */
async function handleGetItemValue(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  return withValidation(
    request,
    getValueQuerySchema,
    async (req: NextRequest, query: GetValueQuery) => {
      try {
        const sanitizedId = validateAndSanitizeArgs({ serverId: params.id }).serverId!;
        const bitwardenClient = BitwardenClient.getInstance();
        
        if (!bitwardenClient.isUnlocked()) {
          return createApiErrorResponse(
            'SECRET_005',
            'Bitwarden vault is locked. Please unlock it first.',
            401
          );
        }

        let value: string | null = null;
        
        if (query.type === 'field' && query.field) {
          // 指定されたフィールドから値を取得
          value = await bitwardenClient.getEnvironmentValue(sanitizedId, query.field);
        } else {
          // パスワードを取得
          value = await bitwardenClient.getPassword(sanitizedId);
        }
        
        if (value === null) {
          return createApiErrorResponse(
            'SECRET_006',
            'Value not found in Bitwarden item',
            404,
            { 
              itemId: sanitizedId,
              field: query.field,
              type: query.type 
            }
          );
        }
        
        // セキュリティ考慮：値をマスクして返すか、使用場所を制限
        return NextResponse.json({
          data: {
            itemId: sanitizedId,
            field: query.field,
            type: query.type,
            hasValue: true,
            valueLength: value.length,
            // 実際の値は返さない（セキュリティのため）
            // value: value, // 本番環境では削除
            preview: value.substring(0, 3) + '*'.repeat(Math.max(0, value.length - 6)) + value.substring(Math.max(3, value.length - 3)),
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        console.error(`Error fetching value from Bitwarden item ${params.id}:`, error);
        return createApiErrorResponse(
          'SECRET_007',
          `Failed to fetch value from Bitwarden item ${params.id}`,
          500,
          { 
            itemId: params.id,
            field: query.field,
            error: error instanceof Error ? error.message : String(error) 
          }
        );
      }
    }
  );
}

/**
 * 内部使用専用のエンドポイント（実際の値を返す）
 * POST /api/v1/secrets/bitwarden/items/[id]/value - 内部使用のみ
 */
async function handleGetActualValue(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  return withValidation(
    request,
    getValueQuerySchema,
    async (req: NextRequest, query: GetValueQuery) => {
      try {
        const sanitizedId = validateAndSanitizeArgs({ serverId: params.id }).serverId!;
        const bitwardenClient = BitwardenClient.getInstance();
        
        if (!bitwardenClient.isUnlocked()) {
          return createApiErrorResponse(
            'SECRET_008',
            'Bitwarden vault is locked. Please unlock it first.',
            401
          );
        }

        let value: string | null = null;
        
        if (query.type === 'field' && query.field) {
          value = await bitwardenClient.getEnvironmentValue(sanitizedId, query.field);
        } else {
          value = await bitwardenClient.getPassword(sanitizedId);
        }
        
        if (value === null) {
          return createApiErrorResponse(
            'SECRET_009',
            'Value not found in Bitwarden item',
            404,
            { 
              itemId: sanitizedId,
              field: query.field,
              type: query.type 
            }
          );
        }
        
        return NextResponse.json({
          data: {
            itemId: sanitizedId,
            field: query.field,
            type: query.type,
            value: value, // 内部使用のため実際の値を返す
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        console.error(`Error fetching actual value from Bitwarden item ${params.id}:`, error);
        return createApiErrorResponse(
          'SECRET_010',
          `Failed to fetch actual value from Bitwarden item ${params.id}`,
          500,
          { 
            itemId: params.id,
            field: query.field,
            error: error instanceof Error ? error.message : String(error) 
          }
        );
      }
    }
  );
}

/**
 * ルートハンドラー
 */
export const GET = apiHandler(
  (request: NextRequest, context: any) => handleGetItemValue(request, context),
  {
    requireAuth: true,
    rateLimit: { maxRequests: 30, windowMs: 60 * 1000 }, // 機密情報のため制限を厳しく
  }
);

export const POST = apiHandler(
  (request: NextRequest, context: any) => handleGetActualValue(request, context),
  {
    requireAdmin: true, // 実際の値は管理者のみ
    rateLimit: { maxRequests: 10, windowMs: 60 * 1000 }, // 非常に厳しく制限
  }
);