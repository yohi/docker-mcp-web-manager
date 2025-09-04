import { auth } from '../auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js Middleware for authentication and authorization
 * すべてのルートで認証状態をチェック
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth?.user;

  // 認証が不要なパブリックルート
  const publicRoutes = [
    '/',
    '/auth/signin',
    '/auth/error',
    '/auth/signup',
    '/api/health',
  ];

  // API認証ルート
  const authApiRoutes = [
    '/api/auth',
  ];

  // 保護されたルート（認証が必要）
  const protectedRoutes = [
    '/dashboard',
    '/servers',
    '/catalog',
    '/settings',
  ];

  // 保護されたAPIルート（認証が必要）
  const protectedApiRoutes = [
    '/api/v1',
  ];

  // 管理者限定ルート
  const adminRoutes = [
    '/admin',
    '/settings/users',
  ];

  // 管理者限定APIルート
  const adminApiRoutes = [
    '/api/v1/admin',
    '/api/v1/users',
  ];

  // 認証APIルートは通常通り処理
  if (authApiRoutes.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // パブリックルートは通常通り処理
  if (publicRoutes.includes(pathname) || pathname === '/') {
    // ログイン済みユーザーがログインページにアクセスした場合はダッシュボードにリダイレクト
    if (isLoggedIn && pathname === '/auth/signin') {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
    return NextResponse.next();
  }

  // 未認証ユーザーの保護されたルートへのアクセス
  if (!isLoggedIn) {
    if (protectedRoutes.some(route => pathname.startsWith(route))) {
      return NextResponse.redirect(new URL('/auth/signin', req.url));
    }
    
    if (protectedApiRoutes.some(route => pathname.startsWith(route))) {
      return new NextResponse(
        JSON.stringify({
          error: {
            code: 'AUTH_401',
            message: 'Authentication required',
            timestamp: new Date().toISOString(),
          },
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }
  }

  // 認証済みユーザーの場合
  if (isLoggedIn) {
    const user = req.auth!.user;
    
    // 非アクティブユーザーのチェック
    if (user.isActive === false) {
      if (protectedRoutes.some(route => pathname.startsWith(route))) {
        return NextResponse.redirect(new URL('/auth/signin?error=account_deactivated', req.url));
      }
      
      if (protectedApiRoutes.some(route => pathname.startsWith(route))) {
        return new NextResponse(
          JSON.stringify({
            error: {
              code: 'AUTH_403',
              message: 'Account is deactivated',
              timestamp: new Date().toISOString(),
            },
          }),
          {
            status: 403,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      }
    }

    // 管理者権限が必要なルートのチェック
    const isAdmin = user.role === 'admin';
    
    if (!isAdmin) {
      if (adminRoutes.some(route => pathname.startsWith(route))) {
        return NextResponse.redirect(new URL('/dashboard?error=insufficient_permissions', req.url));
      }
      
      if (adminApiRoutes.some(route => pathname.startsWith(route))) {
        return new NextResponse(
          JSON.stringify({
            error: {
              code: 'AUTH_403',
              message: 'Admin privileges required',
              timestamp: new Date().toISOString(),
            },
          }),
          {
            status: 403,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      }
    }
  }

  return NextResponse.next();
});

// Middleware設定
export const config = {
  matcher: [
    /*
     * すべてのルートにマッチ、ただし以下を除く:
     * - _next/static (静的ファイル)
     * - _next/image (画像最適化ファイル)
     * - favicon.ico (ファビコン)
     * - 静的ファイル（.png, .jpg, .svg, .ico, .css, .js）
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js)$).*)',
  ],
};