/**
 * 非同期操作管理フック
 * ローディング状態、エラーハンドリング、操作状態の統合管理
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useErrorHandler } from './useErrorHandler';

export interface AsyncOperationState<T = any> {
  data: T | null;
  isLoading: boolean;
  isError: boolean;
  error: string | null;
  isSuccess: boolean;
}

/**
 * 非同期操作オプション
 */
export interface AsyncOperationOptions {
  /** 操作名（ログ用） */
  operationName?: string;
  /** 成功時のメッセージ */
  successMessage?: string;
  /** 自動リトライ回数 */
  retryCount?: number;
  /** リトライ間隔（ミリ秒） */
  retryDelay?: number;
  /** タイムアウト（ミリ秒） */
  timeout?: number;
  /** 重複実行を防ぐ */
  preventDuplicateExecution?: boolean;
}

/**
 * 非同期操作管理フック
 */
export function useAsyncOperation<T = any>(
  componentName?: string,
  options: AsyncOperationOptions = {}
) {
  const {
    operationName = 'AsyncOperation',
    retryCount = 0,
    retryDelay = 1000,
    timeout = 30000,
    preventDuplicateExecution = true,
  } = options;

  const [state, setState] = useState<AsyncOperationState<T>>({
    data: null,
    isLoading: false,
    isError: false,
    error: null,
    isSuccess: false,
  });

  const { setError, clearError } = useErrorHandler(componentName);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isExecutingRef = useRef(false);

  /**
   * 状態をリセット
   */
  const reset = useCallback(() => {
    setState({
      data: null,
      isLoading: false,
      isError: false,
      error: null,
      isSuccess: false,
    });
    clearError();

    // 進行中の操作をキャンセル
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    isExecutingRef.current = false;
  }, [clearError]);

  /**
   * 非同期関数を実行
   */
  const execute = useCallback(async <R = T>(
    asyncFn: (signal?: AbortSignal) => Promise<R>,
    executeOptions?: Partial<AsyncOperationOptions>
  ): Promise<R | null> => {
    // 重複実行チェック
    if (preventDuplicateExecution && isExecutingRef.current) {
      return null;
    }

    // 前の操作をキャンセル
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    isExecutingRef.current = true;

    const currentTimeout = executeOptions?.timeout ?? timeout;
    const currentRetryCount = executeOptions?.retryCount ?? retryCount;
    const currentRetryDelay = executeOptions?.retryDelay ?? retryDelay;

    // タイムアウト設定
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, currentTimeout);

    // ローディング開始
    setState(prev => ({
      ...prev,
      isLoading: true,
      isError: false,
      error: null,
      isSuccess: false,
    }));

    clearError();

    let lastError: any = null;
    let attempt = 0;

    while (attempt <= currentRetryCount) {
      try {
        const result = await asyncFn(controller.signal);

        clearTimeout(timeoutId);
        isExecutingRef.current = false;

        setState({
          data: result as T,
          isLoading: false,
          isError: false,
          error: null,
          isSuccess: true,
        });

        return result;
      } catch (error: any) {
        lastError = error;
        attempt++;

        // アボートされた場合は即座に終了
        if (error.name === 'AbortError' || controller.signal.aborted) {
          break;
        }

        // 最後の試行でない場合はリトライ
        if (attempt <= currentRetryCount) {
          await new Promise(resolve => setTimeout(resolve, currentRetryDelay));
        }
      }
    }

    // エラー処理
    clearTimeout(timeoutId);
    isExecutingRef.current = false;

    const errorMessage = lastError?.message || 'Operation failed';

    setState({
      data: null,
      isLoading: false,
      isError: true,
      error: errorMessage,
      isSuccess: false,
    });

    setError(lastError, undefined, {
      operationName,
      attempt,
      retryCount: currentRetryCount,
    });

    return null;
  }, [
    operationName,
    preventDuplicateExecution,
    timeout,
    retryCount,
    retryDelay,
    setError,
    clearError,
  ]);

  /**
   * キャンセル処理
   */
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    isExecutingRef.current = false;

    setState(prev => ({
      ...prev,
      isLoading: false,
    }));
  }, []);

  /**
   * コンポーネントアンマウント時のクリーンアップ
   */
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    ...state,
    execute,
    reset,
    cancel,
    isExecuting: isExecutingRef.current,
  };
}

/**
 * データフェッチ専用フック
 */
export function useAsyncData<T>(
  fetchFn: () => Promise<T>,
  dependencies: React.DependencyList = [],
  options: AsyncOperationOptions = {}
) {
  const { execute, ...state } = useAsyncOperation<T>(undefined, options);

  const fetchData = useCallback(() => {
    return execute(() => fetchFn());
  }, [execute, fetchFn]);

  // 依存関係が変更された時に自動でフェッチ
  useEffect(() => {
    fetchData();
  }, dependencies);

  return {
    ...state,
    refetch: fetchData,
  };
}

/**
 * ミューテーション（データ変更）専用フック
 */
export function useAsyncMutation<TData = any, TVariables = any>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options: AsyncOperationOptions = {}
) {
  const { execute, ...state } = useAsyncOperation<TData>(undefined, options);

  const mutate = useCallback((variables: TVariables) => {
    return execute(() => mutationFn(variables));
  }, [execute, mutationFn]);

  return {
    ...state,
    mutate,
  };
}

export default useAsyncOperation;