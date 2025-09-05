/**
 * Playwright グローバルセットアップ
 * 
 * 機能要件：
 * - E2Eテスト用の環境準備
 * - テストデータの作成
 * - 認証状態の準備
 * - モックサーバーの起動
 */

import { chromium, FullConfig } from '@playwright/test'
import path from 'path'
import fs from 'fs/promises'

async function globalSetup(config: FullConfig) {
  console.log('🚀 E2E テスト グローバルセットアップを開始...')

  try {
    // テスト用ディレクトリの作成
    await createTestDirectories()
    
    // テスト用認証状態の準備
    await setupAuthenticationState(config)
    
    // テスト用モックデータの準備
    await setupMockData()
    
    console.log('✅ E2E テスト グローバルセットアップが完了しました')
  } catch (error) {
    console.error('❌ E2E テスト グローバルセットアップでエラーが発生:', error)
    throw error
  }
}

/**
 * テスト用ディレクトリを作成
 */
async function createTestDirectories() {
  const directories = [
    'test-results',
    'test-results/screenshots',
    'test-results/videos',
    'test-results/traces',
    'playwright-report',
  ]
  
  for (const dir of directories) {
    try {
      await fs.mkdir(path.join(process.cwd(), dir), { recursive: true })
    } catch (error: any) {
      if (error.code !== 'EEXIST') {
        throw error
      }
    }
  }
  
  console.log('📁 テスト用ディレクトリを作成しました')
}

/**
 * 認証状態を準備
 */
async function setupAuthenticationState(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL || 'http://localhost:3000'
  
  // 管理者ユーザーの認証状態を作成
  const adminBrowser = await chromium.launch()
  const adminContext = await adminBrowser.newContext()
  const adminPage = await adminContext.newPage()
  
  try {
    // ログインページにアクセス
    await adminPage.goto(`${baseURL}/login`)
    
    // 管理者でログイン（テスト用認証情報）
    await adminPage.fill('[name="email"]', 'admin@test.com')
    await adminPage.fill('[name="password"]', 'test-password-123')
    await adminPage.click('button[type="submit"]')
    
    // ログイン成功を待機
    await adminPage.waitForURL('**/dashboard')
    
    // 認証状態を保存
    await adminContext.storageState({
      path: path.join(process.cwd(), 'test-results', 'admin-auth.json'),
    })
    
    console.log('🔑 管理者認証状態を準備しました')
  } catch (error) {
    console.warn('⚠️ 管理者認証状態の準備をスキップしました:', error)
    
    // フォールバック: 手動で認証状態を作成
    const fallbackAuthState = {
      cookies: [],
      origins: [
        {
          origin: baseURL,
          localStorage: [
            {
              name: 'next-auth.session-token',
              value: 'test-admin-session-token',
            },
          ],
        },
      ],
    }
    
    await fs.writeFile(
      path.join(process.cwd(), 'test-results', 'admin-auth.json'),
      JSON.stringify(fallbackAuthState, null, 2)
    )
  } finally {
    await adminBrowser.close()
  }
  
  // 一般ユーザーの認証状態を作成
  const userBrowser = await chromium.launch()
  const userContext = await userBrowser.newContext()
  const userPage = await userContext.newPage()
  
  try {
    await userPage.goto(`${baseURL}/login`)
    
    // 一般ユーザーでログイン
    await userPage.fill('[name="email"]', 'user@test.com')
    await userPage.fill('[name="password"]', 'test-password-123')
    await userPage.click('button[type="submit"]')
    
    await userPage.waitForURL('**/dashboard')
    
    await userContext.storageState({
      path: path.join(process.cwd(), 'test-results', 'user-auth.json'),
    })
    
    console.log('👤 一般ユーザー認証状態を準備しました')
  } catch (error) {
    console.warn('⚠️ 一般ユーザー認証状態の準備をスキップしました:', error)
    
    // フォールバック認証状態
    const fallbackUserAuthState = {
      cookies: [],
      origins: [
        {
          origin: baseURL,
          localStorage: [
            {
              name: 'next-auth.session-token',
              value: 'test-user-session-token',
            },
          ],
        },
      ],
    }
    
    await fs.writeFile(
      path.join(process.cwd(), 'test-results', 'user-auth.json'),
      JSON.stringify(fallbackUserAuthState, null, 2)
    )
  } finally {
    await userBrowser.close()
  }
}

/**
 * テスト用モックデータを準備
 */
async function setupMockData() {
  const mockData = {
    servers: [
      {
        id: 'e2e-test-server-1',
        name: 'E2E Test Nginx',
        image: 'nginx:latest',
        status: 'running',
        ports: [{ containerPort: 80, hostPort: 8080, protocol: 'tcp' }],
        environment: { NODE_ENV: 'production' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'e2e-test-server-2',
        name: 'E2E Test Redis',
        image: 'redis:7-alpine',
        status: 'stopped',
        ports: [{ containerPort: 6379, hostPort: 6379, protocol: 'tcp' }],
        environment: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    users: [
      {
        id: 'admin-user',
        email: 'admin@test.com',
        name: 'E2E Test Admin',
        role: 'admin',
        permissions: ['servers:view', 'servers:create', 'servers:update', 'servers:delete'],
      },
      {
        id: 'regular-user',
        email: 'user@test.com',
        name: 'E2E Test User',
        role: 'user',
        permissions: ['servers:view'],
      },
    ],
  }
  
  await fs.writeFile(
    path.join(process.cwd(), 'test-results', 'e2e-mock-data.json'),
    JSON.stringify(mockData, null, 2)
  )
  
  console.log('📊 テスト用モックデータを準備しました')
}

export default globalSetup