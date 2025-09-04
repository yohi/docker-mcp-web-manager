import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  apiHandler,
  withValidation,
  createApiErrorResponse,
  createPaginatedResponse,
  paginationQuerySchema,
} from '../../../../../../lib/api/middleware';
import { BitwardenClient } from '../../../../../../lib/bitwarden';

/**
 * Bitwardenアイテム検索用のクエリスキーマ
 */
const bitwardenItemsQuerySchema = paginationQuerySchema.extend({
  search: z.string().max(100).optional(),
  type: z.enum(['login', 'note', 'card', 'identity']).optional(),
});

type BitwardenItemsQuery = z.infer<typeof bitwardenItemsQuerySchema>;

/**
 * GET /api/v1/secrets/bitwarden/items - Bitwardenアイテム一覧取得
 */
async function handleGetBitwardenItems(request: NextRequest): Promise<NextResponse> {
  return withValidation(
    request,
    bitwardenItemsQuerySchema,
    async (req: NextRequest, query: BitwardenItemsQuery) => {
      try {
        const bitwardenClient = BitwardenClient.getInstance();
        
        if (!bitwardenClient.isUnlocked()) {
          return createApiErrorResponse(
            'SECRET_003',
            'Bitwarden vault is locked. Please unlock it first.',
            401
          );
        }

        // Bitwardenからアイテムを取得
        const allItems = await bitwardenClient.listItems(query.search);
        
        // タイプフィルタリング
        let filteredItems = allItems;
        if (query.type) {
          filteredItems = allItems.filter(item => {
            switch (query.type) {
              case 'login': return item.type === 1;
              case 'note': return item.type === 2;
              case 'card': return item.type === 3;
              case 'identity': return item.type === 4;
              default: return true;
            }
          });
        }
        
        // セキュリティのため、パスワードなどの機密情報を除外
        const sanitizedItems = filteredItems.map(item => ({
          id: item.id,
          name: item.name,
          type: item.type,
          favorite: item.favorite,
          organizationId: item.organizationId,
          folderId: item.folderId,
          login: item.login ? {
            username: item.login.username,
            uris: item.login.uris,
            // パスワードは除外
          } : null,
          fields: item.fields ? item.fields.map(field => ({
            name: field.name,
            type: field.type,
            // 値は除外（セキュリティのため）
          })) : null,
          creationDate: item.creationDate,
          revisionDate: item.revisionDate,
        }));
        
        // ページネーション
        const total = sanitizedItems.length;
        const startIndex = (query.page - 1) * query.limit;
        const endIndex = startIndex + query.limit;
        const paginatedItems = sanitizedItems.slice(startIndex, endIndex);
        
        const response = createPaginatedResponse(
          paginatedItems,
          total,
          query.page,
          query.limit
        );
        
        return NextResponse.json({
          ...response,
          filters: {
            search: query.search,
            type: query.type,
          },
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Error fetching Bitwarden items:', error);
        return createApiErrorResponse(
          'SECRET_004',
          'Failed to fetch Bitwarden items',
          500,
          { error: error instanceof Error ? error.message : String(error) }
        );
      }
    }
  );
}

/**
 * ルートハンドラー
 */
export const GET = apiHandler(handleGetBitwardenItems, {
  requireAuth: true,
  rateLimit: { maxRequests: 50, windowMs: 60 * 1000 }, // 機密情報のため制限を厳しく
});