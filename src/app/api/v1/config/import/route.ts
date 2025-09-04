import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  apiHandler,
  withValidation,
  createApiErrorResponse,
} from '../../../../../lib/api/middleware';

/**
 * 設定インポート用のボディスキーマ
 */
const importConfigSchema = z.object({
  config: z.record(z.any()),
  overwrite: z.boolean().default(false),
  dryRun: z.boolean().default(false),
  include: z.array(z.enum(['servers', 'secrets', 'users', 'system'])).optional(),
});

type ImportConfigRequest = z.infer<typeof importConfigSchema>;

/**
 * POST /api/v1/config/import - 設定インポート
 */
async function handleImportConfig(request: NextRequest): Promise<NextResponse> {
  return withValidation(
    request,
    importConfigSchema,
    async (req: NextRequest, importData: ImportConfigRequest) => {
      try {
        // 設定の検証
        const configValidationResult = validateImportConfig(importData.config);
        
        if (!configValidationResult.valid) {
          return createApiErrorResponse(
            'CONFIG_002',
            'Invalid configuration format',
            400,
            { 
              errors: configValidationResult.errors,
              config: importData.config 
            }
          );
        }

        // Dry run モード
        if (importData.dryRun) {
          return NextResponse.json({
            data: {
              dryRun: true,
              changes: analyzeConfigChanges(importData.config, importData.overwrite),
              valid: true,
              message: 'Configuration validation successful (dry run)',
              timestamp: new Date().toISOString(),
            },
          });
        }

        // 実際のインポート処理
        const importResult = await executeConfigImport(
          importData.config,
          importData.overwrite,
          importData.include
        );

        return NextResponse.json({
          data: {
            imported: true,
            changes: importResult.changes,
            warnings: importResult.warnings,
            message: 'Configuration imported successfully',
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        console.error('Error importing config:', error);
        return createApiErrorResponse(
          'CONFIG_003',
          'Failed to import configuration',
          500,
          { 
            config: importData.config,
            error: error instanceof Error ? error.message : String(error) 
          }
        );
      }
    }
  );
}

/**
 * 設定の検証
 */
function validateImportConfig(config: any): { valid: boolean; errors?: string[] } {
  const errors: string[] = [];

  if (!config || typeof config !== 'object') {
    errors.push('Configuration must be an object');
    return { valid: false, errors };
  }

  if (!config.version) {
    errors.push('Configuration version is required');
  }

  if (config.data && typeof config.data !== 'object') {
    errors.push('Configuration data must be an object');
  }

  // 追加の検証ロジック...

  return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
}

/**
 * 設定変更の分析
 */
function analyzeConfigChanges(config: any, overwrite: boolean): any {
  // 実際の実装では、現在の設定と比較して変更を分析
  return {
    servers: {
      added: 0,
      updated: 0,
      removed: 0,
    },
    secrets: {
      added: 0,
      updated: 0,
      removed: 0,
    },
    // その他の変更...
  };
}

/**
 * 設定インポートの実行
 */
async function executeConfigImport(
  config: any,
  overwrite: boolean,
  include?: string[]
): Promise<{ changes: any; warnings: string[] }> {
  // 実際の実装では、データベースに設定を保存
  return {
    changes: analyzeConfigChanges(config, overwrite),
    warnings: [],
  };
}

/**
 * ルートハンドラー
 */
export const POST = apiHandler(handleImportConfig, {
  requireAdmin: true, // インポートは管理者のみ
  rateLimit: { maxRequests: 5, windowMs: 60 * 1000 }, // インポートは非常に制限を厳しく
});