import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E テスト設定
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',

  /* 並列実行設定 */
  fullyParallel: true,

  /* CI環境での設定 */
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  /* レポート設定 */
  reporter: [
    ['html'],
    ['json', { outputFile: 'playwright-report/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
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

    /* アクションタイムアウト */
    actionTimeout: 10000,

    /* ナビゲーションタイムアウト */
    navigationTimeout: 30000,
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
        storageState: process.env.CI ? undefined : 'e2e/.auth/user.json',
      },
      dependencies: process.env.CI ? undefined : ['setup'],
    },

    /* デスクトップ Firefox */
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        storageState: process.env.CI ? undefined : 'e2e/.auth/user.json',
      },
      dependencies: process.env.CI ? undefined : ['setup'],
    },

    /* デスクトップ Safari */
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        storageState: process.env.CI ? undefined : 'e2e/.auth/user.json',
      },
      dependencies: process.env.CI ? undefined : ['setup'],
    },

    /* モバイル Chrome */
    {
      name: 'Mobile Chrome',
      use: {
        ...devices['Pixel 5'],
        storageState: process.env.CI ? undefined : 'e2e/.auth/user.json',
      },
      dependencies: process.env.CI ? undefined : ['setup'],
    },

    /* モバイル Safari */
    {
      name: 'Mobile Safari',
      use: {
        ...devices['iPhone 12'],
        storageState: process.env.CI ? undefined : 'e2e/.auth/user.json',
      },
      dependencies: process.env.CI ? undefined : ['setup'],
    },

    /* ブランド別ブラウザ（オプション） */
    {
      name: 'Microsoft Edge',
      use: {
        ...devices['Desktop Edge'],
        channel: 'msedge',
        storageState: process.env.CI ? undefined : 'e2e/.auth/user.json',
      },
      dependencies: process.env.CI ? undefined : ['setup'],
    },
    {
      name: 'Google Chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        storageState: process.env.CI ? undefined : 'e2e/.auth/user.json',
      },
      dependencies: process.env.CI ? undefined : ['setup'],
    },
  ],

  /* ローカル開発サーバー設定 */
  webServer: process.env.CI ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      NODE_ENV: 'test',
      NEXTAUTH_SECRET: 'test-secret-key-for-testing-only',
      DATABASE_URL: ':memory:',
      ENCRYPTION_MASTER_KEY: 'dGVzdC1lbmNyeXB0aW9uLWtleS1mb3ItdGVzdGluZw==',
    },
  },

  /* グローバル設定 */
  globalSetup: require.resolve('./e2e/global-setup.ts'),
  globalTeardown: require.resolve('./e2e/global-teardown.ts'),

  /* テストマッチパターン */
  testMatch: ['**/*.e2e.{js,ts}', '**/*.spec.{js,ts}'],
  testIgnore: [
    '**/node_modules/**',
    '**/build/**',
    '**/dist/**',
    '**/.next/**',
  ],

  /* タイムアウト設定 */
  timeout: 30000,
  expect: {
    timeout: 5000,
  },

  /* 出力ディレクトリ */
  outputDir: 'test-results/',
});
