import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';

// =============================================================================
// 構造化ログシステム
// JSON形式ログ、レベル管理、ローテーション、フィルタリングの包括的実装
// =============================================================================

/**
 * ログレベル定義
 */
export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  FATAL = 5,
}

/**
 * ログレベル文字列マッピング
 */
const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.TRACE]: 'TRACE',
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.FATAL]: 'FATAL',
};

/**
 * ログエントリスキーマ
 */
const LogEntrySchema = z.object({
  timestamp: z.string(),
  level: z.nativeEnum(LogLevel),
  message: z.string(),
  component: z.string(),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  requestId: z.string().optional(),
  traceId: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  error: z.object({
    name: z.string(),
    message: z.string(),
    stack: z.string().optional(),
    code: z.string().optional(),
  }).optional(),
  performance: z.object({
    duration: z.number(),
    memoryUsage: z.number().optional(),
    cpuUsage: z.number().optional(),
  }).optional(),
  httpContext: z.object({
    method: z.string(),
    url: z.string(),
    statusCode: z.number(),
    userAgent: z.string().optional(),
    ip: z.string().optional(),
    headers: z.record(z.string()).optional(),
  }).optional(),
});

export type LogEntry = z.infer<typeof LogEntrySchema>;

/**
 * ログ設定
 */
interface LoggerConfig {
  level: LogLevel;
  outputConsole: boolean;
  outputFile: boolean;
  filePath: string;
  maxFileSize: number;
  maxFiles: number;
  enableRotation: boolean;
  enableRemoteLogging: boolean;
  remoteEndpoint?: string;
  enableMetrics: boolean;
  enableSanitization: boolean;
  sensitiveFields: string[];
}

/**
 * ログコンテキスト
 */
interface LogContext {
  userId?: string;
  sessionId?: string;
  requestId?: string;
  traceId?: string;
  component?: string;
}

/**
 * 構造化ロガー
 */
export class StructuredLogger {
  private config: LoggerConfig;
  private context: LogContext = {};
  private metrics = {
    totalLogs: 0,
    logsByLevel: {} as Record<LogLevel, number>,
    errors: 0,
    averageLogSize: 0,
  };

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: this.parseLogLevel(process.env.LOG_LEVEL) || LogLevel.INFO,
      outputConsole: process.env.NODE_ENV !== 'test',
      outputFile: true,
      filePath: './logs/app.log',
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
      enableRotation: true,
      enableRemoteLogging: false,
      enableMetrics: true,
      enableSanitization: true,
      sensitiveFields: ['password', 'token', 'secret', 'key', 'authorization'],
      ...config,
    };

    this.initializeMetrics();
  }

  /**
   * ログレベル解析
   */
  private parseLogLevel(level?: string): LogLevel | undefined {
    if (!level) return undefined;
    const upperLevel = level.toUpperCase();
    for (const [enumValue, name] of Object.entries(LOG_LEVEL_NAMES)) {
      if (name === upperLevel) {
        return parseInt(enumValue) as LogLevel;
      }
    }
    return undefined;
  }

  /**
   * メトリクス初期化
   */
  private initializeMetrics(): void {
    for (const level of Object.values(LogLevel)) {
      if (typeof level === 'number') {
        this.metrics.logsByLevel[level] = 0;
      }
    }
  }

  /**
   * ログコンテキスト設定
   */
  setContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * ログコンテキストクリア
   */
  clearContext(): void {
    this.context = {};
  }

  /**
   * 一時的なコンテキストでログ実行
   */
  withContext<T>(context: LogContext, fn: () => T): T {
    const originalContext = { ...this.context };
    this.setContext(context);
    
    try {
      return fn();
    } finally {
      this.context = originalContext;
    }
  }

  /**
   * TRACEレベルログ
   */
  trace(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.TRACE, message, metadata);
  }

  /**
   * DEBUGレベルログ
   */
  debug(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }

  /**
   * INFOレベルログ
   */
  info(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  /**
   * WARNレベルログ
   */
  warn(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, metadata);
  }

  /**
   * ERRORレベルログ
   */
  error(message: string, error?: Error, metadata?: Record<string, any>): void {
    const logEntry: Partial<LogEntry> = { metadata };
    
    if (error) {
      logEntry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
      };
    }

    this.log(LogLevel.ERROR, message, logEntry);
  }

  /**
   * FATALレベルログ
   */
  fatal(message: string, error?: Error, metadata?: Record<string, any>): void {
    const logEntry: Partial<LogEntry> = { metadata };
    
    if (error) {
      logEntry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
      };
    }

    this.log(LogLevel.FATAL, message, logEntry);
  }

  /**
   * パフォーマンスログ
   */
  performance(
    message: string,
    duration: number,
    metadata?: Record<string, any>
  ): void {
    this.log(LogLevel.INFO, message, {
      ...metadata,
      performance: {
        duration,
        memoryUsage: process.memoryUsage().heapUsed,
        cpuUsage: process.cpuUsage().user + process.cpuUsage().system,
      },
    });
  }

  /**
   * HTTPコンテキストログ
   */
  http(
    message: string,
    httpContext: LogEntry['httpContext'],
    metadata?: Record<string, any>
  ): void {
    this.log(LogLevel.INFO, message, {
      ...metadata,
      httpContext: this.sanitizeHttpContext(httpContext),
    });
  }

  /**
   * メインログメソッド
   */
  private log(level: LogLevel, message: string, additionalData?: Partial<LogEntry>): void {
    if (level < this.config.level) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      component: this.context.component || 'unknown',
      userId: this.context.userId,
      sessionId: this.context.sessionId,
      requestId: this.context.requestId,
      traceId: this.context.traceId,
      ...additionalData,
    };

    // データサニタイゼーション
    if (this.config.enableSanitization) {
      this.sanitizeLogEntry(entry);
    }

    // ログエントリ検証
    try {
      LogEntrySchema.parse(entry);
    } catch (error) {
      console.error('[Logger] Invalid log entry:', error);
      return;
    }

    // メトリクス更新
    this.updateMetrics(entry);

    // 出力処理
    this.outputLog(entry);
  }

  /**
   * ログエントリサニタイゼーション
   */
  private sanitizeLogEntry(entry: LogEntry): void {
    if (entry.metadata) {
      entry.metadata = this.sanitizeObject(entry.metadata);
    }

    if (entry.httpContext?.headers) {
      entry.httpContext.headers = this.sanitizeObject(entry.httpContext.headers);
    }
  }

  /**
   * オブジェクトサニタイゼーション
   */
  private sanitizeObject(obj: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = this.config.sensitiveFields.some(field => 
        lowerKey.includes(field.toLowerCase())
      );

      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * HTTPコンテキストサニタイゼーション
   */
  private sanitizeHttpContext(context?: LogEntry['httpContext']): LogEntry['httpContext'] {
    if (!context) return undefined;

    return {
      ...context,
      headers: context.headers ? this.sanitizeObject(context.headers) : undefined,
    };
  }

  /**
   * メトリクス更新
   */
  private updateMetrics(entry: LogEntry): void {
    if (!this.config.enableMetrics) return;

    this.metrics.totalLogs++;
    this.metrics.logsByLevel[entry.level]++;

    if (entry.level >= LogLevel.ERROR) {
      this.metrics.errors++;
    }

    // 平均ログサイズ更新
    const logSize = JSON.stringify(entry).length;
    this.metrics.averageLogSize = 
      ((this.metrics.averageLogSize * (this.metrics.totalLogs - 1)) + logSize) / 
      this.metrics.totalLogs;
  }

  /**
   * ログ出力処理
   */
  private async outputLog(entry: LogEntry): Promise<void> {
    const formattedLog = this.formatLog(entry);

    // コンソール出力
    if (this.config.outputConsole) {
      this.outputToConsole(entry, formattedLog);
    }

    // ファイル出力
    if (this.config.outputFile) {
      await this.outputToFile(formattedLog);
    }

    // リモートログ送信
    if (this.config.enableRemoteLogging && this.config.remoteEndpoint) {
      await this.sendToRemote(entry);
    }
  }

  /**
   * ログフォーマット
   */
  private formatLog(entry: LogEntry): string {
    if (this.config.outputConsole && process.env.NODE_ENV === 'development') {
      // 開発環境では読みやすい形式
      return `[${entry.timestamp}] ${LOG_LEVEL_NAMES[entry.level]} (${entry.component}): ${entry.message}${
        entry.metadata ? '\n  ' + JSON.stringify(entry.metadata, null, 2) : ''
      }${
        entry.error ? '\n  Error: ' + JSON.stringify(entry.error, null, 2) : ''
      }`;
    } else {
      // 本番環境ではJSON形式
      return JSON.stringify(entry);
    }
  }

  /**
   * コンソール出力
   */
  private outputToConsole(entry: LogEntry, formattedLog: string): void {
    switch (entry.level) {
      case LogLevel.TRACE:
      case LogLevel.DEBUG:
        console.debug(formattedLog);
        break;
      case LogLevel.INFO:
        console.info(formattedLog);
        break;
      case LogLevel.WARN:
        console.warn(formattedLog);
        break;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        console.error(formattedLog);
        break;
    }
  }

  /**
   * ファイル出力
   */
  private async outputToFile(formattedLog: string): Promise<void> {
    try {
      // ディレクトリ作成
      const logDir = path.dirname(this.config.filePath);
      await fs.mkdir(logDir, { recursive: true });

      // ファイルサイズチェック
      if (this.config.enableRotation) {
        await this.rotateLogFile();
      }

      // ログ書き込み
      await fs.appendFile(this.config.filePath, formattedLog + '\n');
    } catch (error) {
      console.error('[Logger] Failed to write to file:', error);
    }
  }

  /**
   * ログファイルローテーション
   */
  private async rotateLogFile(): Promise<void> {
    try {
      const stats = await fs.stat(this.config.filePath).catch(() => null);
      
      if (!stats || stats.size < this.config.maxFileSize) {
        return;
      }

      // 既存ファイルをリネーム
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const rotatedPath = `${this.config.filePath}.${timestamp}`;
      
      await fs.rename(this.config.filePath, rotatedPath);

      // 古いファイルを削除
      await this.cleanupOldLogFiles();
    } catch (error) {
      console.error('[Logger] Failed to rotate log file:', error);
    }
  }

  /**
   * 古いログファイルクリーンアップ
   */
  private async cleanupOldLogFiles(): Promise<void> {
    try {
      const logDir = path.dirname(this.config.filePath);
      const baseName = path.basename(this.config.filePath);
      const files = await fs.readdir(logDir);

      const logFiles = files
        .filter(file => file.startsWith(baseName + '.'))
        .map(file => ({
          name: file,
          path: path.join(logDir, file),
          stats: fs.stat(path.join(logDir, file)),
        }));

      const fileStats = await Promise.all(
        logFiles.map(async file => ({
          ...file,
          stats: await file.stats,
        }))
      );

      // 作成日時でソート
      fileStats.sort((a, b) => b.stats.birthtime.getTime() - a.stats.birthtime.getTime());

      // 古いファイルを削除
      const filesToDelete = fileStats.slice(this.config.maxFiles);
      for (const file of filesToDelete) {
        await fs.unlink(file.path);
      }
    } catch (error) {
      console.error('[Logger] Failed to cleanup old log files:', error);
    }
  }

  /**
   * リモートログ送信
   */
  private async sendToRemote(entry: LogEntry): Promise<void> {
    try {
      if (!this.config.remoteEndpoint) return;

      await fetch(this.config.remoteEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(entry),
      });
    } catch (error) {
      console.error('[Logger] Failed to send remote log:', error);
    }
  }

  /**
   * ログメトリクス取得
   */
  getMetrics(): typeof this.metrics {
    return { ...this.metrics };
  }

  /**
   * ログレベル変更
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * ログ検索
   */
  async searchLogs(filters: {
    level?: LogLevel;
    component?: string;
    userId?: string;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
  }): Promise<LogEntry[]> {
    try {
      const logContent = await fs.readFile(this.config.filePath, 'utf-8');
      const lines = logContent.split('\n').filter(line => line.trim());
      
      let results: LogEntry[] = [];

      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as LogEntry;
          
          // フィルター適用
          if (filters.level !== undefined && entry.level !== filters.level) continue;
          if (filters.component && entry.component !== filters.component) continue;
          if (filters.userId && entry.userId !== filters.userId) continue;
          if (filters.startTime && new Date(entry.timestamp) < filters.startTime) continue;
          if (filters.endTime && new Date(entry.timestamp) > filters.endTime) continue;

          results.push(entry);

          if (filters.limit && results.length >= filters.limit) break;
        } catch (error) {
          // 無効なJSON行はスキップ
          continue;
        }
      }

      return results;
    } catch (error) {
      console.error('[Logger] Failed to search logs:', error);
      return [];
    }
  }
}

/**
 * グローバルロガーインスタンス
 */
export const logger = new StructuredLogger();

/**
 * コンポーネント別ロガー作成
 */
export function createLogger(component: string): StructuredLogger {
  const componentLogger = new StructuredLogger();
  componentLogger.setContext({ component });
  return componentLogger;
}

/**
 * ログデコレーター（関数用）
 */
export function LogExecution(level: LogLevel = LogLevel.INFO) {
  return function (
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: any[]) {
      const startTime = Date.now();
      const component = target.constructor.name;
      
      logger.withContext({ component }, () => {
        logger.log(level, `Executing ${propertyName}`, {
          metadata: { method: propertyName, args: args.length },
        });
      });

      try {
        const result = originalMethod.apply(this, args);

        // Promise の場合
        if (result && typeof result.then === 'function') {
          return result
            .then((res: any) => {
              const duration = Date.now() - startTime;
              logger.withContext({ component }, () => {
                logger.performance(`Completed ${propertyName}`, duration);
              });
              return res;
            })
            .catch((error: Error) => {
              logger.withContext({ component }, () => {
                logger.error(`Failed ${propertyName}`, error);
              });
              throw error;
            });
        }

        // 同期関数の場合
        const duration = Date.now() - startTime;
        logger.withContext({ component }, () => {
          logger.performance(`Completed ${propertyName}`, duration);
        });

        return result;
      } catch (error) {
        logger.withContext({ component }, () => {
          logger.error(`Failed ${propertyName}`, error as Error);
        });
        throw error;
      }
    };

    return descriptor;
  };
}