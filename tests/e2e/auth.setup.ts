import { test as setup, expect } from '@playwright/test';

const adminFile = 'tests/e2e/.auth/admin.json';
const userFile = 'tests/e2e/.auth/user.json';
const viewerFile = 'tests/e2e/.auth/viewer.json';

/**
 * 管理者ユーザーの認証セットアップ
 */
setup('authenticate as admin', async ({ page }) => {
  await page.goto('/auth/signin');
  
  await page.fill('input[name="email"]', 'admin@test.example.com');
  await page.fill('input[name="password"]', 'admin-password');
  
  await page.click('button[type="submit"]');
  
  // ログイン成功をダッシュボードへのリダイレクトで確認
  await expect(page).toHaveURL('/dashboard');
  
  // ナビゲーションに管理者メニューが表示されることを確認
  await expect(page.locator('nav')).toContainText('システム設定');
  
  await page.context().storageState({ path: adminFile });
});

/**
 * 一般ユーザーの認証セットアップ
 */
setup('authenticate as user', async ({ page }) => {
  await page.goto('/auth/signin');
  
  await page.fill('input[name="email"]', 'user@test.example.com');
  await page.fill('input[name="password"]', 'user-password');
  
  await page.click('button[type="submit"]');
  
  await expect(page).toHaveURL('/dashboard');
  
  // 一般ユーザーはシステム設定にアクセスできないことを確認
  await expect(page.locator('nav')).not.toContainText('システム設定');
  
  await page.context().storageState({ path: userFile });
});

/**
 * 閲覧者の認証セットアップ
 */
setup('authenticate as viewer', async ({ page }) => {
  await page.goto('/auth/signin');
  
  await page.fill('input[name="email"]', 'viewer@test.example.com');
  await page.fill('input[name="password"]', 'viewer-password');
  
  await page.click('button[type="submit"]');
  
  await expect(page).toHaveURL('/dashboard');
  
  // 閲覧者はサーバー管理機能が制限されることを確認
  await page.goto('/servers');
  await expect(page.locator('button', { hasText: '新規作成' })).not.toBeVisible();
  
  await page.context().storageState({ path: viewerFile });
});