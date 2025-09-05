/**
 * エラーハンドラー
 * 
 * 機能要件：
 * - エラーのログ記録
 * - 通知システムとの連携
 * - エラー統計の収集
 * - 復旧処理の実行
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  ErrorCode,
  ErrorLevel,
  ErrorCategory,
  HttpStatus,
  ErrorContext,
  StructuredError,
  ErrorStatistics,
  ErrorNotificationConfig,
  ErrorResponse,
} from './types';
import { CustomError } from './CustomError';

/**
 * エラーハンドラー設定
 */
export interface ErrorHandlerConfig {
  /** 開発モードかどうか */
  isDevelopment: boolean;
  /** ログレベル */
  logLevel: ErrorLevel;
  /** 通知設定 */
  notification?: ErrorNotificationConfig;
  /** エラー統計を有効にするか */
  enableStatistics: boolean;
  /** デバッグ情報をレスポンスに含めるか */
  includeDebugInfo: boolean;
  /** ユーザーにスタックトレースを表示するか */
  exposeStackTrace: boolean;
}

/**
 * エラーログエントリ
 */
interface ErrorLogEntry {
  id: string;
  timestamp: string;
  error: StructuredError;
  handled: boolean;
  recovered: boolean;
}

/**
 * エラーハンドラークラス
 */
export class ErrorHandler {
  private config: ErrorHandlerConfig;
  private errorLog: ErrorLogEntry[] = [];
  private statistics: Partial<ErrorStatistics> = {};

  constructor(config: ErrorHandlerConfig) {
    this.config = config;
    this.initializeStatistics();
  }

  /**
   * 統計情報を初期化
   */
  private initializeStatistics(): void {
    this.statistics = {
      total: 0,
      byCategory: {} as Record<ErrorCategory, number>,
      byLevel: {} as Record<ErrorLevel, number>,
      byTimeRange: {
        lastHour: 0,
        lastDay: 0,
        lastWeek: 0,
      },
      topErrors: [],
    };

    // カテゴリ別カウンターを初期化
    Object.values(ErrorCategory).forEach(category => {
      this.statistics.byCategory![category] = 0;
    });

    // レベル別カウンターを初期化
    Object.values(ErrorLevel).forEach(level => {
      this.statistics.byLevel![level] = 0;
    });
  }

  /**
   * エラーを処理する（汎用）
   */
  public async handleError(
    error: Error | CustomError | unknown,
    context?: ErrorContext
  ): Promise<void> {
    try {
      const structuredError = this.normalizeError(error, context);
      await this.logError(structuredError);
      this.updateStatistics(structuredError);
      await this.sendNotification(structuredError);
      await this.attemptRecovery(structuredError);
    } catch (handlingError) {
      // エラーハンドリング中にエラーが発生した場合
      console.error('Error handling failed:', handlingError);
      console.error('Original error:', error);
    }
  }

  /**
   * API エラーレスポンスを生成
   */
  public createApiErrorResponse(
    error: Error | CustomError | unknown,
    context?: ErrorContext
  ): NextResponse<ErrorResponse> {
    const structuredError = this.normalizeError(error, context);
    
    // エラーを記録
    this.handleError(structuredError, context).catch(console.error);

    const responseData: ErrorResponse = {
      error: true,
      data: {
        code: structuredError.code,
        message: structuredError.message,
        timestamp: structuredError.timestamp,
        requestId: context?.requestId,
      },
      meta: {
        traceId: context?.requestId,
        apiVersion: 'v1',
      },
    };

    // 開発環境でのデバッグ情報
    if (this.config.isDevelopment && this.config.includeDebugInfo) {
      responseData.data.details = {
        category: structuredError.category,
        level: structuredError.level,
        recoverable: structuredError.recoverable,
        retryable: structuredError.retryable,
        ...(this.config.exposeStackTrace && { 
          stack: structuredError.context?.stackTrace,
          cause: structuredError.cause 
        }),
      };
    }

    return NextResponse.json(responseData, {
      status: structuredError.httpStatus,
      headers: {
        'Content-Type': 'application/json',
        'X-Error-Code': structuredError.code,
        'X-Request-ID': context?.requestId || '',
      },
    });
  }

  /**
   * Next.js API エラーハンドリングミドルウェア
   */
  public apiMiddleware(
    handler: (req: NextRequest) => Promise<NextResponse>
  ) {
    return async (req: NextRequest): Promise<NextResponse> => {
      try {
        return await handler(req);
      } catch (error) {
        const context: ErrorContext = {
          requestId: req.headers.get('x-request-id') || this.generateRequestId(),
          method: req.method,
          path: req.nextUrl.pathname,
          ipAddress: this.getClientIP(req),
          userAgent: req.headers.get('user-agent') || undefined,
        };

        return this.createApiErrorResponse(error, context);
      }
    };
  }

  /**
   * エラーを正規化
   */
  private normalizeError(
    error: Error | CustomError | unknown,
    context?: ErrorContext
  ): StructuredError {
    // 既にStructuredErrorの場合
    if (error instanceof CustomError) {
      return {
        ...error.toJSON(),
        context: { ...error.context, ...context },
      };
    }

    // 標準Errorの場合
    if (error instanceof Error) {
      return {
        code: 'UNKNOWN_001' as ErrorCode,
        message: error.message,
        messageJa: '予期しないエラーが発生しました',
        level: ErrorLevel.ERROR,
        category: ErrorCategory.UNKNOWN,
        httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
        timestamp: new Date().toISOString(),
        context: {
          ...context,
          stackTrace: error.stack,
        },
        cause: error,
        recoverable: false,
        retryable: false,
      };
    }

    // その他の場合
    return {
      code: 'UNKNOWN_001' as ErrorCode,
      message: String(error) || 'Unknown error occurred',
      messageJa: '予期しないエラーが発生しました',
      level: ErrorLevel.ERROR,
      category: ErrorCategory.UNKNOWN,
      httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
      timestamp: new Date().toISOString(),
      context,
      recoverable: false,
      retryable: false,
    };
  }

  /**
   * エラーをログに記録
   */
  private async logError(error: StructuredError): Promise<void> {
    const logEntry: ErrorLogEntry = {
      id: this.generateErrorId(),
      timestamp: error.timestamp,
      error,
      handled: true,
      recovered: false,
    };

    // ログレベルをチェック
    if (!this.shouldLog(error.level)) {
      return;
    }

    // メモリ内ログに追加
    this.errorLog.push(logEntry);

    // ログサイズ制限
    if (this.errorLog.length > 1000) {
      this.errorLog = this.errorLog.slice(-500);
    }

    // コンソールログ出力
    this.logToConsole(error);

    // 外部ログシステムに送信（実装は環境依存）
    await this.logToExternal(logEntry).catch(err => 
      console.error('Failed to log to external system:', err)
    );
  }

  /**
   * ログレベルをチェック
   */
  private shouldLog(level: ErrorLevel): boolean {
    const levels = [
      ErrorLevel.DEBUG,
      ErrorLevel.INFO, 
      ErrorLevel.WARNING,
      ErrorLevel.ERROR,
      ErrorLevel.CRITICAL
    ];
    
    const currentIndex = levels.indexOf(this.config.logLevel);
    const errorIndex = levels.indexOf(level);
    
    return errorIndex >= currentIndex;
  }

  /**
   * コンソールログ出力
   */
  private logToConsole(error: StructuredError): void {
    const logData = {
      code: error.code,
      message: error.message,
      category: error.category,
      level: error.level,
      timestamp: error.timestamp,
      context: error.context,
      ...(this.config.isDevelopment && { stack: error.context?.stackTrace }),
    };

    switch (error.level) {
      case ErrorLevel.DEBUG:
        console.debug('[DEBUG]', logData);
        break;
      case ErrorLevel.INFO:
        console.info('[INFO]', logData);
        break;
      case ErrorLevel.WARNING:
        console.warn('[WARNING]', logData);
        break;
      case ErrorLevel.ERROR:
        console.error('[ERROR]', logData);
        break;
      case ErrorLevel.CRITICAL:
        console.error('[CRITICAL]', logData);
        break;
    }
  }

  /**
   * 外部ログシステムに送信
   */
  private async logToExternal(logEntry: ErrorLogEntry): Promise<void> {
    // 実装は環境に依存（例：Elasticsearch, CloudWatch, Sentry等）
    // ここではスタブ実装
    if (process.env.EXTERNAL_LOG_ENDPOINT) {
      try {
        await fetch(process.env.EXTERNAL_LOG_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(logEntry),
        });
      } catch (error) {
        console.error('Failed to send log to external endpoint:', error);
      }
    }
  }

  /**
   * 統計情報を更新
   */
  private updateStatistics(error: StructuredError): void {
    if (!this.config.enableStatistics) return;

    this.statistics.total = (this.statistics.total || 0) + 1;
    this.statistics.byCategory![error.category] = (this.statistics.byCategory![error.category] || 0) + 1;
    this.statistics.byLevel![error.level] = (this.statistics.byLevel![error.level] || 0) + 1;

    // 時間範囲別統計の更新（簡略化）
    const now = new Date();
    const errorTime = new Date(error.timestamp);
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    if (errorTime > hourAgo) {
      this.statistics.byTimeRange!.lastHour++;
    }
    if (errorTime > dayAgo) {
      this.statistics.byTimeRange!.lastDay++;
    }
    if (errorTime > weekAgo) {
      this.statistics.byTimeRange!.lastWeek++;
    }
  }

  /**
   * 通知を送信
   */
  private async sendNotification(error: StructuredError): Promise<void> {
    if (!this.config.notification) return;

    const levels = [ErrorLevel.DEBUG, ErrorLevel.INFO, ErrorLevel.WARNING, ErrorLevel.ERROR, ErrorLevel.CRITICAL];
    const errorLevelIndex = levels.indexOf(error.level);
    const minLevelIndex = levels.indexOf(this.config.notification.minLevel);

    if (errorLevelIndex < minLevelIndex) return;

    // レート制限チェック（簡略実装）
    // 実際の実装では、より洗練されたレート制限機能が必要

    // 通知送信（実装は環境依存）
    await this.sendNotificationToChannels(error, this.config.notification.channels).catch(err =>
      console.error('Failed to send notification:', err)
    );
  }

  /**
   * 通知チャンネルに送信
   */
  private async sendNotificationToChannels(
    error: StructuredError, 
    channels: Array<'email' | 'slack' | 'webhook' | 'database'>
  ): Promise<void> {
    for (const channel of channels) {
      try {
        switch (channel) {
          case 'email':
            await this.sendEmailNotification(error);
            break;
          case 'slack':
            await this.sendSlackNotification(error);
            break;
          case 'webhook':
            await this.sendWebhookNotification(error);
            break;
          case 'database':
            await this.saveNotificationToDatabase(error);
            break;
        }
      } catch (channelError) {
        console.error(`Failed to send notification via ${channel}:`, channelError);
      }
    }
  }

  /**
   * メール通知送信（スタブ）
   */
  private async sendEmailNotification(error: StructuredError): Promise<void> {
    // 実装は環境依存（例：SendGrid, AWS SES等）
    console.log('Email notification would be sent:', error.code);
  }

  /**
   * Slack通知送信（スタブ）
   */
  private async sendSlackNotification(error: StructuredError): Promise<void> {
    // 実装は環境依存
    console.log('Slack notification would be sent:', error.code);
  }

  /**
   * Webhook通知送信（スタブ）
   */
  private async sendWebhookNotification(error: StructuredError): Promise<void> {
    if (process.env.ERROR_WEBHOOK_URL) {
      await fetch(process.env.ERROR_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(error),
      });
    }
  }

  /**
   * データベース通知保存（スタブ）
   */
  private async saveNotificationToDatabase(error: StructuredError): Promise<void> {
    // データベースへの保存実装
    console.log('Notification would be saved to database:', error.code);
  }

  /**
   * 復旧処理を試行
   */
  private async attemptRecovery(error: StructuredError): Promise<void> {
    if (!error.recoverable) return;

    try {
      // 復旧ロジック（エラータイプに応じて実装）
      switch (error.category) {
        case ErrorCategory.NETWORK:
          await this.recoverFromNetworkError(error);
          break;
        case ErrorCategory.DATABASE:
          await this.recoverFromDatabaseError(error);
          break;
        case ErrorCategory.DOCKER:
          await this.recoverFromDockerError(error);
          break;
        default:
          // デフォルトの復旧処理
          break;
      }
    } catch (recoveryError) {
      console.error('Recovery failed:', recoveryError);
    }
  }

  /**
   * ネットワークエラーからの復旧
   */
  private async recoverFromNetworkError(error: StructuredError): Promise<void> {
    console.log('Attempting network error recovery:', error.code);
    // 接続再試行ロジック等
  }

  /**
   * データベースエラーからの復旧
   */
  private async recoverFromDatabaseError(error: StructuredError): Promise<void> {
    console.log('Attempting database error recovery:', error.code);
    // 接続プール再初期化等
  }

  /**
   * Dockerエラーからの復旧
   */
  private async recoverFromDockerError(error: StructuredError): Promise<void> {
    console.log('Attempting Docker error recovery:', error.code);
    // Docker接続再確立等
  }

  /**
   * 統計情報を取得
   */
  public getStatistics(): ErrorStatistics {
    return this.statistics as ErrorStatistics;
  }

  /**
   * エラーログを取得
   */
  public getErrorLog(limit: number = 100): ErrorLogEntry[] {
    return this.errorLog.slice(-limit);
  }

  /**
   * リクエストIDを生成
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * エラーIDを生成
   */
  private generateErrorId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * クライアントIPを取得
   */
  private getClientIP(req: NextRequest): string | undefined {
    const xForwardedFor = req.headers.get('x-forwarded-for');
    const xRealIp = req.headers.get('x-real-ip');
    const cfConnectingIp = req.headers.get('cf-connecting-ip');

    if (cfConnectingIp) return cfConnectingIp;
    if (xRealIp) return xRealIp;
    if (xForwardedFor) {
      return xForwardedFor.split(',')[0].trim();
    }
    return req.ip;
  }
}

/**
 * グローバルエラーハンドラーインスタンス
 */
export const globalErrorHandler = new ErrorHandler({
  isDevelopment: process.env.NODE_ENV === 'development',
  logLevel: (process.env.LOG_LEVEL as ErrorLevel) || ErrorLevel.ERROR,
  enableStatistics: true,
  includeDebugInfo: process.env.NODE_ENV === 'development',
  exposeStackTrace: process.env.NODE_ENV === 'development',
  notification: process.env.ERROR_NOTIFICATIONS_ENABLED === 'true' ? {
    minLevel: ErrorLevel.ERROR,
    channels: ['database'],
    rateLimit: 10,
    deduplicationWindow: 300,
  } : undefined,
});