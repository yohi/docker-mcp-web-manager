import createMiddleware from 'next-intl/middleware';
import { locales, defaultLocale } from './i18n';

export default createMiddleware({
  // 対応言語のリスト
  locales,
  
  // デフォルト言語
  defaultLocale,
  
  // URL戦略: パスプレフィックスを使用（/ja/, /en/）
  localePrefix: 'as-needed',
  
  // デフォルト言語の場合はプレフィックスを省略
  localeDetection: true,
});

export const config = {
  // API routes, _next/static, _next/image, favicon.ico を除外
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)']
};