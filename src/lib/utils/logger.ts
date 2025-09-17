/**
 * 中央化ログユーティリティ
 * 構造化ログシステムのシンプルなインターフェースを提供
 */

import { StructuredLogger, LogLevel } from '@/lib/logging/structured-logger';

/**
 * アプリケーション全体で使用するグローバルロガーインスタンス
 */
const logger = new StructuredLogger({
  level: process.env.LOG_LEVEL === 'debug' ? LogLevel.DEBUG : LogLevel.INFO,
  filePath: 'logs/app.log',
});

/**
 * アプリケーション共通ロガー
 * console.log の代替として使用
 */
export const appLogger = {
  /**
   * 一般的な情報ログ
   */
  info: (message: string, metadata?: Record<string, any>) => {
    logger.info(message, metadata);
  },

  /**
   * 警告ログ
   */
  warn: (message: string, metadata?: Record<string, any>) => {
    logger.warn(message, metadata);
  },

  /**
   * エラーログ
   */
  error: (message: string, error?: Error | unknown, metadata?: Record<string, any>) => {
    if (error instanceof Error) {
      logger.error(message, error, metadata);
    } else {
      logger.error(message, undefined, { error, ...metadata });
    }
  },

  /**
   * デバッグログ（開発環境のみ）
   */
  debug: (message: string, metadata?: Record<string, any>) => {
    logger.debug(message, metadata);
  },

  /**
   * コンポーネント固有のロガーを作成
   */
  forComponent: (componentName: string) => ({
    info: (message: string, metadata?: Record<string, any>) =>
      logger.info(`[${componentName}] ${message}`, metadata),

    warn: (message: string, metadata?: Record<string, any>) =>
      logger.warn(`[${componentName}] ${message}`, metadata),

    error: (message: string, error?: Error | unknown, metadata?: Record<string, any>) => {
      if (error instanceof Error) {
        logger.error(`[${componentName}] ${message}`, error, metadata);
      } else {
        logger.error(`[${componentName}] ${message}`, undefined, { error, ...metadata });
      }
    },

    debug: (message: string, metadata?: Record<string, any>) =>
      logger.debug(`[${componentName}] ${message}`, metadata),
  }),
};

/**
 * 旧式のconsole.logからの移行支援
 * 開発中は警告を表示
 */
if (process.env.NODE_ENV === 'development') {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = (...args: any[]) => {
    appLogger.warn('console.log detected - consider using appLogger.info instead', { args });
    originalLog.apply(console, args);
  };

  console.error = (...args: any[]) => {
    appLogger.warn('console.error detected - consider using appLogger.error instead', { args });
    originalError.apply(console, args);
  };

  console.warn = (...args: any[]) => {
    appLogger.warn('console.warn detected - consider using appLogger.warn instead', { args });
    originalWarn.apply(console, args);
  };
}

export default appLogger;