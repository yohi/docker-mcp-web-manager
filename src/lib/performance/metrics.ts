/**
 * パフォーマンスメトリクス収集ユーティリティ
 * 
 * 機能要件：
 * - Web Vitals収集
 * - カスタムメトリクス監視
 * - リソース使用量監視
 * - パフォーマンス分析
 * - エラー追跡
 */

import { getCLS, getFID, getFCP, getLCP, getTTFB, Metric } from 'web-vitals'

/**
 * メトリクスデータ型定義
 */
export interface PerformanceMetric {
  name: string
  value: number
  timestamp: number
  url: string
  userAgent: string
  id?: string
  rating?: 'good' | 'needs-improvement' | 'poor'
  delta?: number
  navigationType?: string
  metadata?: Record<string, any>
}

export interface ResourceMetric {
  name: string
  type: string
  size: number
  duration: number
  timestamp: number
}

export interface ApiMetric {
  endpoint: string
  method: string
  status: number
  duration: number
  timestamp: number
  size?: number
}

/**
 * メトリクス収集クラス
 */
class PerformanceMetrics {
  private metrics: PerformanceMetric[] = []
  private isEnabled: boolean = true
  private batchSize: number = 10
  private flushInterval: number = 30000 // 30秒
  private flushTimer?: NodeJS.Timeout

  constructor() {
    if (typeof window !== 'undefined') {
      this.initializeWebVitals()
      this.initializeCustomMetrics()
      this.setupAutoFlush()
    }
  }

  /**
   * Web Vitals初期化
   */
  private initializeWebVitals(): void {
    // Largest Contentful Paint (LCP)
    getLCP((metric) => this.recordWebVital(metric))
    
    // First Input Delay (FID)
    getFID((metric) => this.recordWebVital(metric))
    
    // Cumulative Layout Shift (CLS)
    getCLS((metric) => this.recordWebVital(metric))
    
    // First Contentful Paint (FCP)
    getFCP((metric) => this.recordWebVital(metric))
    
    // Time to First Byte (TTFB)
    getTTFB((metric) => this.recordWebVital(metric))
  }

  /**
   * カスタムメトリクス初期化
   */
  private initializeCustomMetrics(): void {
    // Navigation Timing API
    if ('performance' in window && 'getEntriesByType' in performance) {
      this.collectNavigationMetrics()
      this.collectResourceMetrics()
    }

    // Memory使用量監視
    if ('memory' in performance) {
      this.collectMemoryMetrics()
    }

    // Connection情報
    this.collectConnectionMetrics()
  }

  /**
   * Web Vitalメトリクス記録
   */
  private recordWebVital(metric: Metric): void {
    const performanceMetric: PerformanceMetric = {
      name: metric.name,
      value: metric.value,
      timestamp: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      id: metric.id,
      rating: metric.rating,
      delta: metric.delta,
      navigationType: metric.navigationType,
    }

    this.addMetric(performanceMetric)
  }

  /**
   * ナビゲーションメトリクス収集
   */
  private collectNavigationMetrics(): void {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
    
    if (navigation) {
      const metrics = {
        'dns-lookup': navigation.domainLookupEnd - navigation.domainLookupStart,
        'tcp-connection': navigation.connectEnd - navigation.connectStart,
        'tls-handshake': navigation.connectEnd - navigation.secureConnectionStart,
        'request-response': navigation.responseEnd - navigation.requestStart,
        'dom-parse': navigation.domContentLoadedEventStart - navigation.responseEnd,
        'dom-ready': navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
        'page-load': navigation.loadEventEnd - navigation.loadEventStart,
        'full-load': navigation.loadEventEnd - navigation.navigationStart,
      }

      Object.entries(metrics).forEach(([name, value]) => {
        if (value > 0) {
          this.addMetric({
            name: `navigation-${name}`,
            value,
            timestamp: Date.now(),
            url: window.location.href,
            userAgent: navigator.userAgent,
          })
        }
      })
    }
  }

  /**
   * リソースメトリクス収集
   */
  private collectResourceMetrics(): void {
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    
    resources.forEach((resource) => {
      this.addMetric({
        name: 'resource-load',
        value: resource.duration,
        timestamp: Date.now(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        metadata: {
          resourceUrl: resource.name,
          resourceType: resource.initiatorType,
          transferSize: resource.transferSize,
          encodedBodySize: resource.encodedBodySize,
          decodedBodySize: resource.decodedBodySize,
        },
      })
    })
  }

  /**
   * メモリメトリクス収集
   */
  private collectMemoryMetrics(): void {
    const memory = (performance as any).memory
    
    if (memory) {
      ['usedJSHeapSize', 'totalJSHeapSize', 'jsHeapSizeLimit'].forEach((prop) => {
        this.addMetric({
          name: `memory-${prop.toLowerCase()}`,
          value: memory[prop],
          timestamp: Date.now(),
          url: window.location.href,
          userAgent: navigator.userAgent,
        })
      })
    }
  }

  /**
   * 接続メトリクス収集
   */
  private collectConnectionMetrics(): void {
    const connection = (navigator as any).connection
    
    if (connection) {
      this.addMetric({
        name: 'connection-info',
        value: 0, // 情報系メトリクス
        timestamp: Date.now(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        metadata: {
          effectiveType: connection.effectiveType,
          downlink: connection.downlink,
          rtt: connection.rtt,
          saveData: connection.saveData,
        },
      })
    }
  }

  /**
   * APIパフォーマンス測定
   */
  public measureApiCall<T>(
    endpoint: string,
    method: string,
    apiCall: () => Promise<T>
  ): Promise<T> {
    const startTime = performance.now()
    
    return apiCall()
      .then((result) => {
        const duration = performance.now() - startTime
        
        this.addMetric({
          name: 'api-call',
          value: duration,
          timestamp: Date.now(),
          url: window.location.href,
          userAgent: navigator.userAgent,
          metadata: {
            endpoint,
            method,
            status: 'success',
          },
        })
        
        return result
      })
      .catch((error) => {
        const duration = performance.now() - startTime
        
        this.addMetric({
          name: 'api-call',
          value: duration,
          timestamp: Date.now(),
          url: window.location.href,
          userAgent: navigator.userAgent,
          metadata: {
            endpoint,
            method,
            status: 'error',
            error: error.message,
          },
        })
        
        throw error
      })
  }

  /**
   * カスタムメトリクス記録
   */
  public recordCustomMetric(
    name: string, 
    value: number, 
    metadata?: Record<string, any>
  ): void {
    this.addMetric({
      name,
      value,
      timestamp: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      metadata,
    })
  }

  /**
   * パフォーマンスマーク作成
   */
  public mark(name: string): void {
    if ('performance' in window && 'mark' in performance) {
      performance.mark(name)
    }
  }

  /**
   * パフォーマンス測定
   */
  public measure(name: string, startMark: string, endMark?: string): number | null {
    if ('performance' in window && 'measure' in performance) {
      try {
        const endMarkName = endMark || `${startMark}-end`
        if (endMark) {
          performance.mark(endMarkName)
        }
        
        performance.measure(name, startMark, endMarkName)
        
        const measures = performance.getEntriesByName(name, 'measure')
        const measure = measures[measures.length - 1]
        
        if (measure) {
          this.recordCustomMetric(name, measure.duration)
          return measure.duration
        }
      } catch (error) {
        console.warn('Performance measure failed:', error)
      }
    }
    
    return null
  }

  /**
   * コンポーネントレンダリング時間測定
   */
  public measureComponentRender(componentName: string): {
    start: () => void
    end: () => void
  } {
    const startMark = `${componentName}-render-start`
    const endMark = `${componentName}-render-end`
    
    return {
      start: () => this.mark(startMark),
      end: () => {
        this.mark(endMark)
        this.measure(`${componentName}-render`, startMark, endMark)
      },
    }
  }

  /**
   * メトリクス追加
   */
  private addMetric(metric: PerformanceMetric): void {
    if (!this.isEnabled) return

    this.metrics.push(metric)

    // バッチサイズに達したら即座にフラッシュ
    if (this.metrics.length >= this.batchSize) {
      this.flush()
    }
  }

  /**
   * 自動フラッシュ設定
   */
  private setupAutoFlush(): void {
    this.flushTimer = setInterval(() => {
      this.flush()
    }, this.flushInterval)

    // ページ離脱時にフラッシュ
    window.addEventListener('beforeunload', () => {
      this.flush(true)
    })
  }

  /**
   * メトリクスフラッシュ（送信）
   */
  public flush(isBeforeUnload: boolean = false): void {
    if (this.metrics.length === 0) return

    const metricsToSend = [...this.metrics]
    this.metrics = []

    try {
      if (isBeforeUnload && 'sendBeacon' in navigator) {
        // ページ離脱時はsendBeaconを使用
        navigator.sendBeacon(
          '/api/v1/metrics',
          JSON.stringify({ metrics: metricsToSend })
        )
      } else {
        // 通常はfetchを使用
        fetch('/api/v1/metrics', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ metrics: metricsToSend }),
        }).catch((error) => {
          console.warn('Failed to send metrics:', error)
          // 失敗したメトリクスを戻す
          this.metrics.unshift(...metricsToSend)
        })
      }
    } catch (error) {
      console.warn('Failed to send metrics:', error)
    }
  }

  /**
   * メトリクス収集の有効/無効切り替え
   */
  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled
    
    if (!enabled && this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = undefined
    } else if (enabled && !this.flushTimer) {
      this.setupAutoFlush()
    }
  }

  /**
   * メトリクスクリア
   */
  public clear(): void {
    this.metrics = []
  }

  /**
   * 現在のメトリクス取得
   */
  public getMetrics(): PerformanceMetric[] {
    return [...this.metrics]
  }
}

// シングルトンインスタンス
export const performanceMetrics = new PerformanceMetrics()

/**
 * Reactフック：パフォーマンス測定
 */
export function usePerformanceMeasure(componentName: string) {
  React.useEffect(() => {
    const { start, end } = performanceMetrics.measureComponentRender(componentName)
    start()
    
    return () => {
      end()
    }
  }, [componentName])
}

/**
 * Reactフック：API呼び出し測定
 */
export function useMeasuredApiCall() {
  return React.useCallback(
    <T>(endpoint: string, method: string, apiCall: () => Promise<T>) => {
      return performanceMetrics.measureApiCall(endpoint, method, apiCall)
    },
    []
  )
}

/**
 * エラー境界でのパフォーマンス追跡
 */
export function trackErrorBoundaryPerformance(
  error: Error,
  errorInfo: React.ErrorInfo,
  componentStack: string
) {
  performanceMetrics.recordCustomMetric('error-boundary-triggered', 1, {
    error: error.message,
    stack: error.stack,
    componentStack,
    errorInfo: errorInfo.componentStack,
  })
}

// React import（動的インポートとして）
let React: typeof import('react')
if (typeof window !== 'undefined') {
  React = require('react')
}