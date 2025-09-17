/**
 * アプリケーション設定管理
 * 環境変数とランタイム設定の中央管理システム
 */

import { z } from 'zod';

/**
 * 環境変数スキーマ定義
 */
const EnvSchema = z.object({
  // 基本設定
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default(3000),

  // データベース設定
  DATABASE_URL: z.string().min(1),

  // 認証設定
  NEXTAUTH_SECRET: z.string().min(1),
  NEXTAUTH_URL: z.string().url().optional(),

  // 暗号化設定
  ENCRYPTION_MASTER_KEY: z.string().min(1),

  // Docker設定
  DOCKER_HOST: z.string().optional(),

  // Bitwarden設定
  BITWARDEN_SERVER_URL: z.string().url().optional(),

  // ログ設定
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // セキュリティ設定
  RATE_LIMIT_MAX: z.string().transform(Number).default(100),
  RATE_LIMIT_WINDOW: z.string().transform(Number).default(60),

  // 監視設定
  ENABLE_METRICS: z.string().transform(val => val === 'true').default(false),
  METRICS_PORT: z.string().transform(Number).default(9090),
});

/**
 * 設定型定義
 */
export type AppConfig = z.infer<typeof EnvSchema>;

/**
 * 設定値の検証と取得
 */
function validateAndGetConfig(): AppConfig {
  try {
    return EnvSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(err =>
        `${err.path.join('.')}: ${err.message}`
      ).join('\n');

      throw new Error(`環境変数の設定に問題があります:\n${errorMessages}`);
    }
    throw error;
  }
}

/**
 * アプリケーション設定のシングルトンインスタンス
 */
export const appConfig = validateAndGetConfig();

/**
 * 設定値取得のヘルパー関数
 */
export const config = {
  /**
   * 開発環境かどうか
   */
  isDevelopment: appConfig.NODE_ENV === 'development',

  /**
   * 本番環境かどうか
   */
  isProduction: appConfig.NODE_ENV === 'production',

  /**
   * テスト環境かどうか
   */
  isTest: appConfig.NODE_ENV === 'test',

  /**
   * データベース設定
   */
  database: {
    url: appConfig.DATABASE_URL,
  },

  /**
   * 認証設定
   */
  auth: {
    secret: appConfig.NEXTAUTH_SECRET,
    url: appConfig.NEXTAUTH_URL,
  },

  /**
   * 暗号化設定
   */
  encryption: {
    masterKey: appConfig.ENCRYPTION_MASTER_KEY,
  },

  /**
   * Docker設定
   */
  docker: {
    host: appConfig.DOCKER_HOST || 'unix:///var/run/docker.sock',
  },

  /**
   * Bitwarden設定
   */
  bitwarden: {
    serverUrl: appConfig.BITWARDEN_SERVER_URL,
    enabled: !!appConfig.BITWARDEN_SERVER_URL,
  },

  /**
   * ログ設定
   */
  logging: {
    level: appConfig.LOG_LEVEL,
    enableConsole: appConfig.NODE_ENV === 'development',
    enableFile: appConfig.NODE_ENV === 'production',
  },

  /**
   * セキュリティ設定
   */
  security: {
    rateLimit: {
      max: appConfig.RATE_LIMIT_MAX,
      windowMs: appConfig.RATE_LIMIT_WINDOW * 1000,
    },
  },

  /**
   * 監視設定
   */
  monitoring: {
    enabled: appConfig.ENABLE_METRICS,
    port: appConfig.METRICS_PORT,
  },

  /**
   * サーバー設定
   */
  server: {
    port: appConfig.PORT,
  },
};

/**
 * 設定値の妥当性チェック
 */
export function validateConfig(): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 必須設定の存在チェック
  if (!config.database.url) {
    errors.push('DATABASE_URL is required');
  }

  if (!config.auth.secret) {
    errors.push('NEXTAUTH_SECRET is required');
  }

  if (!config.encryption.masterKey) {
    errors.push('ENCRYPTION_MASTER_KEY is required');
  }

  // 暗号化キーの長さチェック
  try {
    const keyBuffer = Buffer.from(config.encryption.masterKey, 'base64');
    if (keyBuffer.length !== 32) {
      errors.push('ENCRYPTION_MASTER_KEY must be a 32-byte base64 encoded string');
    }
  } catch {
    errors.push('ENCRYPTION_MASTER_KEY must be valid base64 encoded');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * 設定値のマスキング（ログ出力時の機密情報保護）
 */
export function getMaskedConfig(): Record<string, any> {
  return {
    NODE_ENV: appConfig.NODE_ENV,
    PORT: appConfig.PORT,
    DATABASE_URL: appConfig.DATABASE_URL.replace(/\/\/.*@/, '//***:***@'),
    NEXTAUTH_SECRET: '***',
    NEXTAUTH_URL: appConfig.NEXTAUTH_URL,
    ENCRYPTION_MASTER_KEY: '***',
    DOCKER_HOST: appConfig.DOCKER_HOST,
    BITWARDEN_SERVER_URL: appConfig.BITWARDEN_SERVER_URL,
    LOG_LEVEL: appConfig.LOG_LEVEL,
    RATE_LIMIT_MAX: appConfig.RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW: appConfig.RATE_LIMIT_WINDOW,
    ENABLE_METRICS: appConfig.ENABLE_METRICS,
    METRICS_PORT: appConfig.METRICS_PORT,
  };
}

export default config;