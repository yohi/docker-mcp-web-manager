import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  checkPermissions,
  PERMISSIONS,
  validateRequest,
  createErrorResponse,
  createValidationErrorResponse,
  ERROR_CODES,
  logAPIRequest,
} from '@/lib/api/middleware';
import { SettingsRepository } from '@/lib/repositories/settings-repository';

// =============================================================================
// 設定復元API
// =============================================================================

const RestoreSchema = z.object({
  backupData: z.object({
    version: z.string(),
    timestamp: z.string(),
    createdBy: z.string(),
    format: z.enum(['json', 'yaml']),
    includePasswords: z.boolean(),
    settings: z.record(z.string(), z.any()),
  }),
  options: z.object({
    overwriteExisting: z.boolean().default(false),
    validateOnly: z.boolean().default(false),
    selectiveRestore: z.object({
      general: z.boolean().default(true),
      docker: z.boolean().default(true),
      security: z.boolean().default(true),
      monitoring: z.boolean().default(true),
    }).optional(),
  }).default({
    overwriteExisting: false,
    validateOnly: false,
  }),
});

/**
 * POST /api/v1/settings/restore
 * バックアップからの設定復元
 */
export async function POST(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();

  try {
    // 認証・認可チェック（管理者のみ）
    const authResult = await checkPermissions([PERMISSIONS.SETTINGS_WRITE], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('POST', '/api/v1/settings/restore', requestId, {
        statusCode: 401,
        error: authResult.error,
      });
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    if (authResult.session.user.role !== 'ADMIN') {
      logAPIRequest('POST', '/api/v1/settings/restore', requestId, {
        userId: authResult.session.user.id,
        statusCode: 403,
        error: 'Admin role required',
      });

      return createErrorResponse(
        ERROR_CODES.FORBIDDEN,
        'Administrator privileges required to restore settings',
        { requestId }
      );
    }

    // リクエストボディのバリデーション
    const validation = await validateRequest(request, {}, {
      body: RestoreSchema,
    });

    if (!validation.success) {
      const error = validation.errors!.body!;
      return createValidationErrorResponse(error, requestId);
    }

    const { backupData, options } = validation.data!.body;

    // バックアップデータの整合性検証
    const validationResult = await validateBackupData(backupData);
    if (!validationResult.valid) {
      logAPIRequest('POST', '/api/v1/settings/restore', requestId, {
        userId: authResult.session.user.id,
        statusCode: 400,
        error: 'Invalid backup data',
        details: { validationErrors: validationResult.errors },
      });

      return createErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        `Invalid backup data: ${validationResult.errors.join(', ')}`,
        { requestId }
      );
    }

    // バリデーションのみの場合
    if (options.validateOnly) {
      const duration = Date.now() - startTime;
      
      logAPIRequest('POST', '/api/v1/settings/restore', requestId, {
        userId: authResult.session.user.id,
        userRole: authResult.session.user.role,
        duration,
        statusCode: 200,
        details: {
          validateOnly: true,
          backupVersion: backupData.version,
          backupTimestamp: backupData.timestamp,
        },
      });

      return Response.json({
        success: true,
        data: {
          valid: true,
          backupInfo: {
            version: backupData.version,
            timestamp: backupData.timestamp,
            createdBy: backupData.createdBy,
            format: backupData.format,
            includePasswords: backupData.includePasswords,
          },
          previewChanges: await generateRestorePreview(backupData.settings, options),
        },
        metadata: {
          requestId,
          timestamp: new Date().toISOString(),
          duration,
          validationOnly: true,
        },
      });
    }

    // 現在の設定をバックアップ（ロールバック用）
    const settingsRepository = new SettingsRepository();
    const currentSettings = await settingsRepository.getAll();

    try {
      // 設定の復元実行
      const restoreResult = await executeRestore(
        backupData.settings,
        options,
        settingsRepository
      );

      // 復元後の整合性検証
      const newSettings = await settingsRepository.getAll();
      const integrityCheck = await validateSettingsIntegrity(newSettings);
      
      if (!integrityCheck.valid) {
        // 整合性エラーの場合はロールバック
        console.warn('[RESTORE_INTEGRITY_ERROR]', integrityCheck.errors);
        await rollbackSettings(currentSettings, settingsRepository);
        
        return createErrorResponse(
          ERROR_CODES.VALIDATION_ERROR,
          `Restored settings failed integrity check: ${integrityCheck.errors.join(', ')}`,
          { requestId }
        );
      }

      const duration = Date.now() - startTime;

      // 監査ログ
      logAPIRequest('POST', '/api/v1/settings/restore', requestId, {
        userId: authResult.session.user.id,
        userRole: authResult.session.user.role,
        duration,
        statusCode: 200,
        details: {
          backupVersion: backupData.version,
          backupTimestamp: backupData.timestamp,
          backupCreatedBy: backupData.createdBy,
          restoredCategories: restoreResult.restoredCategories,
          changesCount: restoreResult.changesCount,
          overwriteExisting: options.overwriteExisting,
        },
      });

      return Response.json({
        success: true,
        data: {
          restored: true,
          backupInfo: {
            version: backupData.version,
            timestamp: backupData.timestamp,
            createdBy: backupData.createdBy,
          },
          restoreResult: {
            restoredCategories: restoreResult.restoredCategories,
            changesCount: restoreResult.changesCount,
            skippedSettings: restoreResult.skippedSettings,
          },
        },
        metadata: {
          requestId,
          timestamp: new Date().toISOString(),
          duration,
          restoredAt: new Date().toISOString(),
        },
      });

    } catch (restoreError) {
      // 復元エラーの場合はロールバック
      console.error('[RESTORE_ERROR]', restoreError);
      await rollbackSettings(currentSettings, settingsRepository);
      throw restoreError;
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] POST /api/v1/settings/restore:', error);
    
    logAPIRequest('POST', '/api/v1/settings/restore', requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to restore settings',
      { requestId }
    );
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * バックアップデータの検証
 */
async function validateBackupData(backupData: any): Promise<{
  valid: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  // バージョン検証
  if (!backupData.version || typeof backupData.version !== 'string') {
    errors.push('Missing or invalid backup version');
  }

  // タイムスタンプ検証
  if (!backupData.timestamp || isNaN(new Date(backupData.timestamp).getTime())) {
    errors.push('Missing or invalid backup timestamp');
  }

  // 設定データの検証
  if (!backupData.settings || typeof backupData.settings !== 'object') {
    errors.push('Missing or invalid settings data');
  } else {
    // 各カテゴリの基本的な構造検証
    const validCategories = ['general', 'docker', 'security', 'monitoring'];
    for (const [category, data] of Object.entries(backupData.settings)) {
      if (!validCategories.includes(category)) {
        errors.push(`Unknown settings category: ${category}`);
      }
      
      if (data !== null && typeof data !== 'object') {
        errors.push(`Invalid data type for category ${category}`);
      }
    }
  }

  // バックアップフォーマット検証
  if (backupData.format && !['json', 'yaml'].includes(backupData.format)) {
    errors.push('Unsupported backup format');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 復元プレビューの生成
 */
async function generateRestorePreview(
  backupSettings: any,
  options: any
): Promise<{
  changes: Array<{
    category: string;
    action: 'create' | 'update' | 'skip';
    setting: string;
    currentValue?: any;
    newValue?: any;
  }>;
  summary: {
    totalChanges: number;
    newSettings: number;
    updatedSettings: number;
    skippedSettings: number;
  };
}> {
  const settingsRepository = new SettingsRepository();
  const currentSettings = await settingsRepository.getAll();
  
  const changes: any[] = [];
  let newSettings = 0;
  let updatedSettings = 0;
  let skippedSettings = 0;

  const categoriesToRestore = options.selectiveRestore || {
    general: true,
    docker: true,
    security: true,
    monitoring: true,
  };

  for (const [category, categoryData] of Object.entries(backupSettings)) {
    if (!categoriesToRestore[category]) {
      continue;
    }

    if (!categoryData || typeof categoryData !== 'object') {
      continue;
    }

    const currentCategoryData = (currentSettings as any)[category] || {};

    for (const [setting, value] of Object.entries(categoryData)) {
      const currentValue = (currentCategoryData as any)[setting];
      const hasCurrentValue = currentValue !== undefined;

      if (!hasCurrentValue) {
        changes.push({
          category,
          action: 'create',
          setting,
          newValue: value,
        });
        newSettings++;
      } else if (JSON.stringify(currentValue) !== JSON.stringify(value)) {
        if (options.overwriteExisting) {
          changes.push({
            category,
            action: 'update',
            setting,
            currentValue,
            newValue: value,
          });
          updatedSettings++;
        } else {
          changes.push({
            category,
            action: 'skip',
            setting,
            currentValue,
            newValue: value,
          });
          skippedSettings++;
        }
      }
    }
  }

  return {
    changes,
    summary: {
      totalChanges: changes.length,
      newSettings,
      updatedSettings,
      skippedSettings,
    },
  };
}

/**
 * 設定復元の実行
 */
async function executeRestore(
  backupSettings: any,
  options: any,
  settingsRepository: SettingsRepository
): Promise<{
  restoredCategories: string[];
  changesCount: number;
  skippedSettings: string[];
}> {
  const restoredCategories: string[] = [];
  const skippedSettings: string[] = [];
  let changesCount = 0;

  const categoriesToRestore = options.selectiveRestore || {
    general: true,
    docker: true,
    security: true,
    monitoring: true,
  };

  const currentSettings = await settingsRepository.getAll();

  for (const [category, categoryData] of Object.entries(backupSettings)) {
    if (!categoriesToRestore[category] || !categoryData || typeof categoryData !== 'object') {
      continue;
    }

    const currentCategoryData = (currentSettings as any)[category] || {};
    const updatedCategoryData = { ...currentCategoryData };
    let categoryChanged = false;

    for (const [setting, value] of Object.entries(categoryData)) {
      const currentValue = (currentCategoryData as any)[setting];
      const hasCurrentValue = currentValue !== undefined;

      if (!hasCurrentValue || options.overwriteExisting) {
        if (JSON.stringify(currentValue) !== JSON.stringify(value)) {
          (updatedCategoryData as any)[setting] = value;
          categoryChanged = true;
          changesCount++;
        }
      } else {
        skippedSettings.push(`${category}.${setting}`);
      }
    }

    if (categoryChanged) {
      await settingsRepository.updateCategory(category, updatedCategoryData);
      restoredCategories.push(category);
    }
  }

  return {
    restoredCategories,
    changesCount,
    skippedSettings,
  };
}

/**
 * 設定の整合性検証
 */
async function validateSettingsIntegrity(settings: any): Promise<{
  valid: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  // 基本的な整合性検証（設定API のものと同じ）
  if (settings.docker?.host && !isValidUrl(settings.docker.host)) {
    errors.push('Invalid Docker host URL');
  }

  if (settings.docker?.registry?.url && !isValidUrl(settings.docker.registry.url)) {
    errors.push('Invalid Docker registry URL');
  }

  if (settings.security?.sessionTimeout) {
    const timeout = settings.security.sessionTimeout;
    if (timeout < 300 || timeout > 86400) {
      errors.push('Session timeout must be between 5 minutes and 24 hours');
    }
  }

  if (settings.monitoring?.backup?.schedule) {
    const schedule = settings.monitoring.backup.schedule;
    if (!isValidCronExpression(schedule)) {
      errors.push('Invalid cron expression for backup schedule');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 設定のロールバック
 */
async function rollbackSettings(
  originalSettings: any,
  settingsRepository: SettingsRepository
): Promise<void> {
  const rollbackPromises = Object.entries(originalSettings).map(([category, data]) =>
    settingsRepository.updateCategory(category, data)
  );

  await Promise.all(rollbackPromises);
  console.info('[SETTINGS_ROLLBACK] Settings rolled back to previous state');
}

/**
 * URL検証ヘルパー
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Cron式検証ヘルパー（簡易版）
 */
function isValidCronExpression(cron: string): boolean {
  const parts = cron.trim().split(/\s+/);
  return parts.length >= 5 && parts.length <= 6;
}