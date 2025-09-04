import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  apiHandler,
  withValidation,
  createApiErrorResponse,
  createPaginatedResponse,
} from '../../../../lib/api/middleware';
import { getCatalogClient } from '../../../../lib/docker-mcp';

/**
 * カタログ取得用のクエリスキーマ
 */
const catalogQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
  category: z.string().max(50).optional(),
  sort_by: z.enum(['name', 'popularity', 'created_at', 'updated_at']).default('popularity'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

type CatalogQuery = z.infer<typeof catalogQuerySchema>;

/**
 * GET /api/v1/catalog - MCPサーバーカタログ取得
 */
async function handleGetCatalog(request: NextRequest): Promise<NextResponse> {
  return withValidation(
    request,
    catalogQuerySchema,
    async (req: NextRequest, query: CatalogQuery) => {
      try {
        const catalogClient = getCatalogClient();
        
        // カタログクライアントからデータを取得
        const catalogResponse = await catalogClient.getCatalog({
          page: query.page,
          limit: query.limit,
          search: query.search,
          category: query.category,
        });
        
        // ソート処理（クライアント側でソートが必要な場合）
        let sortedEntries = catalogResponse.entries;
        
        if (query.sort_by && query.sort_by !== 'popularity') {
          // popularityはデフォルトでソートされているため、他の場合のみ処理
          sortedEntries = [...catalogResponse.entries].sort((a, b) => {
            let comparison = 0;
            
            switch (query.sort_by) {
              case 'name':
                comparison = a.name.localeCompare(b.name);
                break;
              case 'created_at':
                comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                break;
              case 'updated_at':
                comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
                break;
            }
            
            return query.sort_order === 'desc' ? -comparison : comparison;
          });
        }
        
        // レスポンス作成
        const response = createPaginatedResponse(
          sortedEntries,
          catalogResponse.total,
          query.page,
          query.limit
        );
        
        return NextResponse.json({
          ...response,
          filters: {
            search: query.search,
            category: query.category,
            sort_by: query.sort_by,
            sort_order: query.sort_order,
          },
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Error fetching catalog:', error);
        return createApiErrorResponse(
          'CATALOG_001',
          'Failed to fetch MCP server catalog',
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
export const GET = apiHandler(handleGetCatalog, {
  requireAuth: true,
  rateLimit: { maxRequests: 100, windowMs: 60 * 1000 },
});