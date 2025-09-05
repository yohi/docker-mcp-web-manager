/**
 * Reactエラーバウンダリー
 * 
 * 機能要件：
 * - Reactコンポーネントエラーのキャッチ
 * - エラー情報の構造化
 * - フォールバックUI の表示
 * - エラー報告とロギング
 */

'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { CustomError, createServerError } from '@/lib/errors/CustomError';
import { ErrorCodes, ErrorLevel, ErrorCategory } from '@/lib/errors/types';
import { globalErrorHandler } from '@/lib/errors/ErrorHandler';

/**
 * エラーバウンダリーの状態
 */
interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error | CustomError;
  errorInfo?: ErrorInfo;
  errorId?: string;
}

/**
 * エラーバウンダリーのプロパティ
 */
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error | CustomError, errorId: string, retry: () => void) => ReactNode;
  onError?: (error: Error | CustomError, errorInfo: ErrorInfo) => void;
  isolate?: boolean; // エラーを隔離するか（子コンポーネントのみ影響）
  level?: 'page' | 'section' | 'component'; // エラーバウンダリーのレベル
  name?: string; // デバッグ用の名前
}

/**
 * デフォルトエラー表示コンポーネント
 */
function DefaultErrorFallback({
  error,
  errorId,
  retry,
  level = 'component',
}: {
  error: Error | CustomError;
  errorId: string;
  retry: () => void;
  level?: 'page' | 'section' | 'component';
}) {
  const isCustomError = error instanceof CustomError;
  const errorCode = isCustomError ? error.code : 'UNKNOWN_001';
  const errorMessage = isCustomError ? error.messageJa || error.message : error.message;

  const containerClass = {
    page: 'min-h-screen bg-gray-50 flex items-center justify-center p-4',
    section: 'bg-white border border-red-200 rounded-lg p-6 m-4',
    component: 'bg-red-50 border border-red-200 rounded-md p-4',
  }[level];

  const iconSize = {
    page: 'w-16 h-16',
    section: 'w-12 h-12',
    component: 'w-8 h-8',
  }[level];

  const titleSize = {
    page: 'text-2xl',
    section: 'text-xl',
    component: 'text-lg',
  }[level];

  return (
    <div className={containerClass}>
      <div className="text-center max-w-md mx-auto">
        {/* エラーアイコン */}
        <div className="flex justify-center mb-4">
          <svg
            className={`${iconSize} text-red-500`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
        </div>

        {/* エラーメッセージ */}
        <h3 className={`${titleSize} font-semibold text-gray-900 mb-2`}>
          {level === 'page' ? 'ページエラーが発生しました' : 
           level === 'section' ? 'セクションエラーが発生しました' : 
           'エラーが発生しました'}
        </h3>
        
        <p className="text-gray-600 mb-4">
          {errorMessage || '予期しないエラーが発生しました'}
        </p>

        {/* エラーコードと ID */}
        <div className="text-sm text-gray-500 mb-6">
          <p>エラーコード: {errorCode}</p>
          <p>エラーID: {errorId}</p>
        </div>

        {/* アクションボタン */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={retry}
            className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            再試行
          </button>

          {level === 'page' && (
            <button
              onClick={() => window.location.href = '/'}
              className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                />
              </svg>
              ホームへ戻る
            </button>
          )}
        </div>

        {/* 開発環境での詳細情報 */}
        {process.env.NODE_ENV === 'development' && (
          <details className="mt-6 text-left">
            <summary className="cursor-pointer text-sm text-gray-500 mb-2">
              開発者情報を表示
            </summary>
            <div className="bg-gray-100 rounded p-3 text-xs font-mono overflow-auto max-h-40">
              <pre>{error.stack}</pre>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

/**
 * Reactエラーバウンダリーコンポーネント
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private retryTimeoutId: NodeJS.Timeout | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  /**
   * エラーをキャッチしてstateを更新
   */
  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    const errorId = `rb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      hasError: true,
      error,
      errorId,
    };
  }

  /**
   * エラー情報をキャッチしてログに記録
   */
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // エラー情報を構造化
    const customError = createServerError(
      ErrorCodes.SYS_005,
      `React component error in ${this.props.name || 'unknown component'}: ${error.message}`,
      {
        messageJa: `Reactコンポーネントでエラーが発生しました: ${error.message}`,
        context: {
          operation: 'component_render',
          metadata: {
            componentStack: errorInfo.componentStack,
            errorBoundaryName: this.props.name,
            errorBoundaryLevel: this.props.level,
            isolate: this.props.isolate,
            errorInfo,
          },
        },
        cause: error,
        details: {
          componentStack: errorInfo.componentStack,
          props: this.props.isolate ? {} : this.props, // isolateの場合は props を記録しない
        },
        retryable: true,
      }
    );

    // カスタムエラーハンドラーがある場合は実行
    if (this.props.onError) {
      try {
        this.props.onError(customError, errorInfo);
      } catch (handlerError) {
        console.error('Error in custom error handler:', handlerError);
      }
    }

    // グローバルエラーハンドラーに記録
    globalErrorHandler.handleError(customError).catch(handlingError => {
      console.error('Failed to handle error:', handlingError);
    });

    // 状態を更新
    this.setState({
      error: customError,
      errorInfo,
    });
  }

  /**
   * エラー状態をリセットして再試行
   */
  private handleRetry = (): void => {
    // 連続的な再試行を防ぐために短い遅延を設ける
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }

    this.retryTimeoutId = setTimeout(() => {
      this.setState({
        hasError: false,
        error: undefined,
        errorInfo: undefined,
        errorId: undefined,
      });
    }, 100);
  };

  /**
   * コンポーネントがアンマウントされる前のクリーンアップ
   */
  componentWillUnmount() {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }
  }

  render() {
    if (this.state.hasError && this.state.error && this.state.errorId) {
      // カスタムフォールバックがある場合は使用
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.state.errorId, this.handleRetry);
      }

      // デフォルトフォールバックを使用
      return (
        <DefaultErrorFallback
          error={this.state.error}
          errorId={this.state.errorId}
          retry={this.handleRetry}
          level={this.props.level}
        />
      );
    }

    return this.props.children;
  }
}

/**
 * ページレベルエラーバウンダリー
 */
export function PageErrorBoundary({
  children,
  fallback,
  onError,
}: {
  children: ReactNode;
  fallback?: (error: Error | CustomError, errorId: string, retry: () => void) => ReactNode;
  onError?: (error: Error | CustomError, errorInfo: ErrorInfo) => void;
}) {
  return (
    <ErrorBoundary
      level="page"
      name="PageErrorBoundary"
      fallback={fallback}
      onError={onError}
    >
      {children}
    </ErrorBoundary>
  );
}

/**
 * セクションレベルエラーバウンダリー
 */
export function SectionErrorBoundary({
  children,
  name,
  fallback,
  onError,
}: {
  children: ReactNode;
  name?: string;
  fallback?: (error: Error | CustomError, errorId: string, retry: () => void) => ReactNode;
  onError?: (error: Error | CustomError, errorInfo: ErrorInfo) => void;
}) {
  return (
    <ErrorBoundary
      level="section"
      name={name || 'SectionErrorBoundary'}
      isolate={true}
      fallback={fallback}
      onError={onError}
    >
      {children}
    </ErrorBoundary>
  );
}

/**
 * コンポーネントレベルエラーバウンダリー
 */
export function ComponentErrorBoundary({
  children,
  name,
  fallback,
  onError,
}: {
  children: ReactNode;
  name?: string;
  fallback?: (error: Error | CustomError, errorId: string, retry: () => void) => ReactNode;
  onError?: (error: Error | CustomError, errorInfo: ErrorInfo) => void;
}) {
  return (
    <ErrorBoundary
      level="component"
      name={name || 'ComponentErrorBoundary'}
      isolate={true}
      fallback={fallback}
      onError={onError}
    >
      {children}
    </ErrorBoundary>
  );
}

/**
 * エラーバウンダリーHOC
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  return WrappedComponent;
}