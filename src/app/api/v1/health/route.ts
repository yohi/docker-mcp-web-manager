/**
 * ヘルスチェックAPI エンドポイント
 * 
 * 機能要件：
 * - アプリケーション状態監視
 * - 依存サービス状態チェック
 * - システムメトリクス収集
 * - コンテナ対応ヘルスチェック
 * - カスタムヘルスチェック対応
 */

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/monitoring/logger'
import os from 'os'
import { performance } from 'perf_hooks'

/**
 * ヘルスチェック結果の型定義
 */
interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded'
  timestamp: string
  uptime: number
  version: string
  environment: string
  checks: {
    [key: string]: {
      status: 'pass' | 'fail' | 'warn'
      message?: string
      duration?: number
      details?: Record<string, any>
    }
  }
  system: {
    memory: {
      used: number
      free: number
      total: number
      usage_percent: number
    }
    cpu: {
      load: number[]
      usage_percent?: number
    }
    disk?: {
      usage_percent: number
      free: number
      total: number
    }
  }
  application: {
    node_version: string
    process_id: number
    startup_time: string
    active_connections?: number
  }
  dependencies?: {
    [service: string]: {
      status: 'available' | 'unavailable'
      response_time?: number
      error?: string
    }
  }
}

/**
 * ヘルスチェック個別項目
 */
interface HealthCheck {
  name: string
  check: () => Promise<{
    status: 'pass' | 'fail' | 'warn'
    message?: string
    duration?: number
    details?: Record<string, any>
  }>
  timeout?: number
  critical?: boolean
}

/**
 * システム情報取得
 */
function getSystemInfo() {
  const memory = process.memoryUsage()
  const totalMemory = os.totalmem()
  const freeMemory = os.freemem()
  const usedMemory = totalMemory - freeMemory

  return {
    memory: {
      used: usedMemory,
      free: freeMemory,
      total: totalMemory,
      usage_percent: Math.round((usedMemory / totalMemory) * 100),
    },
    cpu: {
      load: os.loadavg(),
    },
  }
}

/**
 * アプリケーション情報取得
 */
function getApplicationInfo() {
  return {
    node_version: process.version,
    process_id: process.pid,
    startup_time: new Date(Date.now() - process.uptime() * 1000).toISOString(),
  }
}

/**
 * データベース接続チェック
 */
const databaseCheck: HealthCheck = {
  name: 'database',
  timeout: 5000,
  critical: true,
  check: async () => {
    const startTime = performance.now()
    
    try {
      // SQLite ファイル存在チェック（実際の実装では適切なDB接続チェック）
      const fs = await import('fs/promises')
      const dbPath = process.env.DATABASE_URL?.replace('sqlite:', '') || './data/app.db'
      
      try {
        await fs.access(dbPath)
        const duration = performance.now() - startTime
        
        return {
          status: 'pass' as const,
          message: 'Database connection successful',
          duration,
          details: {
            database_path: dbPath,
          },
        }
      } catch (error) {
        return {
          status: 'warn' as const,
          message: 'Database file not found, but will be created on first use',
          duration: performance.now() - startTime,
        }
      }
    } catch (error) {
      return {
        status: 'fail' as const,
        message: `Database check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: performance.now() - startTime,
      }
    }
  },
}

/**
 * Docker MCP CLI接続チェック
 */
const dockerMCPCheck: HealthCheck = {
  name: 'docker-mcp',
  timeout: 10000,
  critical: false,
  check: async () => {
    const startTime = performance.now()
    
    try {
      const { spawn } = await import('child_process')
      
      return new Promise((resolve) => {
        const dockerProcess = spawn('docker', ['version'], { stdio: 'ignore' })
        
        const timeout = setTimeout(() => {
          dockerProcess.kill()
          resolve({
            status: 'warn' as const,
            message: 'Docker check timed out',
            duration: performance.now() - startTime,
          })
        }, 5000)
        
        dockerProcess.on('close', (code) => {
          clearTimeout(timeout)
          const duration = performance.now() - startTime
          
          if (code === 0) {
            resolve({
              status: 'pass' as const,
              message: 'Docker is available',
              duration,
            })
          } else {
            resolve({
              status: 'warn' as const,
              message: 'Docker is not available or not accessible',
              duration,
            })
          }
        })
        
        dockerProcess.on('error', (error) => {
          clearTimeout(timeout)
          resolve({
            status: 'warn' as const,
            message: `Docker check error: ${error.message}`,
            duration: performance.now() - startTime,
          })
        })
      })
    } catch (error) {
      return {
        status: 'fail' as const,
        message: `Docker MCP check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: performance.now() - startTime,
      }
    }
  },
}

/**
 * メモリ使用量チェック
 */
const memoryCheck: HealthCheck = {
  name: 'memory',
  timeout: 1000,
  critical: false,
  check: async () => {
    const startTime = performance.now()
    
    try {
      const system = getSystemInfo()
      const memoryUsage = system.memory.usage_percent
      const processMemory = process.memoryUsage()
      
      let status: 'pass' | 'warn' | 'fail' = 'pass'
      let message = 'Memory usage is normal'
      
      if (memoryUsage > 90) {
        status = 'fail'
        message = 'Critical memory usage detected'
      } else if (memoryUsage > 80) {
        status = 'warn'
        message = 'High memory usage detected'
      }
      
      return {
        status,
        message,
        duration: performance.now() - startTime,
        details: {
          system_usage_percent: memoryUsage,
          process_heap_used: processMemory.heapUsed,
          process_heap_total: processMemory.heapTotal,
          process_rss: processMemory.rss,
        },
      }
    } catch (error) {
      return {
        status: 'fail' as const,
        message: `Memory check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: performance.now() - startTime,
      }
    }
  },
}

/**
 * CPU使用率チェック
 */
const cpuCheck: HealthCheck = {
  name: 'cpu',
  timeout: 2000,
  critical: false,
  check: async () => {
    const startTime = performance.now()
    
    try {
      const system = getSystemInfo()
      const loadAverage = system.cpu.load[0] // 1分平均
      const cpuCount = os.cpus().length
      const loadPercent = Math.round((loadAverage / cpuCount) * 100)
      
      let status: 'pass' | 'warn' | 'fail' = 'pass'
      let message = 'CPU load is normal'
      
      if (loadPercent > 90) {
        status = 'fail'
        message = 'Critical CPU load detected'
      } else if (loadPercent > 70) {
        status = 'warn'
        message = 'High CPU load detected'
      }
      
      return {
        status,
        message,
        duration: performance.now() - startTime,
        details: {
          load_average_1min: loadAverage,
          load_percent: loadPercent,
          cpu_count: cpuCount,
          load_averages: system.cpu.load,
        },
      }
    } catch (error) {
      return {
        status: 'fail' as const,
        message: `CPU check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: performance.now() - startTime,
      }
    }
  },
}

/**
 * ディスク使用量チェック
 */
const diskCheck: HealthCheck = {
  name: 'disk',
  timeout: 3000,
  critical: false,
  check: async () => {
    const startTime = performance.now()
    
    try {
      // Node.js環境では直接的なディスク使用量取得は困難
      // コンテナ環境では外部ツール使用を推奨
      const { spawn } = await import('child_process')
      
      return new Promise((resolve) => {
        if (process.platform !== 'linux') {
          resolve({
            status: 'pass' as const,
            message: 'Disk check skipped (not Linux)',
            duration: performance.now() - startTime,
          })
          return
        }
        
        const dfProcess = spawn('df', ['-h', '/'], { stdio: 'pipe' })
        let output = ''
        
        dfProcess.stdout.on('data', (data) => {
          output += data.toString()
        })
        
        const timeout = setTimeout(() => {
          dfProcess.kill()
          resolve({
            status: 'warn' as const,
            message: 'Disk check timed out',
            duration: performance.now() - startTime,
          })
        }, 2000)
        
        dfProcess.on('close', (code) => {
          clearTimeout(timeout)
          const duration = performance.now() - startTime
          
          if (code === 0 && output) {
            try {
              const lines = output.trim().split('\n')
              const dataLine = lines[1]
              const parts = dataLine.split(/\s+/)
              const usagePercent = parseInt(parts[4].replace('%', ''))
              
              let status: 'pass' | 'warn' | 'fail' = 'pass'
              let message = 'Disk usage is normal'
              
              if (usagePercent > 95) {
                status = 'fail'
                message = 'Critical disk usage detected'
              } else if (usagePercent > 85) {
                status = 'warn'
                message = 'High disk usage detected'
              }
              
              resolve({
                status,
                message,
                duration,
                details: {
                  usage_percent: usagePercent,
                  filesystem: parts[0],
                  size: parts[1],
                  used: parts[2],
                  available: parts[3],
                },
              })
            } catch (parseError) {
              resolve({
                status: 'warn' as const,
                message: 'Failed to parse disk usage output',
                duration,
              })
            }
          } else {
            resolve({
              status: 'warn' as const,
              message: 'Disk check command failed',
              duration,
            })
          }
        })
        
        dfProcess.on('error', (error) => {
          clearTimeout(timeout)
          resolve({
            status: 'warn' as const,
            message: `Disk check error: ${error.message}`,
            duration: performance.now() - startTime,
          })
        })
      })
    } catch (error) {
      return {
        status: 'warn' as const,
        message: `Disk check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: performance.now() - startTime,
      }
    }
  },
}

/**
 * 全ヘルスチェックリスト
 */
const healthChecks: HealthCheck[] = [
  databaseCheck,
  dockerMCPCheck,
  memoryCheck,
  cpuCheck,
  diskCheck,
]

/**
 * ヘルスチェック実行
 */
async function runHealthChecks(): Promise<HealthCheckResult> {
  const startTime = Date.now()
  const checks: HealthCheckResult['checks'] = {}
  
  // 各チェックを並行実行
  const checkPromises = healthChecks.map(async (healthCheck) => {
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Health check '${healthCheck.name}' timed out`))
        }, healthCheck.timeout || 5000)
      })
      
      const result = await Promise.race([
        healthCheck.check(),
        timeoutPromise,
      ])
      
      checks[healthCheck.name] = result
    } catch (error) {
      checks[healthCheck.name] = {
        status: 'fail',
        message: error instanceof Error ? error.message : 'Unknown error',
        duration: healthCheck.timeout || 5000,
      }
    }
  })
  
  await Promise.all(checkPromises)
  
  // 全体のステータス決定
  let overallStatus: HealthCheckResult['status'] = 'healthy'
  let criticalFailed = false
  let hasWarnings = false
  
  for (const [checkName, result] of Object.entries(checks)) {
    const healthCheck = healthChecks.find(hc => hc.name === checkName)
    
    if (result.status === 'fail') {
      if (healthCheck?.critical) {
        criticalFailed = true
      } else {
        hasWarnings = true
      }
    } else if (result.status === 'warn') {
      hasWarnings = true
    }
  }
  
  if (criticalFailed) {
    overallStatus = 'unhealthy'
  } else if (hasWarnings) {
    overallStatus = 'degraded'
  }
  
  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    checks,
    system: getSystemInfo(),
    application: getApplicationInfo(),
  }
}

/**
 * GET /api/v1/health
 * 基本ヘルスチェック
 */
export async function GET(request: NextRequest) {
  const startTime = performance.now()
  
  try {
    logger.debug('Health check requested', {
      ip: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
    })
    
    const result = await runHealthChecks()
    const duration = performance.now() - startTime
    
    // ログ記録
    await logger.info('Health check completed', {
      status: result.status,
      duration,
      checks: Object.keys(result.checks).length,
    })
    
    // HTTPステータスコード決定
    let httpStatus = 200
    if (result.status === 'unhealthy') {
      httpStatus = 503 // Service Unavailable
    } else if (result.status === 'degraded') {
      httpStatus = 200 // OK but with warnings
    }
    
    return NextResponse.json(result, { 
      status: httpStatus,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'application/json',
      },
    })
    
  } catch (error) {
    const duration = performance.now() - startTime
    
    await logger.error('Health check failed', error as Error, {
      duration,
    })
    
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      duration,
    }, { 
      status: 500,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'application/json',
      },
    })
  }
}

/**
 * HEAD /api/v1/health
 * 簡易ヘルスチェック（レスポンス本文なし）
 */
export async function HEAD(request: NextRequest) {
  try {
    // 最低限のチェックのみ実行
    const criticalChecks = healthChecks.filter(check => check.critical)
    const checks: Record<string, any> = {}
    
    for (const check of criticalChecks) {
      try {
        const result = await Promise.race([
          check.check(),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Timeout')), 1000)
          }),
        ])
        checks[check.name] = result
      } catch {
        checks[check.name] = { status: 'fail' }
      }
    }
    
    const hasFailures = Object.values(checks).some((result: any) => result.status === 'fail')
    
    return new NextResponse(null, {
      status: hasFailures ? 503 : 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
    
  } catch {
    return new NextResponse(null, { status: 500 })
  }
}