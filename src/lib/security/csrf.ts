/**
 * CSRF (Cross-Site Request Forgery) 保護実装
 * 
 * 機能要件：
 * - CSRF トークン生成・検証
 * - Double Submit Cookie パターン
 * - SameSite Cookie 設定
 * - Origin/Referer 検証
 * - 状態管理とトークンローテーション
 */

import { NextRequest } from 'next/server'
import crypto from 'crypto'

/**
 * CSRF トークン設定
 */
const CSRF_CONFIG = {
  tokenLength: 32,
  cookieName: '__Host-csrf-token',
  headerName: 'X-CSRF-Token',
  formFieldName: '_csrf',
  cookieMaxAge: 60 * 60 * 1000, // 1時間
  secretKey: process.env.CSRF_SECRET_KEY || 'default-csrf-secret-key',
} as const

/**
 * CSRF トークン管理クラス
 */
class CSRFTokenManager {
  private tokenStore: Map<string, {
    token: string
    timestamp: number
    used: boolean
  }> = new Map()

  private cleanupInterval?: NodeJS.Timeout

  constructor() {
    // 定期的に期限切れトークンをクリーンアップ
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredTokens()
    }, 10 * 60 * 1000) // 10分間隔
  }

  /**
   * CSRF トークン生成
   */
  generateToken(sessionId?: string): {
    token: string
    hashedToken: string
  } {
    const token = crypto.randomBytes(CSRF_CONFIG.tokenLength).toString('hex')
    const timestamp = Date.now()
    
    // セッションIDと組み合わせてハッシュ生成
    const combined = `${token}:${sessionId || 'anonymous'}:${timestamp}`
    const hashedToken = crypto
      .createHmac('sha256', CSRF_CONFIG.secretKey)
      .update(combined)
      .digest('hex')

    // トークンをストアに保存
    this.tokenStore.set(hashedToken, {
      token,
      timestamp,
      used: false,
    })

    return { token, hashedToken }
  }

  /**
   * CSRF トークン検証
   */
  validateToken(
    token: string, 
    hashedToken: string, 
    sessionId?: string
  ): boolean {
    const storedData = this.tokenStore.get(hashedToken)
    if (!storedData) {
      return false
    }

    // 期限チェック
    if (Date.now() - storedData.timestamp > CSRF_CONFIG.cookieMaxAge) {
      this.tokenStore.delete(hashedToken)
      return false
    }

    // 使用済みチェック（One-time use）
    if (storedData.used) {
      return false
    }

    // トークンが一致するかチェック
    if (storedData.token !== token) {
      return false
    }

    // ハッシュの再生成と検証
    const combined = `${token}:${sessionId || 'anonymous'}:${storedData.timestamp}`
    const expectedHash = crypto
      .createHmac('sha256', CSRF_CONFIG.secretKey)
      .update(combined)
      .digest('hex')

    if (hashedToken !== expectedHash) {
      return false
    }

    // 使用済みマーク（One-time use の場合）
    // storedData.used = true

    return true
  }

  /**
   * 期限切れトークンのクリーンアップ
   */
  private cleanupExpiredTokens(): void {
    const now = Date.now()
    const expiredKeys: string[] = []

    for (const [key, data] of this.tokenStore.entries()) {
      if (now - data.timestamp > CSRF_CONFIG.cookieMaxAge) {
        expiredKeys.push(key)
      }
    }

    expiredKeys.forEach(key => {
      this.tokenStore.delete(key)
    })
  }

  /**
   * トークンストア破棄
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    this.tokenStore.clear()
  }
}

// グローバルトークンマネージャー
const csrfTokenManager = new CSRFTokenManager()

/**
 * CSRF トークン生成
 */
export function generateCSRFToken(sessionId?: string): {
  token: string
  cookie: {
    name: string
    value: string
    options: {
      httpOnly: boolean
      secure: boolean
      sameSite: 'strict' | 'lax' | 'none'
      maxAge: number
      path: string
    }
  }
} {
  const { token, hashedToken } = csrfTokenManager.generateToken(sessionId)

  return {
    token,
    cookie: {
      name: CSRF_CONFIG.cookieName,
      value: hashedToken,
      options: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: CSRF_CONFIG.cookieMaxAge,
        path: '/',
      },
    },
  }
}

/**
 * CSRF トークン検証
 */
export async function validateCSRFToken(request: NextRequest): Promise<boolean> {
  try {
    // GET/HEAD リクエストはスキップ
    if (request.method === 'GET' || request.method === 'HEAD') {
      return true
    }

    // Origin/Referer チェック
    if (!validateOrigin(request)) {
      return false
    }

    // Cookie から ハッシュトークン取得
    const hashedToken = request.cookies.get(CSRF_CONFIG.cookieName)?.value
    if (!hashedToken) {
      return false
    }

    // リクエストからトークン取得
    const token = await extractCSRFToken(request)
    if (!token) {
      return false
    }

    // セッションID取得（NextAuthから）
    const sessionToken = request.cookies.get('next-auth.session-token')?.value ||
                         request.cookies.get('__Secure-next-auth.session-token')?.value
    
    // トークン検証
    return csrfTokenManager.validateToken(token, hashedToken, sessionToken)

  } catch (error) {
    console.error('CSRF validation error:', error)
    return false
  }
}

/**
 * Origin/Referer 検証
 */
function validateOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  const host = request.headers.get('host')

  if (!host) {
    return false
  }

  // 許可されたオリジン
  const allowedOrigins = [
    `https://${host}`,
    `http://${host}`, // 開発環境用
    process.env.NEXTAUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ].filter(Boolean)

  // Origin ヘッダーチェック
  if (origin) {
    return allowedOrigins.includes(origin)
  }

  // Referer ヘッダーチェック（Origin がない場合）
  if (referer) {
    try {
      const refererUrl = new URL(referer)
      const refererOrigin = `${refererUrl.protocol}//${refererUrl.host}`
      return allowedOrigins.includes(refererOrigin)
    } catch {
      return false
    }
  }

  return false
}

/**
 * リクエストから CSRF トークン抽出
 */
async function extractCSRFToken(request: NextRequest): Promise<string | null> {
  // ヘッダーから取得
  const headerToken = request.headers.get(CSRF_CONFIG.headerName)
  if (headerToken) {
    return headerToken
  }

  // フォームデータから取得
  if (request.headers.get('content-type')?.includes('application/x-www-form-urlencoded')) {
    try {
      const formData = await request.formData()
      const formToken = formData.get(CSRF_CONFIG.formFieldName)
      if (typeof formToken === 'string') {
        return formToken
      }
    } catch {
      // フォームデータ解析失敗
    }
  }

  // JSON ペイロードから取得
  if (request.headers.get('content-type')?.includes('application/json')) {
    try {
      const body = await request.json()
      if (body && typeof body[CSRF_CONFIG.formFieldName] === 'string') {
        return body[CSRF_CONFIG.formFieldName]
      }
    } catch {
      // JSON解析失敗
    }
  }

  return null
}

/**
 * CSRF保護付きフォーム生成ユーティリティ
 */
export function createCSRFForm(sessionId?: string): {
  token: string
  hiddenInput: string
  headers: Record<string, string>
} {
  const { token } = generateCSRFToken(sessionId)

  return {
    token,
    hiddenInput: `<input type="hidden" name="${CSRF_CONFIG.formFieldName}" value="${token}">`,
    headers: {
      [CSRF_CONFIG.headerName]: token,
    },
  }
}

/**
 * CSRF トークンリフレッシュ
 */
export function refreshCSRFToken(sessionId?: string): {
  token: string
  cookie: {
    name: string
    value: string
    options: any
  }
} {
  return generateCSRFToken(sessionId)
}

/**
 * Double Submit Cookie 実装
 */
export class DoubleSubmitCSRF {
  /**
   * Cookie値とフォーム値の一致チェック
   */
  static validate(cookieValue: string, submittedValue: string): boolean {
    if (!cookieValue || !submittedValue) {
      return false
    }

    // 定数時間比較でタイミング攻撃を防ぐ
    return crypto.timingSafeEqual(
      Buffer.from(cookieValue, 'hex'),
      Buffer.from(submittedValue, 'hex')
    )
  }

  /**
   * シンプルなCSRFトークン生成（Double Submit用）
   */
  static generateSimpleToken(): string {
    return crypto.randomBytes(16).toString('hex')
  }
}

/**
 * SameSite Cookie 設定
 */
export const CSRF_COOKIE_OPTIONS = {
  development: {
    httpOnly: true,
    secure: false,
    sameSite: 'lax' as const,
    path: '/',
  },
  production: {
    httpOnly: true,
    secure: true,
    sameSite: 'strict' as const,
    path: '/',
  },
} as const

/**
 * CSRF 攻撃検出とログ
 */
export function logCSRFAttempt(
  request: NextRequest,
  reason: string,
  details?: Record<string, any>
): void {
  const logData = {
    timestamp: new Date().toISOString(),
    ip: request.headers.get('x-forwarded-for') || 
        request.headers.get('x-real-ip') || 
        'unknown',
    userAgent: request.headers.get('user-agent') || 'unknown',
    url: request.url,
    method: request.method,
    origin: request.headers.get('origin'),
    referer: request.headers.get('referer'),
    reason,
    details,
  }

  // セキュリティログに記録
  console.warn('CSRF attack detected:', JSON.stringify(logData, null, 2))

  // 本番環境では外部セキュリティ監視システムに送信
  if (process.env.NODE_ENV === 'production') {
    // await sendSecurityAlert('csrf-attack', logData)
  }
}

/**
 * React フック：CSRF トークン管理
 */
export function useCSRFToken() {
  if (typeof window === 'undefined') {
    return { token: null, refreshToken: () => {} }
  }

  const [token, setToken] = React.useState<string | null>(null)

  const refreshToken = React.useCallback(async () => {
    try {
      const response = await fetch('/api/v1/csrf/token', {
        method: 'GET',
        credentials: 'same-origin',
      })
      
      if (response.ok) {
        const data = await response.json()
        setToken(data.token)
      }
    } catch (error) {
      console.error('Failed to refresh CSRF token:', error)
    }
  }, [])

  React.useEffect(() => {
    refreshToken()
  }, [refreshToken])

  return { token, refreshToken }
}

// React import（動的インポートとして）
let React: typeof import('react')
if (typeof window !== 'undefined') {
  React = require('react')
}

// クリーンアップ処理
process.on('SIGTERM', () => {
  csrfTokenManager.destroy()
})

process.on('SIGINT', () => {
  csrfTokenManager.destroy()
})