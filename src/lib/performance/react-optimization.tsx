import React, { 
  memo, 
  useMemo, 
  useCallback, 
  lazy, 
  Suspense,
  ComponentType,
  ReactNode 
} from 'react';

// =============================================================================
// React パフォーマンス最適化ユーティリティ
// メモ化、遅延読み込み、仮想化の包括的実装
// =============================================================================

/**
 * 高階コンポーネント: パフォーマンス最適化
 */
export function withPerformanceOptimization<T extends Record<string, any>>(
  WrappedComponent: ComponentType<T>,
  displayName?: string
) {
  const OptimizedComponent = memo(WrappedComponent, (prevProps, nextProps) => {
    // カスタム比較ロジック
    const prevKeys = Object.keys(prevProps);
    const nextKeys = Object.keys(nextProps);

    if (prevKeys.length !== nextKeys.length) {
      return false;
    }

    for (const key of prevKeys) {
      if (prevProps[key] !== nextProps[key]) {
        // 特定のプロパティの深い比較
        if (typeof prevProps[key] === 'object' && prevProps[key] !== null) {
          if (!deepEqual(prevProps[key], nextProps[key])) {
            return false;
          }
        } else {
          return false;
        }
      }
    }

    return true;
  });

  OptimizedComponent.displayName = displayName || `withPerformanceOptimization(${WrappedComponent.displayName || WrappedComponent.name})`;

  return OptimizedComponent;
}

/**
 * 深い等価性チェック（パフォーマンスを考慮した実装）
 */
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== 'object' || typeof b !== 'object') return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }

  return true;
}

/**
 * 遅延読み込みコンポーネントファクトリー
 */
export function createLazyComponent<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  fallback: ReactNode = <div className="animate-pulse bg-gray-200 h-32 w-full rounded" />
) {
  const LazyComponent = lazy(importFn);
  
  return function LazyWrapper(props: React.ComponentProps<T>) {
    return (
      <Suspense fallback={fallback}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}

/**
 * 仮想化対応リスト項目コンポーネント
 */
interface VirtualizedListItemProps {
  index: number;
  style: React.CSSProperties;
  data: any[];
  itemHeight: number;
  renderItem: (item: any, index: number) => ReactNode;
}

export const VirtualizedListItem = memo<VirtualizedListItemProps>(({
  index,
  style,
  data,
  renderItem
}) => {
  const item = data[index];
  
  return (
    <div style={style} className="virtual-list-item">
      {renderItem(item, index)}
    </div>
  );
});

VirtualizedListItem.displayName = 'VirtualizedListItem';

/**
 * カスタムフック: メモ化された値の管理
 */
export function useMemoizedValue<T>(
  getValue: () => T,
  dependencies: React.DependencyList
): T {
  return useMemo(getValue, dependencies);
}

/**
 * カスタムフック: メモ化されたコールバック
 */
export function useMemoizedCallback<T extends (...args: any[]) => any>(
  callback: T,
  dependencies: React.DependencyList
): T {
  return useCallback(callback, dependencies);
}

/**
 * パフォーマンス測定ユーティリティ
 */
export class PerformanceProfiler {
  private static measurements = new Map<string, number>();

  /**
   * パフォーマンス測定開始
   */
  static start(label: string): void {
    this.measurements.set(label, Date.now());
    if (typeof window !== 'undefined' && window.performance) {
      performance.mark(`${label}-start`);
    }
  }

  /**
   * パフォーマンス測定終了
   */
  static end(label: string): number {
    const startTime = this.measurements.get(label);
    if (!startTime) {
      console.warn(`Performance measurement not found for label: ${label}`);
      return 0;
    }

    const duration = Date.now() - startTime;
    this.measurements.delete(label);

    if (typeof window !== 'undefined' && window.performance) {
      performance.mark(`${label}-end`);
      performance.measure(label, `${label}-start`, `${label}-end`);
    }

    // 開発環境でのログ出力
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Performance] ${label}: ${duration}ms`);
    }

    return duration;
  }

  /**
   * React Profiler コンポーネント
   */
  static createProfiler(id: string, onRender?: (id: string, phase: 'mount' | 'update', actualDuration: number) => void) {
    return function ProfilerWrapper({ children }: { children: ReactNode }) {
      return (
        <React.Profiler
          id={id}
          onRender={(id, phase, actualDuration, baseDuration, startTime, commitTime) => {
            if (process.env.NODE_ENV === 'development') {
              console.log(`[React Profiler] ${id} (${phase}): ${actualDuration}ms`);
            }
            onRender?.(id, phase, actualDuration);
          }}
        >
          {children}
        </React.Profiler>
      );
    };
  }
}

/**
 * 画像遅延読み込みフック
 */
export function useLazyImage(src: string, placeholder?: string) {
  const [imageSrc, setImageSrc] = React.useState(placeholder || '');
  const [isLoaded, setIsLoaded] = React.useState(false);
  const [isError, setIsError] = React.useState(false);

  React.useEffect(() => {
    const img = new Image();
    
    img.onload = () => {
      setImageSrc(src);
      setIsLoaded(true);
      setIsError(false);
    };

    img.onerror = () => {
      setIsError(true);
      setIsLoaded(false);
    };

    img.src = src;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);

  return { imageSrc, isLoaded, isError };
}

/**
 * レンダリング最適化フック
 */
export function useRenderOptimization() {
  const renderCount = React.useRef(0);
  
  React.useEffect(() => {
    renderCount.current += 1;
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`Render count: ${renderCount.current}`);
    }
  });

  return {
    renderCount: renderCount.current,
    resetCount: () => {
      renderCount.current = 0;
    }
  };
}

/**
 * バンドル分割設定
 */
export const LazyComponents = {
  // ダッシュボード関連
  Dashboard: createLazyComponent(() => import('@/app/dashboard/page')),
  
  // サーバー管理関連
  ServerList: createLazyComponent(() => import('@/app/servers/page')),
  ServerDetail: createLazyComponent(() => import('@/app/servers/[id]/page')),
  ServerCreate: createLazyComponent(() => import('@/app/servers/create/page')),
  
  // シークレット管理関連
  SecretsList: createLazyComponent(() => import('@/app/secrets/page')),
  SecretsDetail: createLazyComponent(() => import('@/app/secrets/[id]/page')),
  
  // カタログ関連
  Catalog: createLazyComponent(() => import('@/app/catalog/page')),
  
  // ログ・監視関連
  Logs: createLazyComponent(() => import('@/app/logs/page')),
};

/**
 * コードスプリッティング設定
 */
export const CodeSplitting = {
  // 重いライブラリの動的インポート
  loadChartLibrary: () => import('recharts'),
  loadMarkdownRenderer: () => import('react-markdown'),
  loadCodeEditor: () => import('@monaco-editor/react'),
  
  // ユーティリティライブラリの動的インポート
  loadDateUtils: () => import('date-fns'),
  loadCryptoUtils: () => import('@/lib/crypto/encryption'),
};

/**
 * メモリリーク防止フック
 */
export function useMemoryLeakPrevention() {
  const timeoutsRef = React.useRef<NodeJS.Timeout[]>([]);
  const intervalsRef = React.useRef<NodeJS.Timeout[]>([]);
  const abortControllersRef = React.useRef<AbortController[]>([]);

  const createTimeout = useCallback((callback: () => void, delay: number) => {
    const timeout = setTimeout(callback, delay);
    timeoutsRef.current.push(timeout);
    return timeout;
  }, []);

  const createInterval = useCallback((callback: () => void, delay: number) => {
    const interval = setInterval(callback, delay);
    intervalsRef.current.push(interval);
    return interval;
  }, []);

  const createAbortController = useCallback(() => {
    const controller = new AbortController();
    abortControllersRef.current.push(controller);
    return controller;
  }, []);

  React.useEffect(() => {
    return () => {
      // タイムアウトとインターバルのクリアup
      timeoutsRef.current.forEach(clearTimeout);
      intervalsRef.current.forEach(clearInterval);
      
      // 進行中のリクエストのキャンセル
      abortControllersRef.current.forEach(controller => {
        if (!controller.signal.aborted) {
          controller.abort();
        }
      });
    };
  }, []);

  return {
    createTimeout,
    createInterval,
    createAbortController
  };
}