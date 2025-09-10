/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // パフォーマンス向上機能
    webpackBuildWorker: true,
    serverMinification: true,
    serverSourceMaps: false,
  },
  // セキュリティヘッダー設定（CORS、CSP含む）
  async headers() {
    const isDevelopment = process.env.NODE_ENV === 'development';
    const allowedOrigins = isDevelopment
      ? process.env.CORS_ORIGIN || 'http://localhost:3000'
      : process.env.CORS_ORIGIN || 'https://yourdomain.com';

    return [
      {
        source: '/(.*)',
        headers: [
          // セキュリティヘッダー
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          // CORS設定
          {
            key: 'Access-Control-Allow-Origin',
            value: allowedOrigins,
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'X-Requested-With, Content-Type, Authorization, X-CSRF-Token, Accept, Accept-Version, Content-Length, Content-MD5, Date, X-Api-Version',
          },
          {
            key: 'Access-Control-Max-Age',
            value: '86400',
          },
          // CSP (Content Security Policy) - 開発環境と本番環境で分離
          {
            key: 'Content-Security-Policy',
            value: isDevelopment
              ? `
                default-src 'self';
                script-src 'self' 'unsafe-eval' 'unsafe-inline' https://rsms.me;
                style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://rsms.me;
                font-src 'self' https://fonts.gstatic.com https://rsms.me;
                img-src 'self' data: https:;
                connect-src 'self' ws: wss:;
                frame-ancestors 'none';
                object-src 'none';
                base-uri 'self';
                form-action 'self';
                upgrade-insecure-requests;
              `.replace(/\s+/g, ' ').trim()
              : `
                default-src 'self';
                script-src 'self' 'nonce-{nonce}' 'strict-dynamic';
                style-src 'self' 'nonce-{nonce}' https://fonts.googleapis.com;
                font-src 'self' https://fonts.gstatic.com;
                img-src 'self' data: https:;
                connect-src 'self';
                frame-ancestors 'none';
                object-src 'none';
                base-uri 'self';
                form-action 'self';
                upgrade-insecure-requests;
              `.replace(/\s+/g, ' ').trim(),
          },
        ],
      },
      // API エンドポイント専用のセキュリティヘッダー
      {
        source: '/api/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
        ],
      },
    ];
  },
  // Docker環境での最適化
  output: 'standalone',
  generateEtags: false,
  // 開発時の設定
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
  // ビルド時の設定
  typescript: {
    // ビルド時にTypeScriptエラーを無視しない
    ignoreBuildErrors: false,
  },
  eslint: {
    // ビルド時にESLintエラーを無視しない
    ignoreDuringBuilds: false,
  },
  // 画像最適化（Docker環境対応）
  images: {
    unoptimized: process.env.NODE_ENV === 'production',
  },
  // バンドルサイズ最適化
  compress: true,
  poweredByHeader: false,

  // Turbopack設定（開発時のビルド高速化）
  turbopack: {
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },

  // Webpackカスタマイズ（バンドル最適化）
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // バンドルサイズ最適化
    if (!dev && !isServer) {
      // Tree shakingの強化
      config.optimization = {
        ...config.optimization,
        usedExports: true,
        sideEffects: false,
        // Bundle analyzerのための設定
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            // Vendor chunks（サードパーティライブラリ）
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: 'vendors',
              chunks: 'all',
              enforce: true,
              priority: 20,
            },
            // React関連の分割
            react: {
              test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
              name: 'react',
              chunks: 'all',
              enforce: true,
              priority: 30,
            },
            // UI コンポーネントライブラリの分割
            ui: {
              test: /[\\/]node_modules[\\/](@radix-ui|lucide-react|tailwind-merge|clsx)[\\/]/,
              name: 'ui',
              chunks: 'all',
              enforce: true,
              priority: 25,
            },
            // 共通コンポーネントの分割
            common: {
              name: 'common',
              minChunks: 2,
              chunks: 'all',
              enforce: true,
              priority: 10,
            },
          },
        },
      };

      // バンドルサイズの監視とアラート（現実的な制限値）
      config.performance = {
        hints: 'warning',
        maxEntrypointSize: 800000, // 800KB（Next.jsアプリに適したサイズ）
        maxAssetSize: 800000, // 800KB
      };
    }

    // SVGの最適化
    config.module.rules.push({
      test: /\.svg$/,
      use: [
        {
          loader: '@svgr/webpack',
          options: {
            svgoConfig: {
              plugins: [
                {
                  name: 'removeViewBox',
                  active: false,
                },
                {
                  name: 'removeDimensions',
                  active: true,
                },
              ],
            },
          },
        },
      ],
    });

    // Production環境でのバンドルサイズ監視
    if (!dev && process.env.ANALYZE === 'true') {
      const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
      config.plugins.push(
        new BundleAnalyzerPlugin({
          analyzerMode: 'static',
          reportFilename: './bundle-analyzer-report.html',
          openAnalyzer: false,
        })
      );
    }

    return config;
  },
};

module.exports = nextConfig;
