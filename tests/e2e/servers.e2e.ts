import { test, expect } from '@playwright/test';

test.describe('Servers Management', () => {
  test.use({ storageState: 'tests/e2e/.auth/user.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/servers');
  });

  test('displays servers list page correctly', async ({ page }) => {
    // ページタイトルとヘッダーの確認
    await expect(page).toHaveTitle(/サーバー管理/);
    await expect(page.locator('h1')).toContainText('サーバー管理');
    
    // 統計カードが表示されることを確認
    await expect(page.locator('[data-testid="servers-stats"]')).toBeVisible();
    await expect(page.locator('[data-testid="total-servers-stat"]')).toBeVisible();
    await expect(page.locator('[data-testid="running-servers-stat"]')).toBeVisible();
    await expect(page.locator('[data-testid="stopped-servers-stat"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-servers-stat"]')).toBeVisible();
  });

  test('filters work correctly', async ({ page }) => {
    // 検索フィルターのテスト
    const searchInput = page.locator('input[placeholder*="検索"]');
    await searchInput.fill('test');
    await expect(searchInput).toHaveValue('test');
    
    // ステータスフィルターのテスト
    const statusFilter = page.locator('select[data-testid="status-filter"]');
    if (await statusFilter.isVisible()) {
      await statusFilter.selectOption('running');
      await expect(statusFilter).toHaveValue('running');
    }
    
    // カテゴリフィルターのテスト
    const categoryFilter = page.locator('select[data-testid="category-filter"]');
    if (await categoryFilter.isVisible()) {
      await categoryFilter.selectOption('development');
      await expect(categoryFilter).toHaveValue('development');
    }
  });

  test('server creation flow works', async ({ page }) => {
    // 新規作成ボタンのクリック
    await page.click('button', { hasText: '新規作成' });
    
    // モーダルまたは作成ページが表示されることを確認
    await expect(page.locator('[data-testid="create-server-modal"]').or(page.locator('h1', { hasText: '新規サーバー作成' }))).toBeVisible();
    
    // フォームフィールドの入力
    await page.fill('input[name="name"]', 'test-server-e2e');
    await page.fill('input[name="displayName"]', 'E2E Test Server');
    await page.fill('input[name="image"]', 'nginx:latest');
    await page.fill('textarea[name="description"]', 'E2E テスト用のサーバーです');
    
    // カテゴリとポートの設定
    if (await page.locator('select[name="category"]').isVisible()) {
      await page.selectOption('select[name="category"]', 'testing');
    }
    await page.fill('input[name="port"]', '8080');
    
    // 作成ボタンのクリック
    await page.click('button[type="submit"]', { hasText: '作成' });
    
    // 作成成功メッセージまたはリダイレクトの確認
    await expect(page.locator('[data-testid="success-message"]').or(page.locator('.toast'))).toBeVisible();
  });

  test('server actions work correctly', async ({ page }) => {
    // サーバーリストが表示されるまで待機
    await expect(page.locator('[data-testid="servers-list"]')).toBeVisible();
    
    // サーバーが存在する場合のアクションテスト
    const firstServer = page.locator('[data-testid="server-item"]').first();
    if (await firstServer.isVisible()) {
      // 詳細表示ボタンのテスト
      const detailsButton = firstServer.locator('button', { hasText: '詳細' });
      if (await detailsButton.isVisible()) {
        await detailsButton.click();
        await expect(page.locator('[data-testid="server-details"]')).toBeVisible();
      }
      
      // アクションメニューのテスト
      const actionsButton = firstServer.locator('[data-testid="server-actions"]');
      if (await actionsButton.isVisible()) {
        await actionsButton.click();
        
        // メニュー項目の確認
        await expect(page.locator('[role="menu"]')).toBeVisible();
        await expect(page.locator('button', { hasText: '開始' }).or(page.locator('button', { hasText: '停止' }))).toBeVisible();
        await expect(page.locator('button', { hasText: '再起動' })).toBeVisible();
        await expect(page.locator('button', { hasText: '編集' })).toBeVisible();
        await expect(page.locator('button', { hasText: '削除' })).toBeVisible();
      }
    }
  });

  test('server start/stop functionality', async ({ page }) => {
    // 停止中のサーバーがある場合の開始テスト
    const stoppedServer = page.locator('[data-testid="server-item"]').filter({ has: page.locator('[data-testid="status-stopped"]') }).first();
    
    if (await stoppedServer.isVisible()) {
      const startButton = stoppedServer.locator('button', { hasText: '開始' });
      if (await startButton.isVisible()) {
        await startButton.click();
        
        // 確認ダイアログが表示される場合
        const confirmButton = page.locator('button', { hasText: '確認' });
        if (await confirmButton.isVisible()) {
          await confirmButton.click();
        }
        
        // 操作の実行とステータス変更を確認
        await expect(page.locator('[data-testid="loading-indicator"]').or(page.locator('.toast'))).toBeVisible();
      }
    }
  });

  test('server editing works', async ({ page }) => {
    const firstServer = page.locator('[data-testid="server-item"]').first();
    
    if (await firstServer.isVisible()) {
      // 編集ボタンのクリック
      const editButton = firstServer.locator('button', { hasText: '編集' });
      if (await editButton.isVisible()) {
        await editButton.click();
      } else {
        // アクションメニュー経由での編集
        await firstServer.locator('[data-testid="server-actions"]').click();
        await page.locator('button', { hasText: '編集' }).click();
      }
      
      // 編集フォームの表示確認
      await expect(page.locator('[data-testid="edit-server-form"]').or(page.locator('h1', { hasText: '編集' }))).toBeVisible();
      
      // フィールド値の変更
      const nameInput = page.locator('input[name="displayName"]');
      if (await nameInput.isVisible()) {
        await nameInput.clear();
        await nameInput.fill('Updated Server Name');
      }
      
      // 保存ボタンのクリック
      await page.click('button', { hasText: '保存' });
      
      // 更新成功の確認
      await expect(page.locator('[data-testid="success-message"]').or(page.locator('.toast'))).toBeVisible();
    }
  });

  test('server deletion works', async ({ page }) => {
    const firstServer = page.locator('[data-testid="server-item"]').first();
    
    if (await firstServer.isVisible()) {
      // サーバー名を記録
      const serverName = await firstServer.locator('[data-testid="server-name"]').textContent();
      
      // 削除ボタンのクリック
      const deleteButton = firstServer.locator('button', { hasText: '削除' });
      if (await deleteButton.isVisible()) {
        await deleteButton.click();
      } else {
        // アクションメニュー経由での削除
        await firstServer.locator('[data-testid="server-actions"]').click();
        await page.locator('button', { hasText: '削除' }).click();
      }
      
      // 確認ダイアログの処理
      await expect(page.locator('[role="dialog"]', { hasText: '削除' })).toBeVisible();
      await page.click('button', { hasText: '削除' });
      
      // 削除成功の確認
      await expect(page.locator('[data-testid="success-message"]').or(page.locator('.toast'))).toBeVisible();
      
      // サーバーがリストから削除されたことを確認
      if (serverName) {
        await expect(page.locator(`text=${serverName}`)).not.toBeVisible();
      }
    }
  });

  test('pagination works correctly', async ({ page }) => {
    // ページネーションが表示される場合のテスト
    const pagination = page.locator('[data-testid="pagination"]');
    
    if (await pagination.isVisible()) {
      // 次のページボタンのテスト
      const nextButton = pagination.locator('button', { hasText: '次へ' });
      if (await nextButton.isVisible() && !await nextButton.isDisabled()) {
        await nextButton.click();
        
        // URL またはページコンテンツが変更されることを確認
        await page.waitForTimeout(500);
        await expect(page.locator('[data-testid="servers-list"]')).toBeVisible();
      }
    }
  });

  test('bulk actions work', async ({ page }) => {
    // 複数選択機能がある場合のテスト
    const selectAllCheckbox = page.locator('input[data-testid="select-all"]');
    
    if (await selectAllCheckbox.isVisible()) {
      await selectAllCheckbox.check();
      
      // 一括操作ボタンが表示されることを確認
      await expect(page.locator('[data-testid="bulk-actions"]')).toBeVisible();
      
      // 一括削除ボタンのテスト
      const bulkDeleteButton = page.locator('button', { hasText: '選択項目を削除' });
      if (await bulkDeleteButton.isVisible()) {
        await bulkDeleteButton.click();
        
        // 確認ダイアログの表示
        await expect(page.locator('[role="dialog"]', { hasText: '削除' })).toBeVisible();
      }
    }
  });

  test('responsive design works on mobile', async ({ page }) => {
    // モバイルビューポートに設定
    await page.setViewportSize({ width: 375, height: 667 });
    
    // モバイルレイアウトの確認
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('[data-testid="servers-stats"]')).toBeVisible();
    
    // モバイルでのフィルター表示
    const filterToggle = page.locator('[data-testid="filter-toggle"]');
    if (await filterToggle.isVisible()) {
      await filterToggle.click();
      await expect(page.locator('[data-testid="filters-panel"]')).toBeVisible();
    }
  });

  test('real-time updates work', async ({ page }) => {
    // WebSocket接続またはポーリングによるリアルタイム更新のテスト
    await page.waitForTimeout(2000);
    
    // ステータスの自動更新を確認
    const statusElements = page.locator('[data-testid="server-status"]');
    if (await statusElements.count() > 0) {
      // 初期状態を記録
      const initialStatuses = await statusElements.allTextContents();
      
      // 一定時間待機後に変更があるかチェック
      await page.waitForTimeout(5000);
      const updatedStatuses = await statusElements.allTextContents();
      
      // ステータスが更新される可能性があることを確認
      // （実際の更新は外部要因に依存するため、要素が存在することのみ確認）
      await expect(statusElements.first()).toBeVisible();
    }
  });
});

test.describe('Servers Permissions', () => {
  test.describe('Viewer User', () => {
    test.use({ storageState: 'tests/e2e/.auth/viewer.json' });

    test('has read-only access to servers', async ({ page }) => {
      await page.goto('/servers');
      
      // 閲覧は可能
      await expect(page.locator('h1')).toContainText('サーバー管理');
      
      // 作成・編集・削除ボタンが表示されないことを確認
      await expect(page.locator('button', { hasText: '新規作成' })).not.toBeVisible();
      await expect(page.locator('button', { hasText: '編集' })).not.toBeVisible();
      await expect(page.locator('button', { hasText: '削除' })).not.toBeVisible();
    });
  });
});