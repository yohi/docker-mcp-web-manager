/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Next.js 15.5.2 で利用可能な実験的機能
    turbo: {
      rules: {
        '*.svg': {
          loaders: ['@svgr/webpack'],
          as: '*.js',
        },
      },
    },
  },
  // セキュリティヘッダー設定
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
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
  // Webpackカスタマイズ
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // カスタムWebpack設定があればここに追加
    return config;
  },
};

module.exports = nextConfig;