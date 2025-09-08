import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E テスト設定
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',
  
  /* 並列実行設定 */
  fullyParallel: true,
  
  /* CI環境での設定 */
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  
  /* レポート設定 */
  reporter: [
    ['html'],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  
  /* 共通テスト設定 */
  use: {
    /* ベースURL */
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    
    /* 失敗時のトレース収集 */
    trace: 'on-first-retry',
    
    /* スクリーンショット設定 */
    screenshot: 'only-on-failure',
    
    /* ビデオ録画設定 */
    video: 'retain-on-failure',
  },

  /* テストプロジェクト設定 */
  projects: [
    /* セットアップ */
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    
    /* デスクトップ Chrome */
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        storageState: 'tests/e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    
    /* デスクトップ Firefox */
    {
      name: 'firefox',
      use: { 
        ...devices['Desktop Firefox'],
        storageState: 'tests/e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    
    /* デスクトップ Safari (macOS のみ) */
    {
      name: 'webkit',
      use: { 
        ...devices['Desktop Safari'],
        storageState: 'tests/e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    
    /* モバイル Chrome */
    {
      name: 'mobile-chrome',
      use: { 
        ...devices['Pixel 5'],
        storageState: 'tests/e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    
    /* モバイル Safari */
    {
      name: 'mobile-safari',
      use: { 
        ...devices['iPhone 12'],
        storageState: 'tests/e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],

  /* ローカル開発サーバー設定 */
  webServer: process.env.CI ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      NODE_ENV: 'test',
      NEXTAUTH_SECRET: 'test-secret',
      DATABASE_URL: 'file:./test.db',
      ENCRYPTION_MASTER_KEY: 'test-key-base64-encoded',
    },
  },
  
  /* グローバル設定 */
  globalSetup: require.resolve('./tests/e2e/global-setup.ts'),
  globalTeardown: require.resolve('./tests/e2e/global-teardown.ts'),
  
  /* テストマッチパターン */
  testMatch: '**/*.e2e.{js,ts}',
  testIgnore: [
    '**/node_modules/**',
    '**/build/**',
    '**/dist/**',
  ],
  
  /* タイムアウト設定 */
  timeout: 30 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  
  /* その他の設定 */
  outputDir: 'test-results/',
});