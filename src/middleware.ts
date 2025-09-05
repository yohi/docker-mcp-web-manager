/**
 * Next.js Middleware - セキュリティとパフォーマンス最適化
 * 
 * 機能要件：
 * - レート制限実装
 * - CORS設定
 * - セキュリティヘッダー設定
 * - 認証チェック
 * - リクエスト検証
 * - Bot protection
 */

import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { rateLimitConfig, checkRateLimit } from '@/lib/security/rate-limiter'
import { validateCSRFToken } from '@/lib/security/csrf'
import { detectBot, checkSecurityHeaders } from '@/lib/security/bot-protection'

// 保護が必要なルートパターン
const PROTECTED_ROUTES = [
  '/dashboard',
  '/api/v1/servers',
  '/api/v1/config',
  '/api/v1/secrets',
] as const

// 管理者権限が必要なルートパターン
const ADMIN_ROUTES = [
  '/api/v1/servers',
  '/api/v1/config/import',
  '/api/v1/config/export',
  '/api/v1/secrets',
] as const

// レート制限適用ルート
const RATE_LIMITED_ROUTES = [
  '/api/v1/auth/signin',
  '/api/v1/servers',
  '/api/v1/config',
] as const

// CSRFトークンが必要なルート
const CSRF_PROTECTED_ROUTES = [
  '/api/v1/servers',
  '/api/v1/config',
  '/api/v1/secrets',
] as const

/**
 * メインミドルウェア関数
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next()
  const pathname = request.nextUrl.pathname

  try {
    // セキュリティヘッダーの設定
    addSecurityHeaders(response, request)

    // CORS設定
    if (request.method === 'OPTIONS') {
      return handlePreflightRequest(request)
    }

    // Bot保護
    const botCheckResult = await detectBot(request)
    if (botCheckResult.isBot && botCheckResult.shouldBlock) {
      return new NextResponse('Bot detected', { status: 403 })
    }

    // レート制限チェック
    if (shouldApplyRateLimit(pathname)) {
      const rateLimitResult = await checkRateLimit(request)
      if (!rateLimitResult.success) {
        return createRateLimitResponse(rateLimitResult)
      }
      
      // レート制限ヘッダー追加
      addRateLimitHeaders(response, rateLimitResult)
    }

    // API ルートの処理
    if (pathname.startsWith('/api/v1/')) {
      return await handleApiRequest(request, response)
    }

    // 保護されたページの認証チェック
    if (isProtectedRoute(pathname)) {
      return await handleProtectedRoute(request, response)
    }

    return response

  } catch (error) {
    console.error('Middleware error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}

/**
 * セキュリティヘッダーの設定
 */
function addSecurityHeaders(response: NextResponse, request: NextRequest): void {
  // XSS Protection
  response.headers.set('X-XSS-Protection', '1; mode=block')
  
  // MIME Type Sniffing Prevention
  response.headers.set('X-Content-Type-Options', 'nosniff')
  
  // Frame Options
  response.headers.set('X-Frame-Options', 'DENY')
  
  // Referrer Policy
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  
  // Permissions Policy
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()'
  )

  // 本番環境でのHTTPS強制
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    )
  }

  // Content Security Policy
  const cspHeader = buildCSPHeader(request)
  response.headers.set('Content-Security-Policy', cspHeader)

  // Cross-Origin Embedder Policy
  response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
  
  // Cross-Origin Opener Policy
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
}

/**
 * Content Security Policy ヘッダー構築
 */
function buildCSPHeader(request: NextRequest): string {
  const isDevelopment = process.env.NODE_ENV === 'development'
  const nonce = generateNonce()

  // 開発環境と本番環境で異なるCSP設定
  const cspDirectives = [
    "default-src 'self'",
    `script-src 'self' ${isDevelopment ? "'unsafe-eval' 'unsafe-inline'" : `'nonce-${nonce}'`}`,
    `style-src 'self' 'unsafe-inline'`, // Tailwind CSS対応
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "child-src 'none'",
    "frame-src 'none'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "upgrade-insecure-requests",
  ]

  return cspDirectives.join('; ')
}

/**
 * Nonce生成
 */
function generateNonce(): string {
  return Math.random().toString(36).substring(2, 15)
}

/**
 * CORS Preflight リクエスト処理
 */
function handlePreflightRequest(request: NextRequest): NextResponse {
  const origin = request.headers.get('origin')
  const response = new NextResponse(null, { status: 204 })

  // 許可されたオリジンの確認
  if (isAllowedOrigin(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.set('Access-Control-Allow-Credentials', 'true')
    response.headers.set(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, OPTIONS'
    )
    response.headers.set(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-CSRF-Token, X-Requested-With'
    )
    response.headers.set('Access-Control-Max-Age', '86400') // 24時間
  }

  return response
}

/**
 * 許可されたオリジンの確認
 */
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false

  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    process.env.NEXTAUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ].filter(Boolean)

  return allowedOrigins.includes(origin)
}

/**
 * API リクエスト処理
 */
async function handleApiRequest(
  request: NextRequest,
  response: NextResponse
): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname

  // CORS ヘッダー設定
  const origin = request.headers.get('origin')
  if (isAllowedOrigin(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.set('Access-Control-Allow-Credentials', 'true')
  }

  // CSRF保護
  if (shouldCheckCSRF(pathname, request.method)) {
    const csrfValid = await validateCSRFToken(request)
    if (!csrfValid) {
      return new NextResponse('CSRF token invalid', { status: 403 })
    }
  }

  // 認証チェック
  if (isProtectedApiRoute(pathname)) {
    const token = await getToken({ req: request })
    if (!token) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    // 管理者権限チェック
    if (isAdminRoute(pathname) && token.role !== 'admin') {
      return new NextResponse('Forbidden', { status: 403 })
    }
  }

  return response
}

/**
 * 保護されたルート処理
 */
async function handleProtectedRoute(
  request: NextRequest,
  response: NextResponse
): Promise<NextResponse> {
  const token = await getToken({ req: request })

  if (!token) {
    // 認証が必要なページにリダイレクト
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

/**
 * レート制限適用判定
 */
function shouldApplyRateLimit(pathname: string): boolean {
  return RATE_LIMITED_ROUTES.some(route => pathname.startsWith(route))
}

/**
 * 保護されたルート判定
 */
function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTES.some(route => pathname.startsWith(route))
}

/**
 * 保護されたAPI ルート判定
 */
function isProtectedApiRoute(pathname: string): boolean {
  // パブリック API ルート
  const publicRoutes = [
    '/api/v1/auth/signin',
    '/api/v1/auth/signout',
    '/api/v1/auth/session',
    '/api/v1/health',
  ]

  if (publicRoutes.some(route => pathname === route)) {
    return false
  }

  return pathname.startsWith('/api/v1/')
}

/**
 * 管理者ルート判定
 */
function isAdminRoute(pathname: string): boolean {
  return ADMIN_ROUTES.some(route => pathname.startsWith(route))
}

/**
 * CSRF チェック必要判定
 */
function shouldCheckCSRF(pathname: string, method: string | null): boolean {
  if (!method || method === 'GET' || method === 'HEAD') {
    return false
  }

  return CSRF_PROTECTED_ROUTES.some(route => pathname.startsWith(route))
}

/**
 * レート制限レスポンス作成
 */
function createRateLimitResponse(rateLimitResult: any): NextResponse {
  const response = new NextResponse('Too Many Requests', { status: 429 })
  
  response.headers.set('Retry-After', rateLimitResult.retryAfter?.toString() || '60')
  response.headers.set('X-RateLimit-Limit', rateLimitResult.limit?.toString() || '100')
  response.headers.set('X-RateLimit-Remaining', '0')
  response.headers.set('X-RateLimit-Reset', rateLimitResult.resetTime?.toString() || '')

  return response
}

/**
 * レート制限ヘッダー追加
 */
function addRateLimitHeaders(response: NextResponse, rateLimitResult: any): void {
  response.headers.set('X-RateLimit-Limit', rateLimitResult.limit?.toString() || '100')
  response.headers.set('X-RateLimit-Remaining', rateLimitResult.remaining?.toString() || '0')
  response.headers.set('X-RateLimit-Reset', rateLimitResult.resetTime?.toString() || '')
}

/**
 * ミドルウェア設定
 */
export const config = {
  matcher: [
    /*
     * 以下のパスを除く全てのリクエストにマッチ:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}