import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  apiHandler,
  withValidation,
  createApiErrorResponse,
} from '../../../../../lib/api/middleware';
import { getCatalogClient } from '../../../../../lib/docker-mcp';

/**
 * 人気サーバー取得用のクエリスキーマ
 */
const popularServersQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(50).default(10),
  category: z.string().max(50).optional(),
});

type PopularServersQuery = z.infer<typeof popularServersQuerySchema>;

/**
 * GET /api/v1/catalog/popular - 人気のMCPサーバー取得
 */
async function handleGetPopularServers(request: NextRequest): Promise<NextResponse> {
  return withValidation(
    request,
    popularServersQuerySchema,
    async (req: NextRequest, query: PopularServersQuery) => {
      try {
        const catalogClient = getCatalogClient();
        
        // 人気のサーバーを取得
        const popularServers = await catalogClient.getPopularServers(query.limit);
        
        // カテゴリフィルタリング（必要に応じて）
        let filteredServers = popularServers;
        if (query.category) {
          filteredServers = popularServers.filter(server => 
            server.category === query.category
          );
        }
        
        return NextResponse.json({
          data: {
            servers: filteredServers,
            count: filteredServers.length,
            filters: {
              limit: query.limit,
              category: query.category,
            },
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        console.error('Error fetching popular servers:', error);
        return createApiErrorResponse(
          'CATALOG_003',
          'Failed to fetch popular servers',
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
export const GET = apiHandler(handleGetPopularServers, {
  requireAuth: true,
  rateLimit: { maxRequests: 150, windowMs: 60 * 1000 },
});