/**
 * メトリクス収集API エンドポイント
 * 
 * 機能要件：
 * - アプリケーションメトリクス収集
 * - パフォーマンスデータ集約
 * - Prometheusメトリクス出力
 * - カスタムメトリクス対応
 * - リアルタイム監視データ
 */

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/monitoring/logger'
import { getRateLimitStats } from '@/lib/security/rate-limiter'
import { performance } from 'perf_hooks'

/**
 * メトリクス データ型定義
 */
interface ApplicationMetrics {
  timestamp: string
  uptime: number
  version: string
  environment: string
  
  // システムメトリクス
  system: {
    memory: {
      heap_used: number
      heap_total: number
      heap_limit: number
      external: number
      rss: number
      array_buffers: number
    }
    cpu: {
      user: number
      system: number
    }
    gc?: {
      total_collections: number
      total_time: number
      incremental_marking_time?: number
    }
  }
  
  // HTTPメトリクス
  http: {
    requests_total: number
    requests_per_second: number
    response_times: {
      p50: number
      p95: number
      p99: number
      mean: number
    }
    status_codes: Record<string, number>
    errors_total: number
  }
  
  // アプリケーションメトリクス
  application: {
    active_connections: number
    database_connections?: number
    cache_hit_rate?: number
    queue_size?: number
  }
  
  // セキュリティメトリクス
  security: {
    rate_limit_violations: number
    csrf_attacks: number
    bot_detections: number
    failed_authentications: number
  }
  
  // カスタムメトリクス
  custom?: Record<string, number | string>
}

/**
 * メトリクス収集器クラス
 */
class MetricsCollector {
  private httpMetrics = {
    requestCount: 0,
    errorCount: 0,
    responseTimes: [] as number[],
    statusCodes: {} as Record<string, number>,
    startTime: Date.now(),
  }
  
  private securityMetrics = {
    rateLimitViolations: 0,
    csrfAttacks: 0,
    botDetections: 0,
    failedAuthentications: 0,
  }
  
  private customMetrics: Record<string, number | string> = {}

  /**
   * HTTPリクエストメトリクス記録
   */
  recordHttpRequest(statusCode: number, responseTime: number, isError = false): void {
    this.httpMetrics.requestCount++
    this.httpMetrics.responseTimes.push(responseTime)
    
    if (isError) {
      this.httpMetrics.errorCount++
    }
    
    const statusKey = Math.floor(statusCode / 100) + 'xx'
    this.httpMetrics.statusCodes[statusKey] = (this.httpMetrics.statusCodes[statusKey] || 0) + 1
    
    // 直近1000件に制限
    if (this.httpMetrics.responseTimes.length > 1000) {
      this.httpMetrics.responseTimes = this.httpMetrics.responseTimes.slice(-1000)
    }
  }

  /**
   * セキュリティメトリクス記録
   */
  recordSecurityEvent(event: 'rate_limit' | 'csrf' | 'bot' | 'auth_failure'): void {
    switch (event) {
      case 'rate_limit':
        this.securityMetrics.rateLimitViolations++
        break
      case 'csrf':
        this.securityMetrics.csrfAttacks++
        break
      case 'bot':
        this.securityMetrics.botDetections++
        break
      case 'auth_failure':
        this.securityMetrics.failedAuthentications++
        break
    }
  }

  /**
   * カスタムメトリクス設定
   */
  setCustomMetric(name: string, value: number | string): void {
    this.customMetrics[name] = value
  }

  /**
   * カスタムメトリクス増加
   */
  incrementCustomMetric(name: string, value: number = 1): void {
    const current = this.customMetrics[name] as number || 0
    this.customMetrics[name] = current + value
  }

  /**
   * レスポンス時間統計計算
   */
  private calculateResponseTimeStats(): {
    p50: number
    p95: number
    p99: number
    mean: number
  } {
    const times = [...this.httpMetrics.responseTimes].sort((a, b) => a - b)
    const length = times.length
    
    if (length === 0) {
      return { p50: 0, p95: 0, p99: 0, mean: 0 }
    }
    
    const p50Index = Math.floor(length * 0.5)
    const p95Index = Math.floor(length * 0.95)
    const p99Index = Math.floor(length * 0.99)
    
    return {
      p50: times[p50Index] || 0,
      p95: times[p95Index] || 0,
      p99: times[p99Index] || 0,
      mean: times.reduce((sum, time) => sum + time, 0) / length,
    }
  }

  /**
   * GCメトリクス取得
   */
  private getGCMetrics(): ApplicationMetrics['system']['gc'] | undefined {
    if (typeof performance.measureUserAgentSpecificMemory === 'function') {
      // V8 GC情報（利用可能な場合）
      try {
        const v8 = require('v8')
        const gcStats = v8.getHeapStatistics()
        
        return {
          total_collections: gcStats.number_of_native_contexts || 0,
          total_time: gcStats.total_gc_time || 0,
        }
      } catch {
        // V8統計が利用できない場合は省略
      }
    }
    return undefined
  }

  /**
   * 全メトリクス収集
   */
  async collectMetrics(): Promise<ApplicationMetrics> {
    const memoryUsage = process.memoryUsage()
    const cpuUsage = process.cpuUsage()
    const uptime = process.uptime()
    const rateLimitStats = getRateLimitStats()
    
    // HTTP メトリクス計算
    const timeSinceStart = (Date.now() - this.httpMetrics.startTime) / 1000
    const requestsPerSecond = timeSinceStart > 0 ? this.httpMetrics.requestCount / timeSinceStart : 0
    
    return {
      timestamp: new Date().toISOString(),
      uptime,
      version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      
      system: {
        memory: {
          heap_used: memoryUsage.heapUsed,
          heap_total: memoryUsage.heapTotal,
          heap_limit: memoryUsage.heapUsed, // 近似値
          external: memoryUsage.external,
          rss: memoryUsage.rss,
          array_buffers: memoryUsage.arrayBuffers,
        },
        cpu: {
          user: cpuUsage.user / 1000, // マイクロ秒からミリ秒に変換
          system: cpuUsage.system / 1000,
        },
        gc: this.getGCMetrics(),
      },
      
      http: {
        requests_total: this.httpMetrics.requestCount,
        requests_per_second: requestsPerSecond,
        response_times: this.calculateResponseTimeStats(),
        status_codes: this.httpMetrics.statusCodes,
        errors_total: this.httpMetrics.errorCount,
      },
      
      application: {
        active_connections: rateLimitStats.activeConnections,
        database_connections: this.customMetrics.database_connections as number,
        cache_hit_rate: this.customMetrics.cache_hit_rate as number,
        queue_size: this.customMetrics.queue_size as number,
      },
      
      security: {
        rate_limit_violations: this.securityMetrics.rateLimitViolations,
        csrf_attacks: this.securityMetrics.csrfAttacks,
        bot_detections: this.securityMetrics.botDetections,
        failed_authentications: this.securityMetrics.failedAuthentications,
      },
      
      custom: this.customMetrics,
    }
  }

  /**
   * Prometheusフォーマット出力
   */
  async generatePrometheusMetrics(): Promise<string> {
    const metrics = await this.collectMetrics()
    const lines: string[] = []
    
    // ヘルプとタイプ定義
    const addMetric = (name: string, help: string, type: string, value: number, labels?: Record<string, string>) => {
      lines.push(`# HELP ${name} ${help}`)
      lines.push(`# TYPE ${name} ${type}`)
      
      const labelStr = labels 
        ? '{' + Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',') + '}'
        : ''
      
      lines.push(`${name}${labelStr} ${value}`)
    }
    
    // システムメトリクス
    addMetric('nodejs_heap_size_used_bytes', 'Process heap space size used', 'gauge', metrics.system.memory.heap_used)
    addMetric('nodejs_heap_size_total_bytes', 'Process heap space size total', 'gauge', metrics.system.memory.heap_total)
    addMetric('nodejs_external_memory_bytes', 'External memory usage', 'gauge', metrics.system.memory.external)
    addMetric('nodejs_rss_bytes', 'Resident memory size', 'gauge', metrics.system.memory.rss)
    
    // HTTPメトリクス
    addMetric('http_requests_total', 'Total number of HTTP requests', 'counter', metrics.http.requests_total)
    addMetric('http_request_errors_total', 'Total number of HTTP request errors', 'counter', metrics.http.errors_total)
    addMetric('http_request_duration_seconds', 'HTTP request duration in seconds', 'histogram', metrics.http.response_times.mean / 1000)
    
    // ステータスコード別
    for (const [status, count] of Object.entries(metrics.http.status_codes)) {
      addMetric('http_requests_total', 'HTTP requests by status code', 'counter', count, { code: status })
    }
    
    // セキュリティメトリクス
    addMetric('security_rate_limit_violations_total', 'Total rate limit violations', 'counter', metrics.security.rate_limit_violations)
    addMetric('security_csrf_attacks_total', 'Total CSRF attacks detected', 'counter', metrics.security.csrf_attacks)
    addMetric('security_bot_detections_total', 'Total bot detections', 'counter', metrics.security.bot_detections)
    addMetric('security_auth_failures_total', 'Total authentication failures', 'counter', metrics.security.failed_authentications)
    
    // アプリケーションメトリクス
    if (metrics.application.active_connections) {
      addMetric('app_active_connections', 'Number of active connections', 'gauge', metrics.application.active_connections)
    }
    
    // カスタムメトリクス
    if (metrics.custom) {
      for (const [name, value] of Object.entries(metrics.custom)) {
        if (typeof value === 'number') {
          addMetric(`app_custom_${name}`, `Custom metric: ${name}`, 'gauge', value)
        }
      }
    }
    
    return lines.join('\n') + '\n'
  }

  /**
   * メトリクスリセット
   */
  resetMetrics(): void {
    this.httpMetrics = {
      requestCount: 0,
      errorCount: 0,
      responseTimes: [],
      statusCodes: {},
      startTime: Date.now(),
    }
    
    this.securityMetrics = {
      rateLimitViolations: 0,
      csrfAttacks: 0,
      botDetections: 0,
      failedAuthentications: 0,
    }
    
    this.customMetrics = {}
  }
}

// グローバルメトリクスコレクター
const metricsCollector = new MetricsCollector()

// メトリクス収集器をエクスポート（他のファイルから使用）
export { metricsCollector }

/**
 * GET /api/v1/metrics
 * JSONフォーマットでメトリクス取得
 */
export async function GET(request: NextRequest) {
  const startTime = performance.now()
  
  try {
    const format = request.nextUrl.searchParams.get('format') || 'json'
    
    if (format === 'prometheus') {
      // Prometheusフォーマット
      const prometheusMetrics = await metricsCollector.generatePrometheusMetrics()
      
      return new NextResponse(prometheusMetrics, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      })
    } else {
      // JSONフォーマット（デフォルト）
      const metrics = await metricsCollector.collectMetrics()
      
      const duration = performance.now() - startTime
      
      await logger.debug('Metrics collected', {
        format,
        duration,
        requests_total: metrics.http.requests_total,
      })
      
      return NextResponse.json(metrics, {
        status: 200,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      })
    }
    
  } catch (error) {
    const duration = performance.now() - startTime
    
    await logger.error('Metrics collection failed', error as Error, {
      duration,
    })
    
    return NextResponse.json({
      error: 'Failed to collect metrics',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, { 
      status: 500,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  }
}

/**
 * POST /api/v1/metrics
 * カスタムメトリクス送信
 */
export async function POST(request: NextRequest) {
  const startTime = performance.now()
  
  try {
    const body = await request.json()
    
    // 送信されたメトリクスを記録
    if (Array.isArray(body.metrics)) {
      body.metrics.forEach((metric: any) => {
        if (metric.name && typeof metric.value === 'number') {
          metricsCollector.setCustomMetric(metric.name, metric.value)
        }
      })
    }
    
    // 個別メトリクス設定
    if (body.http_request) {
      metricsCollector.recordHttpRequest(
        body.http_request.status_code,
        body.http_request.response_time,
        body.http_request.is_error
      )
    }
    
    if (body.security_event) {
      metricsCollector.recordSecurityEvent(body.security_event.type)
    }
    
    const duration = performance.now() - startTime
    
    await logger.debug('Custom metrics recorded', {
      metrics_count: Array.isArray(body.metrics) ? body.metrics.length : 0,
      duration,
    })
    
    return NextResponse.json({
      status: 'success',
      message: 'Metrics recorded',
      timestamp: new Date().toISOString(),
    })
    
  } catch (error) {
    const duration = performance.now() - startTime
    
    await logger.error('Custom metrics recording failed', error as Error, {
      duration,
    })
    
    return NextResponse.json({
      error: 'Failed to record metrics',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, { status: 400 })
  }
}

/**
 * DELETE /api/v1/metrics
 * メトリクスリセット
 */
export async function DELETE(request: NextRequest) {
  try {
    metricsCollector.resetMetrics()
    
    await logger.info('Metrics reset', {
      ip: request.headers.get('x-forwarded-for') || 'unknown',
    })
    
    return NextResponse.json({
      status: 'success',
      message: 'Metrics reset',
      timestamp: new Date().toISOString(),
    })
    
  } catch (error) {
    await logger.error('Metrics reset failed', error as Error)
    
    return NextResponse.json({
      error: 'Failed to reset metrics',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, { status: 500 })
  }
}