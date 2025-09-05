/**
 * 構造化ログシステム
 * 
 * 機能要件：
 * - 構造化ログ出力
 * - ログレベル管理
 * - 複数出力先対応
 * - セキュリティログ
 * - パフォーマンスログ
 * - エラー追跡
 */

import { NextRequest } from 'next/server'
import crypto from 'crypto'

/**
 * ログレベル定義
 */
export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  FATAL = 5,
}

/**
 * ログエントリ構造
 */
export interface LogEntry {
  timestamp: string
  level: string
  message: string
  component?: string
  module?: string
  userId?: string
  sessionId?: string
  requestId?: string
  traceId?: string
  ip?: string
  userAgent?: string
  url?: string
  method?: string
  statusCode?: number
  duration?: number
  error?: {
    name: string
    message: string
    stack?: string
    code?: string
  }
  metadata?: Record<string, any>
  tags?: string[]
  environment: string
  version: string
  processId: number
}

/**
 * ログ出力先インターface
 */
interface LogTransport {
  write(entry: LogEntry): Promise<void> | void
  flush?(): Promise<void> | void
}

/**
 * コンソール出力
 */
class ConsoleTransport implements LogTransport {
  private colors = {
    TRACE: '\x1b[37m', // white
    DEBUG: '\x1b[36m', // cyan
    INFO: '\x1b[32m',  // green
    WARN: '\x1b[33m',  // yellow
    ERROR: '\x1b[31m', // red
    FATAL: '\x1b[35m', // magenta
    RESET: '\x1b[0m',
  }

  write(entry: LogEntry): void {
    const color = this.colors[entry.level as keyof typeof this.colors] || this.colors.INFO
    const reset = this.colors.RESET

    if (process.env.NODE_ENV === 'production') {
      // 本番環境では構造化JSON出力
      console.log(JSON.stringify(entry))
    } else {
      // 開発環境では読みやすい形式
      const timestamp = new Date(entry.timestamp).toLocaleTimeString()
      const component = entry.component ? `[${entry.component}]` : ''
      const message = `${color}${entry.level}${reset} ${timestamp} ${component} ${entry.message}`
      
      console.log(message)
      
      if (entry.error) {
        console.error(entry.error.stack || entry.error.message)
      }
      
      if (entry.metadata && Object.keys(entry.metadata).length > 0) {
        console.log('Metadata:', entry.metadata)
      }
    }
  }
}

/**
 * ファイル出力
 */
class FileTransport implements LogTransport {
  private writeStream?: NodeJS.WritableStream
  private buffer: LogEntry[] = []
  private flushInterval?: NodeJS.Timeout

  constructor(private filename: string, private maxBufferSize: number = 100) {
    this.initializeStream()
    this.setupAutoFlush()
  }

  private initializeStream(): void {
    if (typeof window === 'undefined' && process.env.NODE_ENV === 'production') {
      try {
        const fs = require('fs')
        const path = require('path')
        
        // ログディレクトリを作成
        const logDir = path.dirname(this.filename)
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true })
        }

        this.writeStream = fs.createWriteStream(this.filename, { flags: 'a' })
      } catch (error) {
        console.error('Failed to initialize file transport:', error)
      }
    }
  }

  private setupAutoFlush(): void {
    this.flushInterval = setInterval(() => {
      this.flush()
    }, 5000) // 5秒間隔でフラッシュ
  }

  write(entry: LogEntry): void {
    this.buffer.push(entry)

    if (this.buffer.length >= this.maxBufferSize) {
      this.flush()
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0 || !this.writeStream) {
      return
    }

    const entries = [...this.buffer]
    this.buffer = []

    try {
      for (const entry of entries) {
        const line = JSON.stringify(entry) + '\n'
        this.writeStream.write(line)
      }
    } catch (error) {
      console.error('Failed to write to log file:', error)
      // バッファに戻す
      this.buffer.unshift(...entries)
    }
  }

  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
    }
    this.flush()
    if (this.writeStream) {
      this.writeStream.end()
    }
  }
}

/**
 * 外部ログサービス出力（例：Elasticsearch、Datadog等）
 */
class ExternalTransport implements LogTransport {
  private buffer: LogEntry[] = []
  private flushInterval?: NodeJS.Timeout

  constructor(
    private endpoint: string,
    private apiKey?: string,
    private maxBufferSize: number = 50
  ) {
    this.setupAutoFlush()
  }

  private setupAutoFlush(): void {
    this.flushInterval = setInterval(() => {
      this.flush()
    }, 10000) // 10秒間隔でフラッシュ
  }

  write(entry: LogEntry): void {
    this.buffer.push(entry)

    if (this.buffer.length >= this.maxBufferSize) {
      this.flush()
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return
    }

    const entries = [...this.buffer]
    this.buffer = []

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`
      }

      await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ logs: entries }),
      })
    } catch (error) {
      console.error('Failed to send logs to external service:', error)
      // バッファに戻す
      this.buffer.unshift(...entries)
    }
  }

  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
    }
    this.flush()
  }
}

/**
 * メインロガークラス
 */
class Logger {
  private transports: LogTransport[] = []
  private currentLevel: LogLevel = LogLevel.INFO
  private context: Partial<LogEntry> = {}

  constructor() {
    this.setupDefaultTransports()
    this.setupProcessHandlers()
  }

  /**
   * デフォルト出力先設定
   */
  private setupDefaultTransports(): void {
    // コンソール出力
    this.addTransport(new ConsoleTransport())

    // 本番環境でのファイル出力
    if (process.env.NODE_ENV === 'production' && typeof window === 'undefined') {
      this.addTransport(new FileTransport('/app/logs/application.log'))
      
      // エラーログ専用ファイル
      this.addTransport(new FileTransport('/app/logs/errors.log'))
    }

    // 外部ログサービス（設定されている場合）
    if (process.env.LOG_ENDPOINT) {
      this.addTransport(new ExternalTransport(
        process.env.LOG_ENDPOINT,
        process.env.LOG_API_KEY
      ))
    }
  }

  /**
   * プロセス終了時の処理
   */
  private setupProcessHandlers(): void {
    if (typeof process !== 'undefined') {
      process.on('exit', () => this.flush())
      process.on('SIGTERM', () => this.flush())
      process.on('SIGINT', () => this.flush())
    }
  }

  /**
   * ログレベル設定
   */
  setLevel(level: LogLevel): void {
    this.currentLevel = level
  }

  /**
   * 出力先追加
   */
  addTransport(transport: LogTransport): void {
    this.transports.push(transport)
  }

  /**
   * コンテキスト設定
   */
  setContext(context: Partial<LogEntry>): void {
    this.context = { ...this.context, ...context }
  }

  /**
   * コンテキストクリア
   */
  clearContext(): void {
    this.context = {}
  }

  /**
   * ログエントリ作成
   */
  private createEntry(
    level: LogLevel,
    message: string,
    metadata?: Record<string, any>,
    error?: Error
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel[level],
      message,
      environment: process.env.NODE_ENV || 'development',
      version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
      processId: typeof process !== 'undefined' ? process.pid : 0,
      ...this.context,
    }

    if (metadata) {
      entry.metadata = metadata
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
      }
    }

    return entry
  }

  /**
   * ログ出力
   */
  private async log(
    level: LogLevel,
    message: string,
    metadata?: Record<string, any>,
    error?: Error
  ): Promise<void> {
    if (level < this.currentLevel) {
      return
    }

    const entry = this.createEntry(level, message, metadata, error)

    // 各出力先に書き込み
    const promises = this.transports.map(transport => {
      try {
        return transport.write(entry)
      } catch (error) {
        console.error('Transport error:', error)
      }
    })

    await Promise.all(promises.filter(Boolean))
  }

  // レベル別メソッド
  trace(message: string, metadata?: Record<string, any>): Promise<void> {
    return this.log(LogLevel.TRACE, message, metadata)
  }

  debug(message: string, metadata?: Record<string, any>): Promise<void> {
    return this.log(LogLevel.DEBUG, message, metadata)
  }

  info(message: string, metadata?: Record<string, any>): Promise<void> {
    return this.log(LogLevel.INFO, message, metadata)
  }

  warn(message: string, metadata?: Record<string, any>): Promise<void> {
    return this.log(LogLevel.WARN, message, metadata)
  }

  error(message: string, error?: Error, metadata?: Record<string, any>): Promise<void> {
    return this.log(LogLevel.ERROR, message, metadata, error)
  }

  fatal(message: string, error?: Error, metadata?: Record<string, any>): Promise<void> {
    return this.log(LogLevel.FATAL, message, metadata, error)
  }

  /**
   * HTTP リクエストログ
   */
  async httpRequest(
    request: NextRequest,
    response?: { status: number },
    duration?: number
  ): Promise<void> {
    const entry = {
      ip: request.headers.get('x-forwarded-for') || 
          request.headers.get('x-real-ip') || 
          'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      url: request.url,
      method: request.method,
      statusCode: response?.status,
      duration,
    }

    await this.info('HTTP Request', entry)
  }

  /**
   * セキュリティイベントログ
   */
  async security(
    event: string,
    details: Record<string, any>,
    request?: NextRequest
  ): Promise<void> {
    const entry = {
      securityEvent: event,
      ...details,
    }

    if (request) {
      entry.ip = request.headers.get('x-forwarded-for') || 
                request.headers.get('x-real-ip') || 
                'unknown'
      entry.userAgent = request.headers.get('user-agent') || 'unknown'
      entry.url = request.url
      entry.method = request.method
    }

    await this.warn(`Security Event: ${event}`, entry)
  }

  /**
   * パフォーマンスログ
   */
  async performance(
    operation: string,
    duration: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    const entry = {
      operation,
      duration,
      ...metadata,
    }

    if (duration > 1000) {
      await this.warn(`Slow operation: ${operation}`, entry)
    } else {
      await this.debug(`Performance: ${operation}`, entry)
    }
  }

  /**
   * 全出力先フラッシュ
   */
  async flush(): Promise<void> {
    const promises = this.transports.map(transport => {
      if (transport.flush) {
        return transport.flush()
      }
    })

    await Promise.all(promises.filter(Boolean))
  }

  /**
   * 子ロガー作成
   */
  child(context: Partial<LogEntry>): Logger {
    const childLogger = new Logger()
    childLogger.transports = this.transports
    childLogger.currentLevel = this.currentLevel
    childLogger.context = { ...this.context, ...context }
    return childLogger
  }
}

// グローバルロガーインスタンス
export const logger = new Logger()

/**
 * リクエストロガーミドルウェア
 */
export function createRequestLogger() {
  return async (request: NextRequest) => {
    const startTime = Date.now()
    const requestId = crypto.randomUUID()
    
    // リクエスト開始ログ
    const requestLogger = logger.child({
      requestId,
      component: 'middleware',
      module: 'request-logger',
    })

    await requestLogger.httpRequest(request)

    return {
      requestLogger,
      logResponse: async (response: { status: number }) => {
        const duration = Date.now() - startTime
        await requestLogger.httpRequest(request, response, duration)
      },
    }
  }
}

/**
 * エラーロガー
 */
export async function logError(
  error: Error,
  context?: {
    component?: string
    module?: string
    userId?: string
    request?: NextRequest
  }
): Promise<void> {
  const errorLogger = logger.child({
    component: context?.component || 'unknown',
    module: context?.module || 'unknown',
    userId: context?.userId,
  })

  const metadata: Record<string, any> = {}
  
  if (context?.request) {
    metadata.ip = context.request.headers.get('x-forwarded-for') || 'unknown'
    metadata.userAgent = context.request.headers.get('user-agent') || 'unknown'
    metadata.url = context.request.url
    metadata.method = context.request.method
  }

  await errorLogger.error('Unhandled error', error, metadata)
}

/**
 * セキュリティロガー
 */
export const securityLogger = {
  authFailure: (email: string, ip: string, reason: string) =>
    logger.security('auth-failure', { email, ip, reason }),
    
  authSuccess: (userId: string, ip: string) =>
    logger.security('auth-success', { userId, ip }),
    
  rateLimitExceeded: (ip: string, endpoint: string, limit: number) =>
    logger.security('rate-limit-exceeded', { ip, endpoint, limit }),
    
  csrfAttack: (ip: string, userAgent: string, url: string) =>
    logger.security('csrf-attack', { ip, userAgent, url }),
    
  botDetected: (ip: string, userAgent: string, confidence: number) =>
    logger.security('bot-detected', { ip, userAgent, confidence }),
}

/**
 * パフォーマンスロガー
 */
export const performanceLogger = {
  apiCall: (endpoint: string, method: string, duration: number, status: number) =>
    logger.performance('api-call', duration, { endpoint, method, status }),
    
  dbQuery: (query: string, duration: number, rows?: number) =>
    logger.performance('db-query', duration, { query, rows }),
    
  externalCall: (service: string, duration: number, success: boolean) =>
    logger.performance('external-call', duration, { service, success }),
}

// 開発環境でのログレベル設定
if (process.env.NODE_ENV === 'development') {
  logger.setLevel(LogLevel.DEBUG)
} else {
  logger.setLevel(LogLevel.INFO)
}

// 環境変数でのログレベル設定
if (process.env.LOG_LEVEL) {
  const level = LogLevel[process.env.LOG_LEVEL.toUpperCase() as keyof typeof LogLevel]
  if (level !== undefined) {
    logger.setLevel(level)
  }
}