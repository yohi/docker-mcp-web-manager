/**
 * Playwright E2E テスト設定
 * 
 * 機能要件：
 * - Next.js アプリケーションのE2Eテスト
 * - 複数ブラウザでのテスト実行
 * - テストレポート生成
 * - CI/CD対応
 */

import { defineConfig, devices } from '@playwright/test'

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',
  
  /* 並列実行設定 */
  fullyParallel: true,
  
  /* CI環境でのリトライ設定 */
  retries: process.env.CI ? 2 : 0,
  
  /* ワーカー数設定 */
  workers: process.env.CI ? 1 : undefined,
  
  /* レポート設定 */
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/e2e-results.json' }],
    ['junit', { outputFile: 'test-results/e2e-junit.xml' }],
    ['line'],
  ],
  
  /* 共通設定 */
  use: {
    /* ベースURL */
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    
    /* スクリーンショット設定 */
    screenshot: 'only-on-failure',
    
    /* ビデオ録画設定 */
    video: 'retain-on-failure',
    
    /* トレース設定 */
    trace: 'retain-on-failure',
    
    /* デバイス設定 */
    viewport: { width: 1280, height: 720 },
    
    /* 日本語ロケール設定 */
    locale: 'ja-JP',
    timezone: 'Asia/Tokyo',
  },
  
  /* テストプロジェクト設定 */
  projects: [
    /* セットアップ - 認証状態などの事前準備 */
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    
    /* Chromium テスト */
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    
    /* Firefox テスト */
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      dependencies: ['setup'],
    },
    
    /* Webkit テスト */
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      dependencies: ['setup'],
    },
    
    /* モバイル Chrome テスト */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
      dependencies: ['setup'],
    },
    
    /* モバイル Safari テスト */
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
      dependencies: ['setup'],
    },
  ],
  
  /* 開発サーバー設定 */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000, // 2分
  },
  
  /* テストタイムアウト設定 */
  timeout: 30 * 1000, // 30秒
  expect: {
    timeout: 10 * 1000, // 10秒
  },
  
  /* 出力ディレクトリ */
  outputDir: 'test-results/',
  
  /* グローバルセットアップ/ティアダウン */
  globalSetup: require.resolve('./tests/e2e/global-setup'),
  globalTeardown: require.resolve('./tests/e2e/global-teardown'),
})