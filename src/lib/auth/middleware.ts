import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { SESSION_CONFIG } from './config';

// =============================================================================
// 認証ミドルウェア
// Next.js App Routerでの認証・認可制御
// =============================================================================

/**
 * 保護されたルートの定義
 */
const PROTECTED_ROUTES = [
  '/api/v1/',
  '/dashboard',
  '/servers',
  '/catalog',
  '/settings',
  '/logs',
] as const;

/**
 * 管理者専用ルートの定義
 */
const ADMIN_ONLY_ROUTES = [
  '/api/v1/config',
  '/api/v1/secrets',
  '/settings/security',
  '/settings/users',
] as const;

/**
 * 公開ルートの定義
 */
const PUBLIC_ROUTES = [
  '/api/auth',
  '/auth/signin',
  '/auth/signout',
  '/auth/error',
  '/api/health',
  '/api/status',
  '/',
] as const;

/**
 * API権限マッピング
 */
const API_PERMISSIONS: Record<string, string[]> = {
  // サーバー管理
  'GET /api/v1/servers': ['servers:read'],
  'POST /api/v1/servers': ['servers:create'],
  'PUT /api/v1/servers': ['servers:manage'],
  'DELETE /api/v1/servers': ['servers:delete'],
  'POST /api/v1/servers/[id]/start': ['servers:manage'],
  'POST /api/v1/servers/[id]/stop': ['servers:manage'],
  
  // カタログ
  'GET /api/v1/catalog': ['catalog:read'],
  'POST /api/v1/catalog/install': ['catalog:install'],
  
  // テスト
  'POST /api/v1/servers/[id]/test': ['tools:test'],
  'GET /api/v1/servers/[id]/test-history': ['tools:read'],
  
  // ログ
  'GET /api/v1/servers/[id]/logs': ['logs:read'],
  'GET /api/v1/servers/[id]/logs/download': ['logs:download'],
  
  // 設定管理
  'GET /api/v1/config': ['config:read'],
  'POST /api/v1/config/export': ['config:export'],
  'POST /api/v1/config/import': ['config:import'],
  
  // シークレット管理
  'GET /api/v1/secrets': ['secrets:read'],
  'POST /api/v1/secrets': ['secrets:create'],
  'PUT /api/v1/secrets': ['secrets:manage'],
  'DELETE /api/v1/secrets': ['secrets:delete'],
};

/**
 * レート制限の設定
 */
interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator: (req: NextRequest) => string;
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  // IP別制限（一般）
  ip: {
    windowMs: 60 * 1000, // 1分
    maxRequests: 100,
    keyGenerator: (req) => getClientIP(req),
  },
  // 認証済みユーザー別制限
  user: {
    windowMs: 60 * 1000, // 1分
    maxRequests: 1000,
    keyGenerator: (req) => req.headers.get('x-user-id') || getClientIP(req),
  },
  // 認証エンドポイント用厳格制限
  auth: {
    windowMs: 60 * 1000, // 1分
    maxRequests: 10,
    keyGenerator: (req) => getClientIP(req),
  },
};

/**
 * メモリベースのレート制限カウンター
 */
class MemoryRateLimiter {
  private counters = new Map<string, { count: number; resetTime: number }>();
  private cleanupInterval: NodeJS.Timer;

  constructor() {
    // 期限切れエントリの定期クリーンアップ（5分間隔）
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  check(key: string, limit: number, windowMs: number): { allowed: boolean; remainingRequests: number; resetTime: number } {
    const now = Date.now();
    const resetTime = now + windowMs;
    
    const existing = this.counters.get(key);
    
    if (!existing || now >= existing.resetTime) {
      // 新規または期限切れ
      this.counters.set(key, { count: 1, resetTime });
      return {
        allowed: true,
        remainingRequests: limit - 1,
        resetTime,
      };
    }
    
    if (existing.count >= limit) {
      // 制限に達している
      return {
        allowed: false,
        remainingRequests: 0,
        resetTime: existing.resetTime,
      };
    }
    
    // カウンターを増加
    existing.count += 1;
    this.counters.set(key, existing);
    
    return {
      allowed: true,
      remainingRequests: limit - existing.count,
      resetTime: existing.resetTime,
    };
  }

  private cleanup(): void {
    const now = Date.now();
    const expiredKeys = Array.from(this.counters.entries())
      .filter(([_, counter]) => now >= counter.resetTime)
      .map(([key]) => key);
      
    expiredKeys.forEach(key => this.counters.delete(key));
    
    if (expiredKeys.length > 0) {
      console.log(`[RATE_LIMIT_CLEANUP] Cleaned up ${expiredKeys.length} expired entries`);
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.counters.clear();
  }
}

// グローバルレート制限インスタンス
const rateLimiter = new MemoryRateLimiter();

/**
 * クライアントIPアドレスの取得
 */
function getClientIP(req: NextRequest): string {
  // プロキシ経由の場合のIP取得
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  
  const realIP = req.headers.get('x-real-ip');
  if (realIP) {
    return realIP.trim();
  }
  
  // Next.js環境での取得
  const ip = req.ip || req.headers.get('host') || 'unknown';
  return ip;
}

/**
 * ルートが保護されているかチェック
 */
function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTES.some(route => pathname.startsWith(route));
}

/**
 * ルートが管理者専用かチェック
 */
function isAdminOnlyRoute(pathname: string): boolean {
  return ADMIN_ONLY_ROUTES.some(route => pathname.startsWith(route));
}

/**
 * ルートが公開されているかチェック
 */
function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(route => pathname.startsWith(route));
}

/**
 * API権限の確認
 */
function getRequiredPermissions(method: string, pathname: string): string[] {
  // パターンマッチングのために動的セグメントを正規化
  const normalizedPath = pathname.replace(/\/[^\/]+\/([^\/]+)$/, '/[id]/$1');
  const key = `${method} ${normalizedPath}`;
  
  return API_PERMISSIONS[key] || [];
}

/**
 * ユーザー権限の確認
 */
function hasRequiredPermissions(userPermissions: string[], requiredPermissions: string[]): boolean {
  if (!userPermissions || userPermissions.length === 0) {
    return false;
  }
  
  // 管理者は全権限を持つ
  if (userPermissions.includes('*')) {
    return true;
  }
  
  // 必要な権限をすべて持っているかチェック
  return requiredPermissions.every(permission => 
    userPermissions.includes(permission)
  );
}

/**
 * レート制限のチェック
 */
function checkRateLimit(req: NextRequest, limitType: keyof typeof RATE_LIMITS): {
  allowed: boolean;
  remainingRequests: number;
  resetTime: number;
} {
  const config = RATE_LIMITS[limitType];
  const key = `${limitType}:${config.keyGenerator(req)}`;
  
  return rateLimiter.check(key, config.maxRequests, config.windowMs);
}

/**
 * セキュリティヘッダーの追加
 */
function addSecurityHeaders(response: NextResponse): void {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}

/**
 * セキュリティ監査ログ
 */
function logSecurityEvent(event: string, details: any): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    event: `AUTH_MIDDLEWARE_${event}`,
    ...details,
    securityLevel: 'high',
  };
  
  console.log('[AUTH_SECURITY]', JSON.stringify(logEntry));
}

/**
 * メイン認証ミドルウェア関数
 */
export async function authMiddleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  const method = req.method;
  const clientIP = getClientIP(req);

  try {
    // 公開ルートは認証不要
    if (isPublicRoute(pathname)) {
      const response = NextResponse.next();
      addSecurityHeaders(response);
      return response;
    }

    // 認証エンドポイントの厳格なレート制限
    if (pathname.startsWith('/api/auth')) {
      const rateLimit = checkRateLimit(req, 'auth');
      if (!rateLimit.allowed) {
        logSecurityEvent('RATE_LIMIT_EXCEEDED_AUTH', {
          pathname,
          clientIP,
          method,
        });
        
        return new NextResponse('Too Many Requests', {
          status: 429,
          headers: {
            'Retry-After': Math.ceil((rateLimit.resetTime - Date.now()) / 1000).toString(),
          },
        });
      }
    }

    // 保護されたルートの認証チェック
    if (isProtectedRoute(pathname)) {
      // JWTトークンの取得
      const token = await getToken({
        req,
        secret: process.env.JWT_SECRET,
      });

      if (!token) {
        logSecurityEvent('UNAUTHORIZED_ACCESS_ATTEMPT', {
          pathname,
          clientIP,
          method,
          reason: 'No valid token',
        });
        
        if (pathname.startsWith('/api/')) {
          return new NextResponse('Unauthorized', { status: 401 });
        } else {
          const url = req.nextUrl.clone();
          url.pathname = '/auth/signin';
          url.searchParams.set('callbackUrl', pathname);
          return NextResponse.redirect(url);
        }
      }

      // セッション活動タイムアウトチェック
      const now = Date.now();
      if (token.lastActivity && (now - token.lastActivity) > SESSION_CONFIG.activityTimeout) {
        logSecurityEvent('SESSION_TIMEOUT', {
          pathname,
          clientIP,
          userId: token.id,
          email: token.email,
          lastActivity: new Date(token.lastActivity).toISOString(),
        });
        
        if (pathname.startsWith('/api/')) {
          return new NextResponse('Session Expired', { status: 401 });
        } else {
          const url = req.nextUrl.clone();
          url.pathname = '/auth/signin';
          url.searchParams.set('expired', 'true');
          return NextResponse.redirect(url);
        }
      }

      // 管理者専用ルートの確認
      if (isAdminOnlyRoute(pathname) && token.role !== 'admin') {
        logSecurityEvent('FORBIDDEN_ACCESS_ATTEMPT', {
          pathname,
          clientIP,
          userId: token.id,
          email: token.email,
          userRole: token.role,
          reason: 'Admin access required',
        });
        
        return new NextResponse('Forbidden', { status: 403 });
      }

      // API権限の確認
      if (pathname.startsWith('/api/v1/')) {
        const requiredPermissions = getRequiredPermissions(method, pathname);
        
        if (requiredPermissions.length > 0) {
          const hasPermission = hasRequiredPermissions(token.permissions || [], requiredPermissions);
          
          if (!hasPermission) {
            logSecurityEvent('INSUFFICIENT_PERMISSIONS', {
              pathname,
              clientIP,
              userId: token.id,
              email: token.email,
              userPermissions: token.permissions,
              requiredPermissions,
              method,
            });
            
            return new NextResponse('Forbidden', { status: 403 });
          }
        }
      }

      // 認証済みユーザーのレート制限
      const userRateLimit = checkRateLimit(req, 'user');
      if (!userRateLimit.allowed) {
        logSecurityEvent('RATE_LIMIT_EXCEEDED_USER', {
          pathname,
          clientIP,
          userId: token.id,
          email: token.email,
          method,
        });
        
        return new NextResponse('Too Many Requests', {
          status: 429,
          headers: {
            'Retry-After': Math.ceil((userRateLimit.resetTime - Date.now()) / 1000).toString(),
          },
        });
      }

      // リクエストヘッダーにユーザー情報を追加
      const requestHeaders = new Headers(req.headers);
      requestHeaders.set('x-user-id', token.id);
      requestHeaders.set('x-user-email', token.email);
      requestHeaders.set('x-user-role', token.role);
      requestHeaders.set('x-user-permissions', JSON.stringify(token.permissions || []));
      
      const response = NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
      
      addSecurityHeaders(response);
      
      // レート制限ヘッダーの追加
      response.headers.set('X-RateLimit-Limit', userRateLimit.remainingRequests.toString());
      response.headers.set('X-RateLimit-Remaining', userRateLimit.remainingRequests.toString());
      response.headers.set('X-RateLimit-Reset', userRateLimit.resetTime.toString());
      
      return response;
    }

    // IPベースのレート制限（認証不要のルート）
    const ipRateLimit = checkRateLimit(req, 'ip');
    if (!ipRateLimit.allowed) {
      logSecurityEvent('RATE_LIMIT_EXCEEDED_IP', {
        pathname,
        clientIP,
        method,
      });
      
      return new NextResponse('Too Many Requests', {
        status: 429,
        headers: {
          'Retry-After': Math.ceil((ipRateLimit.resetTime - Date.now()) / 1000).toString(),
        },
      });
    }

    // デフォルトレスポンス
    const response = NextResponse.next();
    addSecurityHeaders(response);
    return response;

  } catch (error) {
    console.error('[AUTH_MIDDLEWARE_ERROR]', {
      pathname,
      clientIP,
      method,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

/**
 * ミドルウェア設定
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};

// プロセス終了時のクリーンアップ
process.on('SIGTERM', () => {
  rateLimiter.destroy();
});

process.on('SIGINT', () => {
  rateLimiter.destroy();
});