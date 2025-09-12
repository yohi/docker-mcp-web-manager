import { NextRequest, NextResponse } from 'next/server';

/**
 * 認証チェック用ミドルウェア
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  console.log('[MAIN_MIDDLEWARE] Processing request for:', pathname);
  console.log('[MAIN_MIDDLEWARE] Request URL:', request.url);
  
  // 認証スキップ環境変数をチェック
  const skipAuth = process.env.SKIP_AUTH === 'true';
  console.log('[MAIN_MIDDLEWARE] SKIP_AUTH setting:', skipAuth);
  
  if (skipAuth) {
    console.log('[MAIN_MIDDLEWARE] Authentication skipped due to SKIP_AUTH=true');
    return NextResponse.next();
  }

  // 認証が不要なパス
  const publicPaths = [
    '/auth',
    '/api/auth',
    '/api/health',
    '/_next',
    '/favicon.ico'
  ];

  // 認証不要パスかチェック
  const isPublicPath = publicPaths.some(path => 
    pathname.startsWith(path)
  );

  console.log('[MAIN_MIDDLEWARE] Is public path?', isPublicPath);

  if (isPublicPath) {
    console.log('[MAIN_MIDDLEWARE] Public path, allowing access');
    return NextResponse.next();
  }

  // ルートパス（/）の特別な処理
  if (pathname === '/') {
    console.log('[MAIN_MIDDLEWARE] Root path access, redirecting to signin');
    const signInUrl = new URL('/auth/signin', request.url);
    return NextResponse.redirect(signInUrl);
  }

  // セッションCookieをチェック
  console.log('[MAIN_MIDDLEWARE] Checking session cookie...');
  
  // NextAuth.jsのセッションCookieをチェック
  const sessionCookie = request.cookies.get('next-auth.session-token') || 
                       request.cookies.get('__Secure-next-auth.session-token');
  
  console.log('[MAIN_MIDDLEWARE] Session cookie present:', !!sessionCookie);
  console.log('[MAIN_MIDDLEWARE] Cookie names:', Array.from(request.cookies.getAll().map(c => c.name)));
  
  if (!sessionCookie) {
    console.log('[MAIN_MIDDLEWARE] No session cookie found, redirecting to signin');
    // 未認証の場合はサインインページにリダイレクト
    const signInUrl = new URL('/auth/signin', request.url);
    signInUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(signInUrl);
  }

  // セッションCookieがある場合は次に進む
  console.log('[MAIN_MIDDLEWARE] Session cookie found, allowing access');
  return NextResponse.next();
}

export const config = {
  // より明確なパスマッチング
  matcher: [
    /*
     * Match all request paths except for:
     * - api/auth routes (NextAuth.js)
     * - api/health (health check)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    '/((?!api/auth|api/health|_next/static|_next/image|favicon.ico).*)',
  ]
};