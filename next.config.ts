import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 本番環境でのストリクトモード有効化
  reactStrictMode: true,

  // パワードバイヘッダーを無効化（セキュリティ向上）
  poweredByHeader: false,

  // Docker用standalone出力
  output: 'standalone',

  // TypeScript設定
  typescript: {
    // ビルド時にTypeScriptエラーを無視しない
    ignoreBuildErrors: false,
  },

  // ESLint設定
  eslint: {
    // ビルド時にESLintエラーを無視しない
    ignoreDuringBuilds: false,
  },

  // 本番環境向け最適化
  compiler: {
    // 本番環境でのconsole.logなど削除
    removeConsole: process.env.NODE_ENV === 'production',
  },

  // Typed Routes（安定版機能）
  typedRoutes: true,

  // セキュリティヘッダー
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
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
};

export default nextConfig;
