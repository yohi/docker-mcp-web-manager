/**
 * トースト通知システム
 * 
 * 機能要件：
 * - エラー・成功・警告・情報の通知表示
 * - 自動消去とスタック管理
 * - アニメーション効果
 * - アクセシビリティ対応
 */

'use client';

import React, { 
  createContext, 
  useContext, 
  useState, 
  useCallback, 
  ReactNode,
  useEffect,
  useMemo,
} from 'react';
import { CustomError } from '@/lib/errors/CustomError';
import { ErrorLevel, ErrorCode } from '@/lib/errors/types';

/**
 * トースト通知の種類
 */
export type ToastType = 'success' | 'error' | 'warning' | 'info';

/**
 * トースト通知の情報
 */
export interface ToastNotification {
  id: string;
  type: ToastType;
  title: string;
  message: string;
  duration?: number; // 表示時間（ms）、undefinedの場合は手動で閉じるまで表示
  dismissible?: boolean; // 手動で閉じられるか
  action?: {
    label: string;
    onClick: () => void;
  };
  errorCode?: ErrorCode;
  timestamp: number;
}

/**
 * トーストコンテキストの型
 */
interface ToastContextType {
  toasts: ToastNotification[];
  addToast: (toast: Omit<ToastNotification, 'id' | 'timestamp'>) => string;
  removeToast: (id: string) => void;
  clearAll: () => void;
  showSuccess: (title: string, message: string, options?: Partial<ToastNotification>) => string;
  showError: (title: string, message: string, options?: Partial<ToastNotification>) => string;
  showErrorFromCustomError: (error: CustomError, options?: Partial<ToastNotification>) => string;
  showWarning: (title: string, message: string, options?: Partial<ToastNotification>) => string;
  showInfo: (title: string, message: string, options?: Partial<ToastNotification>) => string;
}

/**
 * トーストコンテキスト
 */
const ToastContext = createContext<ToastContextType | null>(null);

/**
 * デフォルト設定
 */
const DEFAULT_DURATION = {
  success: 4000,
  info: 5000,
  warning: 6000,
  error: 8000,
} as const;

/**
 * トーストプロバイダーのプロパティ
 */
interface ToastProviderProps {
  children: ReactNode;
  maxToasts?: number; // 最大表示数
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
}

/**
 * トーストプロバイダー
 */
export function ToastProvider({ 
  children, 
  maxToasts = 5,
  position = 'top-right',
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  /**
   * トーストを追加
   */
  const addToast = useCallback((toastData: Omit<ToastNotification, 'id' | 'timestamp'>): string => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = Date.now();
    
    const newToast: ToastNotification = {
      id,
      timestamp,
      duration: DEFAULT_DURATION[toastData.type],
      dismissible: true,
      ...toastData,
    };

    setToasts(currentToasts => {
      // 最大数を超える場合は古いものを削除
      const updatedToasts = [newToast, ...currentToasts];
      return updatedToasts.length > maxToasts 
        ? updatedToasts.slice(0, maxToasts)
        : updatedToasts;
    });

    // 自動消去の設定
    if (newToast.duration && newToast.duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, newToast.duration);
    }

    return id;
  }, [maxToasts]);

  /**
   * トーストを削除
   */
  const removeToast = useCallback((id: string) => {
    setToasts(currentToasts => currentToasts.filter(toast => toast.id !== id));
  }, []);

  /**
   * 全てのトーストをクリア
   */
  const clearAll = useCallback(() => {
    setToasts([]);
  }, []);

  /**
   * 成功通知を表示
   */
  const showSuccess = useCallback((
    title: string, 
    message: string, 
    options?: Partial<ToastNotification>
  ): string => {
    return addToast({
      type: 'success',
      title,
      message,
      ...options,
    });
  }, [addToast]);

  /**
   * エラー通知を表示
   */
  const showError = useCallback((
    title: string, 
    message: string, 
    options?: Partial<ToastNotification>
  ): string => {
    return addToast({
      type: 'error',
      title,
      message,
      ...options,
    });
  }, [addToast]);

  /**
   * CustomErrorからエラー通知を表示
   */
  const showErrorFromCustomError = useCallback((
    error: CustomError,
    options?: Partial<ToastNotification>
  ): string => {
    return addToast({
      type: 'error',
      title: 'エラーが発生しました',
      message: error.messageJa || error.message,
      errorCode: error.code,
      action: error.recoverable ? {
        label: '再試行',
        onClick: () => window.location.reload(),
      } : undefined,
      ...options,
    });
  }, [addToast]);

  /**
   * 警告通知を表示
   */
  const showWarning = useCallback((
    title: string, 
    message: string, 
    options?: Partial<ToastNotification>
  ): string => {
    return addToast({
      type: 'warning',
      title,
      message,
      ...options,
    });
  }, [addToast]);

  /**
   * 情報通知を表示
   */
  const showInfo = useCallback((
    title: string, 
    message: string, 
    options?: Partial<ToastNotification>
  ): string => {
    return addToast({
      type: 'info',
      title,
      message,
      ...options,
    });
  }, [addToast]);

  const contextValue = useMemo(() => ({
    toasts,
    addToast,
    removeToast,
    clearAll,
    showSuccess,
    showError,
    showErrorFromCustomError,
    showWarning,
    showInfo,
  }), [toasts, addToast, removeToast, clearAll, showSuccess, showError, showErrorFromCustomError, showWarning, showInfo]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastContainer toasts={toasts} position={position} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

/**
 * トーストコンテナーのプロパティ
 */
interface ToastContainerProps {
  toasts: ToastNotification[];
  position: string;
  onRemove: (id: string) => void;
}

/**
 * トーストコンテナー
 */
function ToastContainer({ toasts, position, onRemove }: ToastContainerProps) {
  const positionClasses = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'top-center': 'top-4 left-1/2 transform -translate-x-1/2',
    'bottom-center': 'bottom-4 left-1/2 transform -translate-x-1/2',
  }[position] || 'top-4 right-4';

  return (
    <div 
      className={`fixed z-50 flex flex-col space-y-2 ${positionClasses} max-w-sm w-full pointer-events-none`}
      role="region"
      aria-label="通知"
    >
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}

/**
 * 個別トースト通知のプロパティ
 */
interface ToastItemProps {
  toast: ToastNotification;
  onRemove: (id: string) => void;
}

/**
 * 個別トースト通知
 */
function ToastItem({ toast, onRemove }: ToastItemProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  // マウント時のアニメーション
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  /**
   * トーストを削除する際のアニメーション
   */
  const handleRemove = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => onRemove(toast.id), 300);
  }, [toast.id, onRemove]);

  const typeConfig = {
    success: {
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      iconColor: 'text-green-600',
      icon: (
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clipRule="evenodd"
        />
      ),
    },
    error: {
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      iconColor: 'text-red-600',
      icon: (
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
          clipRule="evenodd"
        />
      ),
    },
    warning: {
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-200',
      iconColor: 'text-yellow-600',
      icon: (
        <path
          fillRule="evenodd"
          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      ),
    },
    info: {
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      iconColor: 'text-blue-600',
      icon: (
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
          clipRule="evenodd"
        />
      ),
    },
  }[toast.type];

  return (
    <div
      role="alert"
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
      className={`
        pointer-events-auto transform transition-all duration-300 ease-in-out
        ${isVisible && !isExiting ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
        ${typeConfig.bgColor} ${typeConfig.borderColor} border rounded-lg shadow-lg p-4 max-w-sm w-full
      `}
    >
      <div className="flex items-start">
        {/* アイコン */}
        <div className="flex-shrink-0">
          <svg
            className={`w-5 h-5 ${typeConfig.iconColor}`}
            fill="currentColor"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            {typeConfig.icon}
          </svg>
        </div>

        {/* コンテンツ */}
        <div className="ml-3 flex-1">
          <h4 className="text-sm font-medium text-gray-900">{toast.title}</h4>
          <p className="mt-1 text-sm text-gray-600">{toast.message}</p>

          {/* エラーコード */}
          {toast.errorCode && (
            <p className="mt-1 text-xs text-gray-500">エラーコード: {toast.errorCode}</p>
          )}

          {/* アクション */}
          {toast.action && (
            <div className="mt-3">
              <button
                onClick={toast.action.onClick}
                className="text-sm font-medium text-blue-600 hover:text-blue-500 focus:outline-none focus:underline"
              >
                {toast.action.label}
              </button>
            </div>
          )}
        </div>

        {/* 閉じるボタン */}
        {toast.dismissible && (
          <button
            onClick={handleRemove}
            className="ml-4 flex-shrink-0 text-gray-400 hover:text-gray-600 focus:outline-none focus:text-gray-600 transition-colors"
            aria-label="通知を閉じる"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * トーストフックの使用
 */
export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}