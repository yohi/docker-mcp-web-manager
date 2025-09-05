/**
 * パフォーマンス最適化ユーティリティ
 * 
 * 機能要件：
 * - 動的インポート管理
 * - メモリ使用量最適化
 * - 遅延読み込み制御
 * - リソース優先度制御
 * - バンドルサイズ監視
 */

import React, { Suspense, lazy, ComponentType, LazyExoticComponent } from 'react'

/**
 * 動的インポート管理
 */
export class DynamicImportManager {
  private loadedModules: Map<string, Promise<any>> = new Map()
  private moduleCache: Map<string, any> = new Map()
  private loadingStates: Map<string, boolean> = new Map()

  /**
   * モジュールの動的インポート（キャッシュ付き）
   */
  async importModule<T = any>(
    moduleId: string,
    importFn: () => Promise<T>
  ): Promise<T> {
    // キャッシュから取得
    if (this.moduleCache.has(moduleId)) {
      return this.moduleCache.get(moduleId)
    }

    // 既に読み込み中の場合は既存のPromiseを返す
    if (this.loadedModules.has(moduleId)) {
      return this.loadedModules.get(moduleId)
    }

    // 新規インポート
    this.loadingStates.set(moduleId, true)
    
    const modulePromise = importFn()
      .then((module) => {
        this.moduleCache.set(moduleId, module)
        this.loadingStates.set(moduleId, false)
        return module
      })
      .catch((error) => {
        this.loadingStates.set(moduleId, false)
        this.loadedModules.delete(moduleId) // 失敗時はPromiseを削除
        throw error
      })

    this.loadedModules.set(moduleId, modulePromise)
    return modulePromise
  }

  /**
   * モジュールの事前読み込み
   */
  async preloadModule<T = any>(
    moduleId: string,
    importFn: () => Promise<T>
  ): Promise<void> {
    if (!this.moduleCache.has(moduleId) && !this.loadedModules.has(moduleId)) {
      this.importModule(moduleId, importFn).catch(() => {
        // 事前読み込みの失敗は無視
      })
    }
  }

  /**
   * モジュールキャッシュクリア
   */
  clearCache(moduleId?: string): void {
    if (moduleId) {
      this.moduleCache.delete(moduleId)
      this.loadedModules.delete(moduleId)
      this.loadingStates.delete(moduleId)
    } else {
      this.moduleCache.clear()
      this.loadedModules.clear()
      this.loadingStates.clear()
    }
  }

  /**
   * 読み込み状態取得
   */
  isLoading(moduleId: string): boolean {
    return this.loadingStates.get(moduleId) || false
  }

  /**
   * キャッシュ状態取得
   */
  isCached(moduleId: string): boolean {
    return this.moduleCache.has(moduleId)
  }
}

export const dynamicImportManager = new DynamicImportManager()

/**
 * 遅延読み込みコンポーネントファクトリ
 */
export function createLazyComponent<T extends ComponentType<any>>(
  importFn: () => Promise<{ default: T }>,
  moduleId: string,
  fallback?: React.ComponentType
): LazyExoticComponent<T> {
  const LazyComponent = lazy(() => 
    dynamicImportManager.importModule(moduleId, importFn)
  )

  // プリロード機能付きコンポーネント
  const EnhancedLazyComponent = React.forwardRef<any, React.ComponentProps<T>>((props, ref) => {
    return (
      <Suspense fallback={fallback ? React.createElement(fallback) : <div>Loading...</div>}>
        <LazyComponent {...props} ref={ref} />
      </Suspense>
    )
  })

  // プリロードメソッド追加
  ;(EnhancedLazyComponent as any).preload = () => {
    return dynamicImportManager.preloadModule(moduleId, importFn)
  }

  return EnhancedLazyComponent as LazyExoticComponent<T>
}

/**
 * メモリ使用量監視クラス
 */
export class MemoryMonitor {
  private thresholds = {
    warning: 50 * 1024 * 1024, // 50MB
    critical: 100 * 1024 * 1024, // 100MB
  }
  
  private callbacks: {
    warning: Array<() => void>
    critical: Array<() => void>
  } = {
    warning: [],
    critical: [],
  }

  private monitorInterval?: NodeJS.Timeout

  constructor() {
    if (this.isMemoryApiSupported()) {
      this.startMonitoring()
    }
  }

  /**
   * Memory API対応チェック
   */
  private isMemoryApiSupported(): boolean {
    return typeof window !== 'undefined' && 
           'performance' in window && 
           'memory' in (window.performance as any)
  }

  /**
   * 現在のメモリ使用量取得
   */
  getCurrentMemoryUsage(): {
    used: number
    total: number
    limit: number
  } | null {
    if (!this.isMemoryApiSupported()) return null

    const memory = (window.performance as any).memory
    return {
      used: memory.usedJSHeapSize,
      total: memory.totalJSHeapSize,
      limit: memory.jsHeapSizeLimit,
    }
  }

  /**
   * メモリ使用率取得
   */
  getMemoryUsagePercentage(): number | null {
    const usage = this.getCurrentMemoryUsage()
    if (!usage) return null

    return (usage.used / usage.limit) * 100
  }

  /**
   * メモリ監視開始
   */
  startMonitoring(interval: number = 30000): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval)
    }

    this.monitorInterval = setInterval(() => {
      this.checkMemoryUsage()
    }, interval)
  }

  /**
   * メモリ監視停止
   */
  stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval)
      this.monitorInterval = undefined
    }
  }

  /**
   * メモリ使用量チェック
   */
  private checkMemoryUsage(): void {
    const usage = this.getCurrentMemoryUsage()
    if (!usage) return

    if (usage.used >= this.thresholds.critical) {
      this.triggerCallbacks('critical')
    } else if (usage.used >= this.thresholds.warning) {
      this.triggerCallbacks('warning')
    }
  }

  /**
   * メモリ閾値設定
   */
  setThresholds(warning: number, critical: number): void {
    this.thresholds = { warning, critical }
  }

  /**
   * コールバック登録
   */
  onMemoryThreshold(
    level: 'warning' | 'critical',
    callback: () => void
  ): () => void {
    this.callbacks[level].push(callback)
    
    // 登録解除関数を返す
    return () => {
      const index = this.callbacks[level].indexOf(callback)
      if (index > -1) {
        this.callbacks[level].splice(index, 1)
      }
    }
  }

  /**
   * コールバック実行
   */
  private triggerCallbacks(level: 'warning' | 'critical'): void {
    this.callbacks[level].forEach(callback => {
      try {
        callback()
      } catch (error) {
        console.error(`Memory ${level} callback error:`, error)
      }
    })
  }

  /**
   * メモリクリーンアップ推奨
   */
  recommendCleanup(): {
    clearCaches: () => void
    clearUnusedComponents: () => void
    runGarbageCollection: () => void
  } {
    return {
      clearCaches: () => {
        // React Query キャッシュクリア
        if (typeof window !== 'undefined' && (window as any).queryClient) {
          (window as any).queryClient.clear()
        }
        
        // 動的インポートキャッシュクリア
        dynamicImportManager.clearCache()
      },
      
      clearUnusedComponents: () => {
        // 未使用コンポーネントの強制アンマウント推奨
        console.warn('Consider unmounting unused components to free memory')
      },
      
      runGarbageCollection: () => {
        // 開発環境でのGC実行
        if (process.env.NODE_ENV === 'development' && (window as any).gc) {
          (window as any).gc()
        }
      },
    }
  }
}

export const memoryMonitor = new MemoryMonitor()

/**
 * Intersection Observer による遅延読み込み
 */
export class LazyLoader {
  private observer?: IntersectionObserver
  private elements: Map<Element, () => void> = new Map()

  constructor() {
    if (typeof window !== 'undefined' && 'IntersectionObserver' in window) {
      this.observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const callback = this.elements.get(entry.target)
              if (callback) {
                callback()
                this.unobserve(entry.target)
              }
            }
          })
        },
        {
          rootMargin: '50px', // 50px手前で読み込み開始
          threshold: 0.1,
        }
      )
    }
  }

  /**
   * 要素の監視開始
   */
  observe(element: Element, callback: () => void): void {
    if (!this.observer) {
      // IntersectionObserverが利用できない場合は即座に実行
      callback()
      return
    }

    this.elements.set(element, callback)
    this.observer.observe(element)
  }

  /**
   * 要素の監視停止
   */
  unobserve(element: Element): void {
    if (this.observer) {
      this.observer.unobserve(element)
    }
    this.elements.delete(element)
  }

  /**
   * 全監視停止
   */
  disconnect(): void {
    if (this.observer) {
      this.observer.disconnect()
    }
    this.elements.clear()
  }
}

export const lazyLoader = new LazyLoader()

/**
 * リソース優先度ヒント
 */
export function addResourceHint(
  href: string,
  rel: 'preload' | 'prefetch' | 'preconnect' | 'dns-prefetch',
  as?: string,
  crossorigin?: boolean
): void {
  if (typeof document === 'undefined') return

  // 既存のヒントがないかチェック
  const existingHint = document.querySelector(`link[href="${href}"][rel="${rel}"]`)
  if (existingHint) return

  const link = document.createElement('link')
  link.rel = rel
  link.href = href
  
  if (as) link.as = as
  if (crossorigin) link.crossOrigin = 'anonymous'

  document.head.appendChild(link)
}

/**
 * Reactフック：遅延読み込み
 */
export function useLazyLoad(callback: () => void): (element: Element | null) => void {
  const callbackRef = React.useRef(callback)
  callbackRef.current = callback

  return React.useCallback((element: Element | null) => {
    if (element) {
      lazyLoader.observe(element, () => callbackRef.current())
    }
  }, [])
}

/**
 * Reactフック：メモリ監視
 */
export function useMemoryMonitor(
  onWarning?: () => void,
  onCritical?: () => void
): {
  usage: number | null
  isHigh: boolean
  isCritical: boolean
} {
  const [usage, setUsage] = React.useState<number | null>(null)

  React.useEffect(() => {
    let unsubscribeWarning: (() => void) | undefined
    let unsubscribeCritical: (() => void) | undefined

    if (onWarning) {
      unsubscribeWarning = memoryMonitor.onMemoryThreshold('warning', onWarning)
    }

    if (onCritical) {
      unsubscribeCritical = memoryMonitor.onMemoryThreshold('critical', onCritical)
    }

    // 定期的にメモリ使用量を更新
    const interval = setInterval(() => {
      setUsage(memoryMonitor.getMemoryUsagePercentage())
    }, 5000)

    return () => {
      if (unsubscribeWarning) unsubscribeWarning()
      if (unsubscribeCritical) unsubscribeCritical()
      clearInterval(interval)
    }
  }, [onWarning, onCritical])

  return {
    usage,
    isHigh: usage !== null && usage > 60,
    isCritical: usage !== null && usage > 80,
  }
}

/**
 * バンドルサイズ分析ユーティリティ
 */
export function analyzeBundleSize(): {
  totalSize: number
  chunkSizes: Record<string, number>
  recommendations: string[]
} {
  const recommendations: string[] = []
  
  // パフォーマンスエントリからリソースサイズを取得
  const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
  const jsResources = resources.filter(r => r.name.includes('.js'))
  
  const chunkSizes: Record<string, number> = {}
  let totalSize = 0

  jsResources.forEach(resource => {
    const size = resource.transferSize || resource.encodedBodySize || 0
    const name = resource.name.split('/').pop() || 'unknown'
    chunkSizes[name] = size
    totalSize += size
  })

  // 推奨事項生成
  if (totalSize > 1024 * 1024) { // 1MB以上
    recommendations.push('Consider code splitting to reduce initial bundle size')
  }

  const largeChunks = Object.entries(chunkSizes)
    .filter(([, size]) => size > 500 * 1024) // 500KB以上
    .map(([name]) => name)

  if (largeChunks.length > 0) {
    recommendations.push(`Large chunks detected: ${largeChunks.join(', ')}`)
  }

  return {
    totalSize,
    chunkSizes,
    recommendations,
  }
}