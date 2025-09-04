import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  apiHandler,
  withValidation,
  createApiErrorResponse,
} from '../../../../../lib/api/middleware';

/**
 * 設定エクスポート用のクエリスキーマ
 */
const exportConfigQuerySchema = z.object({
  format: z.enum(['json', 'yaml']).default('json'),
  include: z.array(z.enum(['servers', 'secrets', 'users', 'system'])).default(['servers']),
  compress: z.coerce.boolean().default(false),
});

type ExportConfigQuery = z.infer<typeof exportConfigQuerySchema>;

/**
 * GET /api/v1/config/export - 設定エクスポート
 */
async function handleExportConfig(request: NextRequest): Promise<NextResponse> {
  return withValidation(
    request,
    exportConfigQuerySchema,
    async (req: NextRequest, query: ExportConfigQuery) => {
      try {
        // 実際の実装では、データベースから設定を取得してエクスポート形式に変換
        const exportData = {
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
          includes: query.include,
          data: {
            servers: [], // 実際にはデータベースから取得
            secrets: query.include.includes('secrets') ? [] : undefined,
            users: query.include.includes('users') ? [] : undefined,
            system: query.include.includes('system') ? {} : undefined,
          },
        };

        const filename = `mcp-config-export-${new Date().toISOString().split('T')[0]}.${query.format}`;
        
        let content: string;
        let contentType: string;
        
        if (query.format === 'yaml') {
          // 実際の実装では yaml ライブラリを使用
          content = JSON.stringify(exportData, null, 2); // 仮実装
          contentType = 'application/x-yaml';
        } else {
          content = JSON.stringify(exportData, null, 2);
          contentType = 'application/json';
        }

        const response = new NextResponse(content, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Content-Disposition': `attachment; filename="${filename}"`,
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
          },
        });

        return response;
      } catch (error) {
        console.error('Error exporting config:', error);
        return createApiErrorResponse(
          'CONFIG_001',
          'Failed to export configuration',
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
export const GET = apiHandler(handleExportConfig, {
  requireAuth: true,
  rateLimit: { maxRequests: 10, windowMs: 60 * 1000 }, // エクスポートは制限を厳しく
});