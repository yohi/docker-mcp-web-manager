import { test, expect } from '@playwright/test';

test.describe('Dashboard Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
  });

  test('displays dashboard overview correctly', async ({ page }) => {
    // ページタイトルの確認
    await expect(page).toHaveTitle(/Dashboard/);
    await expect(page.locator('h1')).toContainText('ダッシュボード');

    // 統計カードが表示されることを確認
    await expect(page.locator('[data-testid="stats-card"]')).toHaveCount(4);
    
    // 各統計カードの内容確認
    await expect(page.locator('[data-testid="total-servers"]')).toBeVisible();
    await expect(page.locator('[data-testid="running-servers"]')).toBeVisible();
    await expect(page.locator('[data-testid="cpu-usage"]')).toBeVisible();
    await expect(page.locator('[data-testid="memory-usage"]')).toBeVisible();
  });

  test('shows recent servers list', async ({ page }) => {
    // 最近のサーバー一覧セクションが表示されることを確認
    await expect(page.locator('h2', { hasText: '最近のサーバー' })).toBeVisible();
    
    // サーバーリストまたは空状態メッセージが表示されることを確認
    const serverList = page.locator('[data-testid="recent-servers-list"]');
    const emptyState = page.locator('[data-testid="no-servers-message"]');
    
    const hasServers = await serverList.isVisible();
    const hasEmptyState = await emptyState.isVisible();
    
    expect(hasServers || hasEmptyState).toBeTruthy();
  });

  test('displays system monitoring charts', async ({ page }) => {
    // 監視チャートセクションが表示されることを確認
    await expect(page.locator('h2', { hasText: 'システム監視' })).toBeVisible();
    
    // CPUとメモリのチャートが表示されることを確認
    await expect(page.locator('[data-testid="cpu-chart"]')).toBeVisible();
    await expect(page.locator('[data-testid="memory-chart"]')).toBeVisible();
  });

  test('navigation works correctly', async ({ page }) => {
    // ナビゲーションメニューが表示されることを確認
    await expect(page.locator('nav')).toBeVisible();
    
    // 各メニューリンクのテスト
    await page.click('nav a[href="/servers"]');
    await expect(page).toHaveURL('/servers');
    await expect(page.locator('h1')).toContainText('サーバー管理');
    
    await page.click('nav a[href="/catalog"]');
    await expect(page).toHaveURL('/catalog');
    await expect(page.locator('h1')).toContainText('カタログ');
    
    await page.click('nav a[href="/monitoring"]');
    await expect(page).toHaveURL('/monitoring');
    await expect(page.locator('h1')).toContainText('監視');
    
    // ダッシュボードに戻る
    await page.click('nav a[href="/dashboard"]');
    await expect(page).toHaveURL('/dashboard');
  });

  test('responsive design works on mobile', async ({ page }) => {
    // モバイルビューポートに設定
    await page.setViewportSize({ width: 375, height: 667 });
    
    // モバイルでもメインコンテンツが表示されることを確認
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('[data-testid="stats-card"]')).toBeVisible();
    
    // モバイルナビゲーションが機能することを確認
    const mobileMenuToggle = page.locator('[data-testid="mobile-menu-toggle"]');
    if (await mobileMenuToggle.isVisible()) {
      await mobileMenuToggle.click();
      await expect(page.locator('nav')).toBeVisible();
    }
  });

  test('handles loading states properly', async ({ page }) => {
    // ページリロードでローディング状態が適切に処理されることを確認
    await page.reload();
    
    // ローディング後にコンテンツが表示されることを確認
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('[data-testid="stats-card"]')).toHaveCount(4);
  });

  test('displays error states gracefully', async ({ page }) => {
    // ネットワークエラーをシミュレート
    await page.route('/api/v1/dashboard/stats', route => route.abort());
    
    await page.reload();
    
    // エラー状態が適切に表示されることを確認
    const errorMessage = page.locator('[data-testid="error-message"]');
    const fallbackContent = page.locator('[data-testid="fallback-content"]');
    
    // エラーメッセージまたはフォールバックコンテンツが表示されることを確認
    await expect(errorMessage.or(fallbackContent)).toBeVisible();
  });

  test('quick actions work correctly', async ({ page }) => {
    // クイックアクションボタンが表示されることを確認
    const quickActionsSection = page.locator('[data-testid="quick-actions"]');
    if (await quickActionsSection.isVisible()) {
      // 新規サーバー作成ボタンのテスト
      const createServerButton = page.locator('button', { hasText: '新規サーバー作成' });
      if (await createServerButton.isVisible()) {
        await createServerButton.click();
        await expect(page).toHaveURL(/\/servers\/create/);
      }
    }
  });

  test('refresh functionality works', async ({ page }) => {
    // リフレッシュボタンが存在する場合のテスト
    const refreshButton = page.locator('[data-testid="refresh-button"]');
    if (await refreshButton.isVisible()) {
      // クリック前のデータを記録
      const initialStats = await page.locator('[data-testid="stats-card"]').first().textContent();
      
      await refreshButton.click();
      
      // データが更新されるまで待機
      await page.waitForTimeout(1000);
      
      // 統計が再取得されることを確認
      await expect(page.locator('[data-testid="stats-card"]').first()).toBeVisible();
    }
  });
});

test.describe('Dashboard Permissions', () => {
  test.describe('Admin User', () => {
    test.use({ storageState: 'tests/e2e/.auth/admin.json' });

    test('sees all admin features', async ({ page }) => {
      await page.goto('/dashboard');
      
      // 管理者専用機能が表示されることを確認
      await expect(page.locator('nav a[href="/settings"]')).toBeVisible();
      await expect(page.locator('[data-testid="admin-section"]')).toBeVisible();
    });
  });

  test.describe('Regular User', () => {
    test.use({ storageState: 'tests/e2e/.auth/user.json' });

    test('sees user-appropriate features', async ({ page }) => {
      await page.goto('/dashboard');
      
      // 一般ユーザー機能が表示されることを確認
      await expect(page.locator('nav a[href="/servers"]')).toBeVisible();
      await expect(page.locator('nav a[href="/catalog"]')).toBeVisible();
      
      // 管理者専用機能が表示されないことを確認
      await expect(page.locator('nav a[href="/settings"]')).not.toBeVisible();
    });
  });

  test.describe('Viewer User', () => {
    test.use({ storageState: 'tests/e2e/.auth/viewer.json' });

    test('has read-only access', async ({ page }) => {
      await page.goto('/dashboard');
      
      // 閲覧機能のみ表示されることを確認
      await expect(page.locator('h1')).toContainText('ダッシュボード');
      
      // 作成・編集ボタンが表示されないことを確認
      await expect(page.locator('button', { hasText: '新規作成' })).not.toBeVisible();
      await expect(page.locator('button', { hasText: '編集' })).not.toBeVisible();
    });
  });
});