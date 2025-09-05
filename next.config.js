/**
 * Next.js設定ファイル - 本番最適化対応
 * 
 * 機能要件：
 * - バンドルサイズ最適化
 * - 画像最適化設定
 * - セキュリティヘッダー設定
 * - キャッシュ戦略設定
 * - PWA対応準備
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 出力設定
  output: 'standalone',
  
  // 本番環境での実験的機能
  experimental: {
    // App Router安定化
    appDir: true,
    
    // サーバーコンポーネント最適化
    serverComponentsExternalPackages: [],
    
    // 動的インポート最適化
    optimizePackageImports: [
      '@heroicons/react',
      'date-fns',
      'zod',
    ],
    
    // メモリ使用量最適化
    optimizeServerReact: true,
    
    // TypeScript最適化
    typedRoutes: true,
  },

  // コンパイル最適化
  compiler: {
    // 未使用コードの除去
    removeConsole: process.env.NODE_ENV === 'production',
    
    // React最適化
    reactRemoveProperties: process.env.NODE_ENV === 'production',
  },

  // バンドル最適化
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // プロダクションビルド最適化
    if (!dev && !isServer) {
      // バンドルサイズ分析
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            // React関連ライブラリを別チャンクに
            react: {
              name: 'react',
              chunks: 'all',
              test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
              priority: 20,
            },
            // UI関連ライブラリを別チャンクに
            ui: {
              name: 'ui',
              chunks: 'all',
              test: /[\\/]node_modules[\\/](@heroicons|@headlessui)[\\/]/,
              priority: 15,
            },
            // ユーティリティライブラリを別チャンクに
            utils: {
              name: 'utils',
              chunks: 'all',
              test: /[\\/]node_modules[\\/](date-fns|zod|clsx)[\\/]/,
              priority: 10,
            },
            // その他のベンダーライブラリ
            vendor: {
              name: 'vendor',
              chunks: 'all',
              test: /[\\/]node_modules[\\/]/,
              priority: 5,
            },
          },
        },
      }
    }

    // 開発環境での高速リロード
    if (dev) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
      }
    }

    return config
  },

  // 画像最適化
  images: {
    // 外部画像ドメインの許可
    domains: [],
    
    // 画像フォーマット最適化
    formats: ['image/webp', 'image/avif'],
    
    // 画像サイズ最適化
    deviceSizes: [640, 768, 1024, 1280, 1600],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    
    // 画像品質設定
    quality: 85,
    
    // 遅延読み込み
    loader: 'default',
    
    // セキュリティ設定
    dangerouslyAllowSVG: false,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },

  // セキュリティヘッダー
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // XSS保護
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          // MIME タイプスニッフィング防止
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          // Referrer Policy
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          // Permission Policy
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
      // API Routes専用ヘッダー
      {
        source: '/api/(.*)',
        headers: [
          // CSRF保護
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          // キャッシュ無効化（機密データ）
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate',
          },
          // HSTS (本番環境のみ)
          ...(process.env.NODE_ENV === 'production' ? [
            {
              key: 'Strict-Transport-Security',
              value: 'max-age=31536000; includeSubDomains; preload',
            },
          ] : []),
        ],
      },
      // 静的アセット用キャッシュヘッダー
      {
        source: '/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
  },

  // リダイレクト設定
  async redirects() {
    return [
      // ルートページからダッシュボードへ
      {
        source: '/',
        destination: '/dashboard',
        permanent: false,
      },
    ]
  },

  // リライト設定（API プロキシ等）
  async rewrites() {
    return []
  },

  // 国際化設定（将来対応）
  i18n: {
    locales: ['ja', 'en'],
    defaultLocale: 'ja',
    localeDetection: true,
  },

  // 環境変数設定
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version || '1.0.0',
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },

  // PoweredBy ヘッダーを無効化
  poweredByHeader: false,

  // TypeScript設定
  typescript: {
    // 型チェックを厳密化
    ignoreBuildErrors: false,
  },

  // ESLint設定
  eslint: {
    // ビルド時のLintを有効化
    ignoreDuringBuilds: false,
  },

  // SWC最適化
  swcMinify: true,
  
  // gzip圧縮有効化
  compress: true,

  // 本番環境でのソースマップ生成
  productionBrowserSourceMaps: process.env.NODE_ENV !== 'production',

  // トレーシング設定
  tracing: {
    includeCredentials: false,
  },
}

// セキュリティ追加設定（本番環境）
if (process.env.NODE_ENV === 'production') {
  // Content Security Policy
  nextConfig.headers = async () => [
    ...(await nextConfig.headers()),
    {
      source: '/(.*)',
      headers: [
        {
          key: 'Content-Security-Policy',
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // Next.jsで必要
            "style-src 'self' 'unsafe-inline'", // Tailwind CSSで必要
            "img-src 'self' data: blob:",
            "font-src 'self'",
            "connect-src 'self'",
            "frame-src 'none'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
            "upgrade-insecure-requests",
          ].join('; '),
        },
      ],
    },
  ]
}

module.exports = nextConfig