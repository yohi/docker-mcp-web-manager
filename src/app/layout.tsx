/**
 * ルートレイアウト
 * 
 * 機能要件：
 * - グローバルスタイルの適用
 * - 認証プロバイダーの設定
 * - メタデータの設定
 * - フォント設定
 */

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { SessionProvider } from 'next-auth/react';
import './globals.css';

/**
 * フォント設定
 */
const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

/**
 * メタデータ
 */
export const metadata: Metadata = {
  title: {
    default: 'Docker MCP Web Manager',
    template: '%s | Docker MCP Web Manager',
  },
  description: 'Model Context Protocol を活用した Docker コンテナの統合管理Webアプリケーション',
  keywords: ['Docker', 'Container', 'Management', 'MCP', 'Model Context Protocol', 'Web Manager'],
  authors: [{ name: 'Docker MCP Team' }],
  creator: 'Docker MCP Team',
  publisher: 'Docker MCP Web Manager',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000'),
  openGraph: {
    type: 'website',
    locale: 'ja_JP',
    url: '/',
    title: 'Docker MCP Web Manager',
    description: 'Model Context Protocol を活用した Docker コンテナの統合管理Webアプリケーション',
    siteName: 'Docker MCP Web Manager',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Docker MCP Web Manager',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Docker MCP Web Manager',
    description: 'Model Context Protocol を活用した Docker コンテナの統合管理Webアプリケーション',
    images: ['/og-image.png'],
  },
  robots: {
    index: process.env.NODE_ENV === 'production',
    follow: process.env.NODE_ENV === 'production',
    googleBot: {
      index: process.env.NODE_ENV === 'production',
      follow: process.env.NODE_ENV === 'production',
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    // Google Search Console の確認コードをここに設定
    // google: 'your-verification-code',
  },
  alternates: {
    canonical: '/',
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png' },
    ],
    other: [
      {
        rel: 'mask-icon',
        url: '/safari-pinned-tab.svg',
        color: '#2563eb',
      },
    ],
  },
  manifest: '/site.webmanifest',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#1f2937' },
  ],
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
  },
  category: 'technology',
};

/**
 * ルートレイアウトコンポーネント
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html 
      lang="ja" 
      className={`${inter.variable} scroll-smooth`}
      suppressHydrationWarning
    >
      <head>
        {/* 追加のメタタグ */}
        <meta name="theme-color" content="#2563eb" />
        <meta name="msapplication-TileColor" content="#2563eb" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Docker MCP Manager" />
        
        {/* セキュリティ関連 */}
        <meta 
          httpEquiv="Content-Security-Policy" 
          content="default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:; frame-src 'none';"
        />
        <meta httpEquiv="X-Content-Type-Options" content="nosniff" />
        <meta httpEquiv="X-Frame-Options" content="DENY" />
        <meta httpEquiv="X-XSS-Protection" content="1; mode=block" />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        
        {/* プリロード */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        
        {/* DNS Prefetch */}
        <link rel="dns-prefetch" href="//fonts.googleapis.com" />
        <link rel="dns-prefetch" href="//fonts.gstatic.com" />
      </head>
      <body 
        className={`${inter.className} font-sans antialiased bg-gray-50 text-gray-900`}
        suppressHydrationWarning
      >
        {/* スキップリンク */}
        <a 
          href="#main-content" 
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 bg-blue-600 text-white px-4 py-2 rounded-md font-medium"
        >
          メインコンテンツへスキップ
        </a>

        {/* Next-Auth Session Provider */}
        <SessionProvider
          // セッションの自動更新間隔（秒）
          refetchInterval={5 * 60} // 5分
          // ウィンドウがフォーカスされた時の自動更新
          refetchOnWindowFocus={true}
          // セッションの有効期限が近い場合の自動更新
          refetchWhenOffline={false}
        >
          {/* カスタム認証プロバイダー */}
          <AuthProvider>
            {/* メインコンテンツ */}
            <div id="main-content" className="min-h-screen">
              {children}
            </div>

            {/* 開発環境でのデバッグ情報 */}
            {process.env.NODE_ENV === 'development' && (
              <div className="fixed bottom-4 right-4 z-50">
                <div className="bg-gray-800 text-white text-xs px-3 py-2 rounded-md opacity-75">
                  <div>NODE_ENV: {process.env.NODE_ENV}</div>
                  <div>
                    Screen: 
                    <span className="sm:hidden"> XS</span>
                    <span className="hidden sm:inline md:hidden"> SM</span>
                    <span className="hidden md:inline lg:hidden"> MD</span>
                    <span className="hidden lg:inline xl:hidden"> LG</span>
                    <span className="hidden xl:inline 2xl:hidden"> XL</span>
                    <span className="hidden 2xl:inline"> 2XL</span>
                  </div>
                </div>
              </div>
            )}

            {/* グローバル通知エリア */}
            <div id="notification-portal" />

            {/* モーダルポータル */}
            <div id="modal-portal" />
          </AuthProvider>
        </SessionProvider>

        {/* Service Worker 登録スクリプト（本番環境のみ） */}
        {process.env.NODE_ENV === 'production' && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                if ('serviceWorker' in navigator) {
                  window.addEventListener('load', function() {
                    navigator.serviceWorker.register('/sw.js')
                      .then(function(registration) {
                        console.log('SW registered: ', registration);
                      })
                      .catch(function(registrationError) {
                        console.log('SW registration failed: ', registrationError);
                      });
                  });
                }
              `,
            }}
          />
        )}

        {/* アクセス解析（本番環境のみ） */}
        {process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_GA_ID && (
          <>
            <script
              async
              src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`}
            />
            <script
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', '${process.env.NEXT_PUBLIC_GA_ID}', {
                    page_title: document.title,
                    page_location: window.location.href,
                  });
                `,
              }}
            />
          </>
        )}
      </body>
    </html>
  );
}