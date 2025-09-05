/**
 * カスタムエラークラス
 * 
 * 機能要件：
 * - 構造化エラー情報を持つErrorクラス
 * - エラーチェーン機能
 * - コンテキスト情報の保持
 * - 国際化対応
 */

import {
  ErrorCode,
  ErrorLevel,
  ErrorCategory,
  HttpStatus,
  ErrorContext,
  StructuredError,
} from './types';

/**
 * カスタムエラークラス
 */
export class CustomError extends Error implements StructuredError {
  readonly code: ErrorCode;
  readonly level: ErrorLevel;
  readonly category: ErrorCategory;
  readonly httpStatus: HttpStatus;
  readonly timestamp: string;
  readonly context?: ErrorContext;
  readonly cause?: Error | StructuredError;
  readonly messageJa?: string;
  readonly suggestedAction?: string;
  readonly details?: Record<string, unknown>;
  readonly recoverable: boolean;
  readonly retryable: boolean;

  constructor(options: {
    code: ErrorCode;
    message: string;
    messageJa?: string;
    level: ErrorLevel;
    category: ErrorCategory;
    httpStatus: HttpStatus;
    context?: ErrorContext;
    cause?: Error | StructuredError;
    suggestedAction?: string;
    details?: Record<string, unknown>;
    recoverable?: boolean;
    retryable?: boolean;
  }) {
    super(options.message);

    // Error クラスの名前を設定
    this.name = 'CustomError';

    // プロパティを設定
    this.code = options.code;
    this.level = options.level;
    this.category = options.category;
    this.httpStatus = options.httpStatus;
    this.timestamp = new Date().toISOString();
    this.context = options.context;
    this.cause = options.cause;
    this.messageJa = options.messageJa;
    this.suggestedAction = options.suggestedAction;
    this.details = options.details;
    this.recoverable = options.recoverable ?? false;
    this.retryable = options.retryable ?? false;

    // スタックトレースを設定
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CustomError);
    }

    // コンテキストにスタックトレースを追加
    if (this.context) {
      this.context.stackTrace = this.stack;
    }
  }

  /**
   * エラー情報のシリアライズ
   */
  toJSON(): StructuredError {
    return {
      code: this.code,
      message: this.message,
      messageJa: this.messageJa,
      level: this.level,
      category: this.category,
      httpStatus: this.httpStatus,
      timestamp: this.timestamp,
      context: this.context,
      cause: this.cause instanceof CustomError ? this.cause.toJSON() : 
             this.cause instanceof Error ? {
               name: this.cause.name,
               message: this.cause.message,
               stack: this.cause.stack,
             } as any : this.cause,
      suggestedAction: this.suggestedAction,
      details: this.details,
      recoverable: this.recoverable,
      retryable: this.retryable,
    };
  }

  /**
   * ログ出力用の文字列表現
   */
  toString(): string {
    const parts = [
      `[${this.code}]`,
      `${this.category.toUpperCase()}`,
      `(${this.level.toUpperCase()})`,
      this.message,
    ];

    if (this.context?.userId) {
      parts.push(`User: ${this.context.userId}`);
    }

    if (this.context?.requestId) {
      parts.push(`Request: ${this.context.requestId}`);
    }

    return parts.join(' ');
  }

  /**
   * エラーチェーンの深さを取得
   */
  getChainDepth(): number {
    let depth = 1;
    let current = this.cause;
    
    while (current) {
      depth++;
      if (current instanceof CustomError) {
        current = current.cause;
      } else {
        break;
      }
    }
    
    return depth;
  }

  /**
   * ルート原因エラーを取得
   */
  getRootCause(): Error | StructuredError | undefined {
    let current = this.cause;
    
    while (current) {
      if (current instanceof CustomError && current.cause) {
        current = current.cause;
      } else {
        break;
      }
    }
    
    return current;
  }

  /**
   * エラーチェーン内で指定したコードを持つエラーがあるかチェック
   */
  hasErrorCode(code: ErrorCode): boolean {
    if (this.code === code) {
      return true;
    }
    
    if (this.cause instanceof CustomError) {
      return this.cause.hasErrorCode(code);
    }
    
    return false;
  }

  /**
   * エラーチェーン内で指定したカテゴリのエラーがあるかチェック
   */
  hasCategory(category: ErrorCategory): boolean {
    if (this.category === category) {
      return true;
    }
    
    if (this.cause instanceof CustomError) {
      return this.cause.hasCategory(category);
    }
    
    return false;
  }

  /**
   * コンテキスト情報を追加
   */
  withContext(context: Partial<ErrorContext>): CustomError {
    return new CustomError({
      code: this.code,
      message: this.message,
      messageJa: this.messageJa,
      level: this.level,
      category: this.category,
      httpStatus: this.httpStatus,
      context: { ...this.context, ...context },
      cause: this.cause,
      suggestedAction: this.suggestedAction,
      details: this.details,
      recoverable: this.recoverable,
      retryable: this.retryable,
    });
  }

  /**
   * 詳細情報を追加
   */
  withDetails(details: Record<string, unknown>): CustomError {
    return new CustomError({
      code: this.code,
      message: this.message,
      messageJa: this.messageJa,
      level: this.level,
      category: this.category,
      httpStatus: this.httpStatus,
      context: this.context,
      cause: this.cause,
      suggestedAction: this.suggestedAction,
      details: { ...this.details, ...details },
      recoverable: this.recoverable,
      retryable: this.retryable,
    });
  }

  /**
   * 推奨アクションを設定
   */
  withSuggestedAction(action: string): CustomError {
    return new CustomError({
      code: this.code,
      message: this.message,
      messageJa: this.messageJa,
      level: this.level,
      category: this.category,
      httpStatus: this.httpStatus,
      context: this.context,
      cause: this.cause,
      suggestedAction: action,
      details: this.details,
      recoverable: this.recoverable,
      retryable: this.retryable,
    });
  }
}

/**
 * エラーファクトリー関数（認証エラー用）
 */
export function createAuthenticationError(
  code: ErrorCode,
  message: string,
  options?: {
    messageJa?: string;
    context?: ErrorContext;
    cause?: Error | StructuredError;
    suggestedAction?: string;
    details?: Record<string, unknown>;
  }
): CustomError {
  return new CustomError({
    code,
    message,
    messageJa: options?.messageJa,
    level: ErrorLevel.ERROR,
    category: ErrorCategory.AUTHENTICATION,
    httpStatus: HttpStatus.UNAUTHORIZED,
    context: options?.context,
    cause: options?.cause,
    suggestedAction: options?.suggestedAction || 'Please log in again',
    details: options?.details,
    recoverable: true,
    retryable: false,
  });
}

/**
 * エラーファクトリー関数（認可エラー用）
 */
export function createAuthorizationError(
  code: ErrorCode,
  message: string,
  options?: {
    messageJa?: string;
    context?: ErrorContext;
    cause?: Error | StructuredError;
    suggestedAction?: string;
    details?: Record<string, unknown>;
  }
): CustomError {
  return new CustomError({
    code,
    message,
    messageJa: options?.messageJa,
    level: ErrorLevel.ERROR,
    category: ErrorCategory.AUTHORIZATION,
    httpStatus: HttpStatus.FORBIDDEN,
    context: options?.context,
    cause: options?.cause,
    suggestedAction: options?.suggestedAction || 'Contact administrator for access permissions',
    details: options?.details,
    recoverable: false,
    retryable: false,
  });
}

/**
 * エラーファクトリー関数（バリデーションエラー用）
 */
export function createValidationError(
  code: ErrorCode,
  message: string,
  options?: {
    messageJa?: string;
    context?: ErrorContext;
    cause?: Error | StructuredError;
    suggestedAction?: string;
    details?: Record<string, unknown>;
  }
): CustomError {
  return new CustomError({
    code,
    message,
    messageJa: options?.messageJa,
    level: ErrorLevel.WARNING,
    category: ErrorCategory.VALIDATION,
    httpStatus: HttpStatus.BAD_REQUEST,
    context: options?.context,
    cause: options?.cause,
    suggestedAction: options?.suggestedAction || 'Please check your input and try again',
    details: options?.details,
    recoverable: true,
    retryable: false,
  });
}

/**
 * エラーファクトリー関数（サーバーエラー用）
 */
export function createServerError(
  code: ErrorCode,
  message: string,
  options?: {
    messageJa?: string;
    context?: ErrorContext;
    cause?: Error | StructuredError;
    suggestedAction?: string;
    details?: Record<string, unknown>;
    retryable?: boolean;
  }
): CustomError {
  return new CustomError({
    code,
    message,
    messageJa: options?.messageJa,
    level: ErrorLevel.ERROR,
    category: ErrorCategory.SYSTEM,
    httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    context: options?.context,
    cause: options?.cause,
    suggestedAction: options?.suggestedAction || 'Please try again later or contact support',
    details: options?.details,
    recoverable: true,
    retryable: options?.retryable ?? true,
  });
}

/**
 * エラーファクトリー関数（ネットワークエラー用）
 */
export function createNetworkError(
  code: ErrorCode,
  message: string,
  options?: {
    messageJa?: string;
    context?: ErrorContext;
    cause?: Error | StructuredError;
    suggestedAction?: string;
    details?: Record<string, unknown>;
  }
): CustomError {
  return new CustomError({
    code,
    message,
    messageJa: options?.messageJa,
    level: ErrorLevel.ERROR,
    category: ErrorCategory.NETWORK,
    httpStatus: HttpStatus.BAD_GATEWAY,
    context: options?.context,
    cause: options?.cause,
    suggestedAction: options?.suggestedAction || 'Check network connection and try again',
    details: options?.details,
    recoverable: true,
    retryable: true,
  });
}

/**
 * 一般的なエラーからCustomErrorに変換
 */
export function convertToCustomError(
  error: unknown,
  code: ErrorCode,
  message: string,
  category: ErrorCategory = ErrorCategory.UNKNOWN
): CustomError {
  const cause = error instanceof Error ? error : undefined;
  
  return new CustomError({
    code,
    message,
    level: ErrorLevel.ERROR,
    category,
    httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    cause,
    recoverable: true,
    retryable: false,
  });
}