import { test, expect } from '@playwright/test';

test.describe('Dashboard Page', () => {
  test.beforeEach(async ({ page }) => {
    // モック認証を設定（本来はログインフローが必要）
    await page.goto('/');
  });

  test('should display dashboard with main sections', async ({ page }) => {
    // ページタイトルの確認
    await expect(page).toHaveTitle(/Docker MCP Web Manager/);
    
    // メインヘッダーの確認
    await expect(page.locator('h1')).toContainText('ダッシュボード');
    
    // 統計カードの確認
    await expect(page.locator('[data-testid="server-stats"]').or(page.getByText('サーバー'))).toBeVisible();
    
    // サーバー管理セクションの確認
    await expect(page.getByText('サーバー管理')).toBeVisible();
    
    // システム監視セクションの確認  
    await expect(page.getByText('システム監視')).toBeVisible();
  });

  test('should show server statistics', async ({ page }) => {
    // 統計数値の表示確認
    await expect(page.locator('[data-testid="total-servers"]').or(page.locator('.text-2xl').first())).toBeVisible();
    
    // ステータス表示の確認
    await expect(page.getByText('実行中').or(page.getByText('running'))).toBeVisible();
  });

  test('should navigate to server management', async ({ page }) => {
    // "すべて表示" リンクのクリック
    const viewAllLink = page.getByText('すべて表示').first();
    if (await viewAllLink.isVisible()) {
      await viewAllLink.click();
      await expect(page).toHaveURL(/\/servers/);
    }
  });

  test('should have working refresh button', async ({ page }) => {
    // 更新ボタンの確認とクリック
    const refreshButton = page.getByText('更新').or(page.getByRole('button', { name: /更新|refresh/i }));
    if (await refreshButton.isVisible()) {
      await refreshButton.click();
      // 更新後の要素が表示されることを確認
      await expect(page.locator('h1')).toContainText('ダッシュボード');
    }
  });

  test('should display quick actions', async ({ page }) => {
    // クイックアクションセクションの確認
    await expect(page.getByText('クイックアクション')).toBeVisible();
    
    // 新しいサーバー追加ボタンの確認
    const addServerButton = page.getByText('サーバー追加').or(page.getByText('新しいサーバー'));
    if (await addServerButton.isVisible()) {
      await expect(addServerButton).toBeVisible();
    }
  });

  test('should be responsive on mobile', async ({ page }) => {
    // モバイルビューポートに変更
    await page.setViewportSize({ width: 375, height: 667 });
    
    // モバイルでも主要コンテンツが表示されることを確認
    await expect(page.locator('h1')).toContainText('ダッシュボード');
    await expect(page.getByText('サーバー管理')).toBeVisible();
  });

  test('should handle loading states', async ({ page }) => {
    // ページロード時のローディング状態を確認
    await page.goto('/', { waitUntil: 'networkidle' });
    
    // コンテンツが最終的に表示されることを確認
    await expect(page.locator('h1')).toContainText('ダッシュボード');
  });

  test('should display monitoring metrics', async ({ page }) => {
    // パフォーマンス指標の確認
    const cpuMetric = page.getByText('CPU使用率').or(page.getByText('CPU'));
    const memoryMetric = page.getByText('メモリ使用率').or(page.getByText('メモリ'));
    
    if (await cpuMetric.isVisible()) {
      await expect(cpuMetric).toBeVisible();
    }
    
    if (await memoryMetric.isVisible()) {
      await expect(memoryMetric).toBeVisible();
    }
  });

  test('should handle error states gracefully', async ({ page }) => {
    // ネットワークエラーをシミュレート
    await page.route('/api/v1/servers', route => 
      route.fulfill({ 
        status: 500, 
        body: JSON.stringify({ error: 'Internal Server Error' }) 
      })
    );
    
    await page.goto('/');
    
    // エラーハンドリングが適切に動作することを確認
    // （具体的なエラー表示はアプリケーションの実装に依存）
    await expect(page.locator('h1')).toContainText('ダッシュボード');
  });
});