import { chromium, FullConfig } from '@playwright/test';
import { db } from '@/db/connection';
import { users } from '@/db/schema';
import { hash } from '@/lib/crypto/encryption';

/**
 * Playwright グローバルセットアップ
 * テスト実行前の初期化処理
 */
async function globalSetup(config: FullConfig) {
  console.log('🧪 E2Eテスト環境をセットアップ中...');

  try {
    // データベース初期化
    await setupTestDatabase();
    
    // 認証状態のセットアップ
    await setupAuthentication(config);
    
    console.log('✅ E2Eテスト環境のセットアップが完了しました');
  } catch (error) {
    console.error('❌ E2Eテスト環境のセットアップに失敗しました:', error);
    throw error;
  }
}

/**
 * テストデータベースのセットアップ
 */
async function setupTestDatabase() {
  console.log('📊 テストデータベースをセットアップ中...');

  try {
    // 既存データをクリア（テスト環境でのみ実行）
    if (process.env.NODE_ENV === 'test') {
      await db.delete(users);
    }

    // テストユーザーを作成
    const testUsers = [
      {
        id: 'admin-test-user',
        email: 'admin@test.example.com',
        name: 'Test Admin',
        role: 'ADMIN',
        passwordHash: await hash('admin-password'),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'user-test-user',
        email: 'user@test.example.com',
        name: 'Test User',
        role: 'USER',
        passwordHash: await hash('user-password'),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'viewer-test-user',
        email: 'viewer@test.example.com',
        name: 'Test Viewer',
        role: 'VIEWER',
        passwordHash: await hash('viewer-password'),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    for (const user of testUsers) {
      await db.insert(users).values(user);
    }

    console.log('✅ テストデータベースのセットアップが完了しました');
  } catch (error) {
    console.error('❌ テストデータベースのセットアップに失敗しました:', error);
    throw error;
  }
}

/**
 * 認証状態のセットアップ
 */
async function setupAuthentication(config: FullConfig) {
  console.log('🔐 認証状態をセットアップ中...');

  try {
    const { baseURL } = config.projects[0].use;
    const browser = await chromium.launch();
    
    // 管理者ユーザーでログイン
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    
    await adminPage.goto(`${baseURL}/auth/signin`);
    
    // ログインフォームに入力
    await adminPage.fill('input[name="email"]', 'admin@test.example.com');
    await adminPage.fill('input[name="password"]', 'admin-password');
    await adminPage.click('button[type="submit"]');
    
    // ログイン完了を待機
    await adminPage.waitForURL(`${baseURL}/dashboard`);
    
    // 認証状態を保存
    await adminContext.storageState({ path: 'tests/e2e/.auth/admin.json' });
    
    // 一般ユーザーでログイン
    const userContext = await browser.newContext();
    const userPage = await userContext.newPage();
    
    await userPage.goto(`${baseURL}/auth/signin`);
    await userPage.fill('input[name="email"]', 'user@test.example.com');
    await userPage.fill('input[name="password"]', 'user-password');
    await userPage.click('button[type="submit"]');
    
    await userPage.waitForURL(`${baseURL}/dashboard`);
    await userContext.storageState({ path: 'tests/e2e/.auth/user.json' });
    
    // 閲覧者でログイン
    const viewerContext = await browser.newContext();
    const viewerPage = await viewerContext.newPage();
    
    await viewerPage.goto(`${baseURL}/auth/signin`);
    await viewerPage.fill('input[name="email"]', 'viewer@test.example.com');
    await viewerPage.fill('input[name="password"]', 'viewer-password');
    await viewerPage.click('button[type="submit"]');
    
    await viewerPage.waitForURL(`${baseURL}/dashboard`);
    await viewerContext.storageState({ path: 'tests/e2e/.auth/viewer.json' });
    
    await browser.close();
    
    console.log('✅ 認証状態のセットアップが完了しました');
  } catch (error) {
    console.error('❌ 認証状態のセットアップに失敗しました:', error);
    throw error;
  }
}

export default globalSetup;