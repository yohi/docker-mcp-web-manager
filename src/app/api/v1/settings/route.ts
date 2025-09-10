import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  requirePermissions,
  PERMISSIONS,
  validateRequest,
  createErrorResponse,
  createValidationErrorResponse,
  ERROR_CODES,
  logAPIRequest,
} from '@/lib/api/middleware';
import { SettingsRepository } from '@/lib/repositories/settings-repository';
import { CommonSchemas } from '@/lib/api/schemas';
import { encryptSensitiveData, decryptSensitiveData } from '@/lib/crypto/encryption';

// =============================================================================
// 設定管理API
// =============================================================================

// 設定スキーマの定義
const SettingsSchemas = {
  update: z.object({
    general: z.object({
      siteName: z.string().min(1).max(100).optional(),
      siteDescription: z.string().max(500).optional(),
      timezone: z.string().optional(),
      language: z.enum(['ja', 'en']).optional(),
      theme: z.enum(['light', 'dark', 'auto']).optional(),
    }).optional(),
    docker: z.object({
      host: z.string().url().optional(),
      tlsVerify: z.boolean().optional(),
      registry: z.object({
        url: z.string().url().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
      }).optional(),
      resources: z.object({
        defaultCpuLimit: z.number().min(0.1).max(16).optional(),
        defaultMemoryLimit: z.number().min(128).max(32768).optional(),
        defaultStorageLimit: z.number().min(1024).optional(),
      }).optional(),
    }).optional(),
    security: z.object({
      sessionTimeout: z.number().min(300).max(86400).optional(), // 5分〜24時間
      passwordPolicy: z.object({
        minLength: z.number().min(8).max(128).optional(),
        requireUppercase: z.boolean().optional(),
        requireLowercase: z.boolean().optional(),
        requireNumbers: z.boolean().optional(),
        requireSpecial: z.boolean().optional(),
      }).optional(),
      rateLimiting: z.object({
        enabled: z.boolean().optional(),
        maxRequests: z.number().min(10).max(10000).optional(),
        windowMs: z.number().min(60000).max(3600000).optional(), // 1分〜1時間
      }).optional(),
      cors: z.object({
        enabled: z.boolean().optional(),
        origins: z.array(z.string().url()).optional(),
      }).optional(),
    }).optional(),
    monitoring: z.object({
      metricsRetention: z.number().min(1).max(365).optional(), // 1〜365日
      alerting: z.object({
        enabled: z.boolean().optional(),
        cpuThreshold: z.number().min(0).max(100).optional(),
        memoryThreshold: z.number().min(0).max(100).optional(),
        diskThreshold: z.number().min(0).max(100).optional(),
        emailNotifications: z.boolean().optional(),
      }).optional(),
      backup: z.object({
        enabled: z.boolean().optional(),
        schedule: z.string().optional(), // cron expression
        retention: z.number().min(1).max(90).optional(), // 1〜90日
        destination: z.enum(['local', 's3', 'gcs']).optional(),
        credentials: z.record(z.string(), z.string()).optional(),
      }).optional(),
    }).optional(),
  }),
  backup: z.object({
    includePasswords: z.boolean().default(false),
    format: z.enum(['json', 'yaml']).default('json'),
  }),
  restore: z.object({
    overwriteExisting: z.boolean().default(false),
    validateOnly: z.boolean().default(false),
    data: z.record(z.string(), z.any()),
  }),
};

/**
 * GET /api/v1/settings
 * システム設定の取得
 */
export async function GET(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();

  try {
    // 認証・認可チェック
    const authResult = await requirePermissions([PERMISSIONS.SETTINGS_READ], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('GET', '/api/v1/settings', requestId, {
        statusCode: 401,
        error: authResult.error,
      });
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    // クエリパラメータのバリデーション
    const validation = await validateRequest(request, {}, {
      query: z.object({
        category: z.enum(['general', 'docker', 'security', 'monitoring']).optional(),
        includeSensitive: z.string().transform(val => val === 'true').default('false'),
      }),
    });

    if (!validation.success) {
      const error = validation.errors!.query!;
      return createValidationErrorResponse(error, requestId);
    }

    const query = validation.data!.query;
    
    // 設定データの取得
    const settingsRepository = new SettingsRepository();
    const allSettings = await settingsRepository.getAll();

    // カテゴリ別フィルタリング
    const filteredSettings = query.category 
      ? { [query.category]: allSettings[query.category] || {} }
      : allSettings;

    // 機密データの処理
    const processedSettings = await processSensitiveSettings(
      filteredSettings,
      query.includeSensitive,
      authResult.session.user.role === 'ADMIN'
    );

    const duration = Date.now() - startTime;

    // 監査ログ
    logAPIRequest('GET', '/api/v1/settings', requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: 200,
      details: {
        category: query.category || 'all',
        includeSensitive: query.includeSensitive,
        settingsCount: Object.keys(filteredSettings).length,
      },
    });

    return Response.json({
      success: true,
      data: processedSettings,
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
        duration,
        category: query.category || 'all',
        sensitiveDataIncluded: query.includeSensitive,
      },
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] GET /api/v1/settings:', error);
    
    logAPIRequest('GET', '/api/v1/settings', requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to retrieve settings',
      { requestId }
    );
  }
}

/**
 * PATCH /api/v1/settings
 * システム設定の更新
 */
export async function PATCH(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();

  try {
    // 認証・認可チェック（管理者のみ）
    const authResult = await requirePermissions([PERMISSIONS.SETTINGS_MANAGE], request);
    if (!authResult.valid || !authResult.session) {
      logAPIRequest('PATCH', '/api/v1/settings', requestId, {
        statusCode: 401,
        error: authResult.error,
      });
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    // 管理者権限チェック
    if (authResult.session.user.role !== 'ADMIN') {
      logAPIRequest('PATCH', '/api/v1/settings', requestId, {
        userId: authResult.session.user.id,
        statusCode: 403,
        error: 'Admin role required',
      });

      return createErrorResponse(
        ERROR_CODES.FORBIDDEN,
        'Administrator privileges required to modify settings',
        { requestId }
      );
    }

    // リクエストボディのバリデーション
    const validation = await validateRequest(request, {}, {
      body: SettingsSchemas.update,
    });

    if (!validation.success) {
      const error = validation.errors!.body!;
      return createValidationErrorResponse(error, requestId);
    }

    const updateData = validation.data!.body;

    // 設定データの更新
    const settingsRepository = new SettingsRepository();
    const currentSettings = await settingsRepository.getAll();

    // 機密データの暗号化処理
    const encryptedUpdateData = await encryptSensitiveSettings(updateData);

    // 設定の更新実行
    const updatedFields: string[] = [];
    const updatePromises: Promise<any>[] = [];

    for (const [category, categoryData] of Object.entries(encryptedUpdateData)) {
      if (categoryData && typeof categoryData === 'object') {
        updatePromises.push(
          settingsRepository.updateCategory(category, categoryData)
        );
        updatedFields.push(category);
      }
    }

    await Promise.all(updatePromises);

    // 更新後の設定データを取得
    const newSettings = await settingsRepository.getAll();

    // 設定変更の検証
    const validationResult = await validateSettingsIntegrity(newSettings);
    if (!validationResult.valid) {
      // 設定に問題がある場合はロールバック
      console.warn('[SETTINGS_VALIDATION_ERROR]', validationResult.errors);
      
      // 元の設定に戻す
      const rollbackPromises = Object.keys(encryptedUpdateData).map(category =>
        settingsRepository.updateCategory(category, currentSettings[category] || {})
      );
      await Promise.all(rollbackPromises);

      return createErrorResponse(
        ERROR_CODES.VALIDATION_ERROR,
        `Settings validation failed: ${validationResult.errors.join(', ')}`,
        { requestId }
      );
    }

    const duration = Date.now() - startTime;

    // 監査ログ
    logAPIRequest('PATCH', '/api/v1/settings', requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: 200,
      details: {
        updatedCategories: updatedFields,
        changeCount: Object.keys(updateData).length,
        validationPassed: validationResult.valid,
      },
    });

    return Response.json({
      success: true,
      data: await processSensitiveSettings(newSettings, false, true),
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
        duration,
        updatedCategories: updatedFields,
      },
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] PATCH /api/v1/settings:', error);
    
    logAPIRequest('PATCH', '/api/v1/settings', requestId, {
      duration,
      statusCode: 500,
      error: errorMessage,
    });

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to update settings',
      { requestId }
    );
  }
}

/**
 * POST /api/v1/settings/backup
 * 設定のバックアップ作成
 */
export async function POST(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const startTime = Date.now();

  try {
    // 認証・認可チェック（管理者のみ）
    const authResult = await requirePermissions([PERMISSIONS.SETTINGS_MANAGE], request);
    if (!authResult.valid || !authResult.session) {
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, authResult.error, { requestId });
    }

    if (authResult.session.user.role !== 'ADMIN') {
      return createErrorResponse(
        ERROR_CODES.FORBIDDEN,
        'Administrator privileges required',
        { requestId }
      );
    }

    // リクエストボディのバリデーション
    const validation = await validateRequest(request, {}, {
      body: SettingsSchemas.backup,
    });

    if (!validation.success) {
      const error = validation.errors!.body!;
      return createValidationErrorResponse(error, requestId);
    }

    const options = validation.data!.body;

    // 設定データの取得
    const settingsRepository = new SettingsRepository();
    const allSettings = await settingsRepository.getAll();

    // バックアップデータの準備
    const backupData = await prepareBackupData(allSettings, options.includePasswords);

    const backupInfo = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      createdBy: authResult.session.user.email,
      format: options.format,
      includePasswords: options.includePasswords,
      settings: backupData,
    };

    const duration = Date.now() - startTime;

    // 監査ログ
    logAPIRequest('POST', '/api/v1/settings/backup', requestId, {
      userId: authResult.session.user.id,
      userRole: authResult.session.user.role,
      duration,
      statusCode: 200,
      details: {
        format: options.format,
        includePasswords: options.includePasswords,
        dataSize: JSON.stringify(backupData).length,
      },
    });

    return Response.json({
      success: true,
      data: backupInfo,
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
        duration,
      },
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error('[API_ERROR] POST /api/v1/settings/backup:', error);

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      'Failed to create backup',
      { requestId }
    );
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * 機密設定データの処理
 */
async function processSensitiveSettings(
  settings: any,
  includeSensitive: boolean,
  isAdmin: boolean
): Promise<any> {
  if (!includeSensitive || !isAdmin) {
    return maskSensitiveData(settings);
  }

  // 機密データを復号化
  const processed = { ...settings };
  
  // Docker registry パスワードの復号化
  if (processed.docker?.registry?.password) {
    try {
      processed.docker.registry.password = await decryptSensitiveData(
        processed.docker.registry.password
      );
    } catch (error) {
      console.warn('Failed to decrypt docker registry password:', error);
      processed.docker.registry.password = '[DECRYPTION_FAILED]';
    }
  }

  // バックアップ認証情報の復号化
  if (processed.monitoring?.backup?.credentials) {
    try {
      for (const [key, value] of Object.entries(processed.monitoring.backup.credentials)) {
        if (typeof value === 'string' && value.startsWith('encrypted:')) {
          processed.monitoring.backup.credentials[key] = await decryptSensitiveData(value);
        }
      }
    } catch (error) {
      console.warn('Failed to decrypt backup credentials:', error);
    }
  }

  return processed;
}

/**
 * 機密データのマスキング
 */
function maskSensitiveData(settings: any): any {
  const masked = JSON.parse(JSON.stringify(settings));
  
  // パスワードのマスキング
  if (masked.docker?.registry?.password) {
    masked.docker.registry.password = '***';
  }

  // バックアップ認証情報のマスキング
  if (masked.monitoring?.backup?.credentials) {
    for (const key of Object.keys(masked.monitoring.backup.credentials)) {
      masked.monitoring.backup.credentials[key] = '***';
    }
  }

  return masked;
}

/**
 * 機密設定データの暗号化
 */
async function encryptSensitiveSettings(settings: any): Promise<any> {
  const encrypted = { ...settings };

  // Docker registry パスワードの暗号化
  if (encrypted.docker?.registry?.password) {
    encrypted.docker.registry.password = await encryptSensitiveData(
      encrypted.docker.registry.password
    );
  }

  // バックアップ認証情報の暗号化
  if (encrypted.monitoring?.backup?.credentials) {
    for (const [key, value] of Object.entries(encrypted.monitoring.backup.credentials)) {
      if (typeof value === 'string' && value.length > 0 && !value.startsWith('encrypted:')) {
        encrypted.monitoring.backup.credentials[key] = await encryptSensitiveData(value);
      }
    }
  }

  return encrypted;
}

/**
 * 設定の整合性検証
 */
async function validateSettingsIntegrity(settings: any): Promise<{
  valid: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  // Docker設定の検証
  if (settings.docker?.host && !isValidUrl(settings.docker.host)) {
    errors.push('Invalid Docker host URL');
  }

  if (settings.docker?.registry?.url && !isValidUrl(settings.docker.registry.url)) {
    errors.push('Invalid Docker registry URL');
  }

  // セキュリティ設定の検証
  if (settings.security?.sessionTimeout) {
    const timeout = settings.security.sessionTimeout;
    if (timeout < 300 || timeout > 86400) {
      errors.push('Session timeout must be between 5 minutes and 24 hours');
    }
  }

  // 監視設定の検証
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
 * バックアップデータの準備
 */
async function prepareBackupData(settings: any, includePasswords: boolean): Promise<any> {
  if (includePasswords) {
    return await processSensitiveSettings(settings, true, true);
  } else {
    return maskSensitiveData(settings);
  }
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
  // 簡易的なCron式検証（実際の実装では専用ライブラリを使用推奨）
  const parts = cron.trim().split(/\s+/);
  return parts.length >= 5 && parts.length <= 6;
}