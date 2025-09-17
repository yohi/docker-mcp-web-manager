/**
 * エラーハンドリング共通フック
 * アプリケーション全体で一貫したエラー処理を提供
 */

import { useCallback, useState } from 'react';
import { appLogger } from '@/lib/utils/logger';

export interface ErrorState {
  error: string | null;
  isError: boolean;
  errorCode?: string;
  errorDetails?: Record<string, any>;
}

/**
 * エラーハンドリングフック
 */
export function useErrorHandler(componentName?: string) {
  const [errorState, setErrorState] = useState<ErrorState>({
    error: null,
    isError: false,
  });

  const logger = componentName ? appLogger.forComponent(componentName) : appLogger;

  /**
   * エラーをクリア
   */
  const clearError = useCallback(() => {
    setErrorState({
      error: null,
      isError: false,
    });
  }, []);

  /**
   * エラーを設定
   */
  const setError = useCallback((
    error: string | Error | unknown,
    errorCode?: string,
    errorDetails?: Record<string, any>
  ) => {
    let errorMessage: string;

    if (error instanceof Error) {
      errorMessage = error.message;
      logger.error('Error occurred', error, {
        errorCode,
        ...errorDetails,
      });
    } else if (typeof error === 'string') {
      errorMessage = error;
      logger.error('Error occurred', undefined, {
        message: error,
        errorCode,
        ...errorDetails,
      });
    } else {
      errorMessage = 'An unknown error occurred';
      logger.error('Unknown error occurred', undefined, {
        error,
        errorCode,
        ...errorDetails,
      });
    }

    setErrorState({
      error: errorMessage,
      isError: true,
      errorCode,
      errorDetails,
    });
  }, [logger]);

  /**
   * 非同期関数を安全に実行するラッパー
   */
  const withErrorHandling = useCallback(
    <T extends (...args: any[]) => Promise<any>>(
      asyncFn: T,
      errorContext?: string
    ) => {
      return async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>> | null> => {
        try {
          clearError();
          return await asyncFn(...args);
        } catch (error) {
          const context = errorContext || 'Operation failed';
          setError(error, undefined, { context, args });
          return null;
        }
      };
    },
    [clearError, setError]
  );

  /**
   * API エラーレスポンスをパース
   */
  const handleApiError = useCallback(async (response: Response) => {
    try {
      const errorData = await response.json();

      if (errorData.error) {
        setError(
          errorData.error.message || 'API error occurred',
          errorData.error.code,
          {
            status: response.status,
            statusText: response.statusText,
            details: errorData.error.details,
          }
        );
      } else {
        setError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status.toString(),
          {
            status: response.status,
            statusText: response.statusText,
          }
        );
      }
    } catch (parseError) {
      setError(
        `HTTP ${response.status}: ${response.statusText}`,
        response.status.toString(),
        {
          status: response.status,
          statusText: response.statusText,
          parseError: parseError instanceof Error ? parseError.message : 'Unknown parse error',
        }
      );
    }
  }, [setError]);

  /**
   * フォームエラーを処理
   */
  const handleFormError = useCallback((
    fieldErrors: Record<string, string[]> | undefined,
    generalError?: string
  ) => {
    if (fieldErrors) {
      const errorMessages = Object.entries(fieldErrors)
        .map(([field, errors]) => `${field}: ${errors.join(', ')}`)
        .join('; ');

      setError(
        generalError || 'Validation errors occurred',
        'VALIDATION_ERROR',
        { fieldErrors, errorMessages }
      );
    } else if (generalError) {
      setError(generalError, 'FORM_ERROR');
    }
  }, [setError]);

  /**
   * ユーザーフレンドリーなエラーメッセージを取得
   */
  const getUserFriendlyMessage = useCallback((error: string | null): string => {
    if (!error) return '';

    // 一般的なエラーパターンのマッピング
    const errorMappings: Record<string, string> = {
      'Network Error': 'ネットワークエラーが発生しました。接続を確認してください。',
      'Failed to fetch': 'サーバーに接続できませんでした。',
      'Unauthorized': '認証が必要です。ログインしてください。',
      'Forbidden': 'この操作を実行する権限がありません。',
      'Not Found': '要求されたリソースが見つかりません。',
      'Internal Server Error': 'サーバー内部エラーが発生しました。',
      'Bad Request': '不正なリクエストです。入力内容を確認してください。',
    };

    // エラーメッセージの部分マッチング
    for (const [pattern, message] of Object.entries(errorMappings)) {
      if (error.includes(pattern)) {
        return message;
      }
    }

    return error;
  }, []);

  return {
    ...errorState,
    error: getUserFriendlyMessage(errorState.error),
    setError,
    clearError,
    withErrorHandling,
    handleApiError,
    handleFormError,
    getUserFriendlyMessage,
  };
}

/**
 * グローバルエラーハンドラー（未処理エラーをキャッチ）
 */
export function setupGlobalErrorHandler() {
  // React エラーバウンダリで処理されないエラー
  window.addEventListener('error', (event) => {
    appLogger.error('Unhandled error', event.error, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  // Promise の未処理リジェクション
  window.addEventListener('unhandledrejection', (event) => {
    appLogger.error('Unhandled promise rejection', event.reason);

    // 開発環境では詳細を表示
    if (process.env.NODE_ENV === 'development') {
      console.error('Unhandled promise rejection:', event.reason);
    }
  });
}

export default useErrorHandler;