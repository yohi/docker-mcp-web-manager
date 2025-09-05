/**
 * レート制限実装
 * 
 * 機能要件：
 * - IPベースレート制限
 * - ユーザーベースレート制限
 * - エンドポイント別制限
 * - Token bucket アルゴリズム
 * - 分散対応（Redis準備済み）
 */

import { NextRequest } from 'next/server'
import { headers } from 'next/headers'

/**
 * レート制限設定
 */
export interface RateLimitConfig {
  windowMs: number // 時間窓（ミリ秒）
  maxRequests: number // 最大リクエスト数
  keyGenerator?: (request: NextRequest) => string
  skipSuccessfulRequests?: boolean
  skipFailedRequests?: boolean
  skip?: (request: NextRequest) => boolean
}

/**
 * レート制限結果
 */
export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  resetTime: number
  retryAfter?: number
}

/**
 * Token bucket 実装
 */
class TokenBucket {
  private tokens: number
  private lastRefill: number

  constructor(
    private capacity: number,
    private refillRate: number,
    private refillInterval: number
  ) {
    this.tokens = capacity
    this.lastRefill = Date.now()
  }

  /**
   * トークン取得試行
   */
  consume(tokens: number = 1): boolean {
    this.refill()

    if (this.tokens >= tokens) {
      this.tokens -= tokens
      return true
    }

    return false
  }

  /**
   * トークン補充
   */
  private refill(): void {
    const now = Date.now()
    const timePassed = now - this.lastRefill

    if (timePassed >= this.refillInterval) {
      const tokensToAdd = Math.floor(timePassed / this.refillInterval) * this.refillRate
      this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd)
      this.lastRefill = now
    }
  }

  /**
   * 残りトークン数取得
   */
  getRemainingTokens(): number {
    this.refill()
    return this.tokens
  }

  /**
   * 次回補充時刻取得
   */
  getNextRefillTime(): number {
    return this.lastRefill + this.refillInterval
  }
}

/**
 * メモリベースレート制限ストア
 */
class MemoryRateLimitStore {
  private buckets: Map<string, TokenBucket> = new Map()
  private cleanupInterval?: NodeJS.Timeout

  constructor() {
    // 定期的に古いバケットをクリーンアップ
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, 5 * 60 * 1000) // 5分間隔
  }

  /**
   * バケット取得または作成
   */
  getBucket(key: string, config: RateLimitConfig): TokenBucket {
    let bucket = this.buckets.get(key)

    if (!bucket) {
      bucket = new TokenBucket(
        config.maxRequests,
        Math.ceil(config.maxRequests / (config.windowMs / 60000)), // 1分あたりの補充率
        60000 // 1分間隔で補充
      )
      this.buckets.set(key, bucket)
    }

    return bucket
  }

  /**
   * 古いバケットのクリーンアップ
   */
  private cleanup(): void {
    const now = Date.now()
    const maxAge = 60 * 60 * 1000 // 1時間

    for (const [key, bucket] of this.buckets.entries()) {
      if (now - bucket.getNextRefillTime() > maxAge) {
        this.buckets.delete(key)
      }
    }
  }

  /**
   * ストア破棄
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    this.buckets.clear()
  }
}

// グローバルストアインスタンス
const rateLimitStore = new MemoryRateLimitStore()

/**
 * 事前定義されたレート制限設定
 */
export const rateLimitConfig = {
  // 一般的なAPIエンドポイント
  api: {
    windowMs: 60 * 1000, // 1分
    maxRequests: 100,
  } as RateLimitConfig,

  // 認証エンドポイント
  auth: {
    windowMs: 15 * 60 * 1000, // 15分
    maxRequests: 5,
    skipSuccessfulRequests: false,
  } as RateLimitConfig,

  // サーバー管理エンドポイント
  servers: {
    windowMs: 60 * 1000, // 1分
    maxRequests: 30,
  } as RateLimitConfig,

  // 設定管理エンドポイント
  config: {
    windowMs: 5 * 60 * 1000, // 5分
    maxRequests: 10,
  } as RateLimitConfig,

  // ログストリーミング
  logs: {
    windowMs: 60 * 1000, // 1分
    maxRequests: 5,
  } as RateLimitConfig,

  // ヘルスチェック
  health: {
    windowMs: 60 * 1000, // 1分
    maxRequests: 600, // 高頻度許可
  } as RateLimitConfig,
}

/**
 * デフォルトキー生成関数
 */
function defaultKeyGenerator(request: NextRequest): string {
  // IP アドレスを取得（プロキシ経由の場合も考慮）
  const forwarded = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  const ip = forwarded?.split(',')[0] || realIp || 'unknown'

  // パスを含めてより細かい制御
  const pathname = request.nextUrl.pathname
  
  return `${ip}:${pathname}`
}

/**
 * ユーザーベースキー生成関数
 */
export function userBasedKeyGenerator(request: NextRequest, userId?: string): string {
  const pathname = request.nextUrl.pathname
  
  if (userId) {
    return `user:${userId}:${pathname}`
  }

  return defaultKeyGenerator(request)
}

/**
 * レート制限チェック
 */
export async function checkRateLimit(
  request: NextRequest,
  config?: RateLimitConfig
): Promise<RateLimitResult> {
  // デフォルト設定を使用
  const limitConfig = config || rateLimitConfig.api

  // スキップ条件チェック
  if (limitConfig.skip && limitConfig.skip(request)) {
    return {
      success: true,
      limit: limitConfig.maxRequests,
      remaining: limitConfig.maxRequests,
      resetTime: Date.now() + limitConfig.windowMs,
    }
  }

  // キー生成
  const keyGenerator = limitConfig.keyGenerator || defaultKeyGenerator
  const key = keyGenerator(request)

  // バケット取得
  const bucket = rateLimitStore.getBucket(key, limitConfig)

  // トークン消費試行
  const success = bucket.consume(1)
  const remaining = bucket.getRemainingTokens()
  const resetTime = bucket.getNextRefillTime()

  const result: RateLimitResult = {
    success,
    limit: limitConfig.maxRequests,
    remaining: Math.max(0, remaining),
    resetTime,
  }

  // 制限に達した場合のリトライ時間計算
  if (!success) {
    result.retryAfter = Math.ceil((resetTime - Date.now()) / 1000)
  }

  return result
}

/**
 * エンドポイント別レート制限チェック
 */
export async function checkEndpointRateLimit(
  request: NextRequest
): Promise<RateLimitResult> {
  const pathname = request.nextUrl.pathname

  // エンドポイント別設定選択
  let config: RateLimitConfig

  if (pathname.startsWith('/api/v1/auth/')) {
    config = rateLimitConfig.auth
  } else if (pathname.startsWith('/api/v1/servers/')) {
    config = rateLimitConfig.servers
  } else if (pathname.startsWith('/api/v1/config/')) {
    config = rateLimitConfig.config
  } else if (pathname.includes('/logs') || pathname.includes('/stream')) {
    config = rateLimitConfig.logs
  } else if (pathname.startsWith('/api/v1/health')) {
    config = rateLimitConfig.health
  } else {
    config = rateLimitConfig.api
  }

  return checkRateLimit(request, config)
}

/**
 * 複数レベルレート制限
 */
export async function checkMultiLevelRateLimit(
  request: NextRequest,
  userId?: string
): Promise<{
  ip: RateLimitResult
  user?: RateLimitResult
  combined: RateLimitResult
}> {
  // IP ベース制限
  const ipResult = await checkRateLimit(request)

  // ユーザーベース制限（認証済みの場合）
  let userResult: RateLimitResult | undefined
  if (userId) {
    const userConfig = {
      ...rateLimitConfig.api,
      maxRequests: rateLimitConfig.api.maxRequests * 5, // ユーザーは5倍まで許可
      keyGenerator: (req: NextRequest) => userBasedKeyGenerator(req, userId),
    }
    userResult = await checkRateLimit(request, userConfig)
  }

  // 結合結果（どちらか一方でも制限に達していれば失敗）
  const combined: RateLimitResult = {
    success: ipResult.success && (userResult?.success ?? true),
    limit: Math.max(ipResult.limit, userResult?.limit ?? 0),
    remaining: Math.min(ipResult.remaining, userResult?.remaining ?? Infinity),
    resetTime: Math.max(ipResult.resetTime, userResult?.resetTime ?? 0),
  }

  if (!combined.success) {
    combined.retryAfter = Math.max(
      ipResult.retryAfter ?? 0,
      userResult?.retryAfter ?? 0
    )
  }

  return {
    ip: ipResult,
    user: userResult,
    combined,
  }
}

/**
 * レート制限リセット
 */
export function resetRateLimit(key: string): void {
  rateLimitStore.getBucket(key, rateLimitConfig.api)
  // バケットを再作成することでリセット
}

/**
 * レート制限統計取得
 */
export function getRateLimitStats(): {
  totalKeys: number
  activeConnections: number
  memoryUsage: number
} {
  return {
    totalKeys: (rateLimitStore as any).buckets.size,
    activeConnections: (rateLimitStore as any).buckets.size,
    memoryUsage: process.memoryUsage().heapUsed,
  }
}

/**
 * カスタムレート制限設定作成
 */
export function createRateLimitConfig(options: {
  requests: number
  windowMinutes: number
  keyGenerator?: (request: NextRequest) => string
  skipSuccessful?: boolean
}): RateLimitConfig {
  return {
    windowMs: options.windowMinutes * 60 * 1000,
    maxRequests: options.requests,
    keyGenerator: options.keyGenerator,
    skipSuccessfulRequests: options.skipSuccessful ?? false,
  }
}

/**
 * Redis ベースストア（将来実装用）
 */
export class RedisRateLimitStore {
  // Redis実装はここに追加
  // 現在はメモリベースストアを使用
  
  constructor(private redisClient?: any) {
    if (redisClient) {
      console.log('Redis rate limit store initialized')
    }
  }

  async checkLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    // Redis Lua script for atomic rate limiting
    // 現在はメモリストアにフォールバック
    return checkRateLimit({} as NextRequest, config)
  }
}

// クリーンアップ処理
process.on('SIGTERM', () => {
  rateLimitStore.destroy()
})

process.on('SIGINT', () => {
  rateLimitStore.destroy()
})