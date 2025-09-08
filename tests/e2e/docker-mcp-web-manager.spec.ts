import { test, expect, Page } from '@playwright/test';
import { chromium, Browser, BrowserContext } from '@playwright/test';

// =============================================================================
// E2E テストスイート
// 主要な機能フローの包括的なエンドツーエンドテスト
// =============================================================================

/**
 * テストユーザー情報
 */
const TEST_ADMIN = {
  email: 'admin@test.com',
  password: 'Admin123!',
  name: 'Test Administrator',
};

const TEST_USER = {
  email: 'user@test.com',
  password: 'User123!',
  name: 'Test User',
};

/**
 * テストデータ
 */
const TEST_SERVER = {
  name: 'Test MCP Server',
  description: 'Test server for E2E testing',
  transport: 'docker',
  command: 'python',
  args: ['-m', 'test_mcp_server'],
  image: 'test/mcp-server:latest',
};

const TEST_SECRET = {
  name: 'test-api-key',
  description: 'Test API key for E2E testing',
  value: 'test-secret-value-12345',
};

/**
 * ヘルパー関数
 */
class TestHelper {
  constructor(private page: Page) {}

  /**
   * ログイン処理
   */
  async login(credentials: { email: string; password: string }) {
    await this.page.goto('/login');
    await this.page.fill('[data-testid="email-input"]', credentials.email);
    await this.page.fill('[data-testid="password-input"]', credentials.password);
    await this.page.click('[data-testid="login-button"]');
    
    // ダッシュボードへのリダイレクトを待機
    await this.page.waitForURL('/dashboard');
    await expect(this.page.locator('[data-testid="user-menu"]')).toBeVisible();
  }

  /**
   * ログアウト処理
   */
  async logout() {
    await this.page.click('[data-testid="user-menu"]');
    await this.page.click('[data-testid="logout-button"]');
    await this.page.waitForURL('/login');
  }

  /**
   * サーバー作成処理
   */
  async createServer(server: typeof TEST_SERVER) {
    await this.page.goto('/servers/create');
    
    await this.page.fill('[data-testid="server-name-input"]', server.name);
    await this.page.fill('[data-testid="server-description-input"]', server.description);
    await this.page.selectOption('[data-testid="transport-select"]', server.transport);
    await this.page.fill('[data-testid="command-input"]', server.command);
    await this.page.fill('[data-testid="image-input"]', server.image);
    
    // 引数を追加
    for (const arg of server.args) {
      await this.page.click('[data-testid="add-arg-button"]');
      const argInputs = this.page.locator('[data-testid="arg-input"]');
      const lastInput = argInputs.last();
      await lastInput.fill(arg);
    }
    
    await this.page.click('[data-testid="create-server-button"]');
    
    // 作成成功を待機
    await expect(this.page.locator('[data-testid="success-message"]')).toBeVisible();
  }

  /**
   * シークレット作成処理
   */
  async createSecret(secret: typeof TEST_SECRET) {
    await this.page.goto('/secrets/create');
    
    await this.page.fill('[data-testid="secret-name-input"]', secret.name);
    await this.page.fill('[data-testid="secret-description-input"]', secret.description);
    await this.page.fill('[data-testid="secret-value-input"]', secret.value);
    
    await this.page.click('[data-testid="create-secret-button"]');
    
    // 作成成功を待機
    await expect(this.page.locator('[data-testid="success-message"]')).toBeVisible();
  }

  /**
   * ページロード待機
   */
  async waitForPageLoad() {
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * エラー表示の確認
   */
  async expectError(message?: string) {
    const errorElement = this.page.locator('[data-testid="error-message"]');
    await expect(errorElement).toBeVisible();
    if (message) {
      await expect(errorElement).toContainText(message);
    }
  }

  /**
   * 成功表示の確認
   */
  async expectSuccess(message?: string) {
    const successElement = this.page.locator('[data-testid="success-message"]');
    await expect(successElement).toBeVisible();
    if (message) {
      await expect(successElement).toContainText(message);
    }
  }
}

/**
 * テストスイート設定
 */
test.describe('Docker MCP Web Manager - E2E Tests', () => {
  let browser: Browser;
  let context: BrowserContext;
  let adminPage: Page;
  let userPage: Page;
  let adminHelper: TestHelper;
  let userHelper: TestHelper;

  test.beforeAll(async () => {
    browser = await chromium.launch();
    context = await browser.newContext({
      // ビューポート設定
      viewport: { width: 1920, height: 1080 },
      // ブラウザ設定
      permissions: ['clipboard-read', 'clipboard-write'],
    });
  });

  test.beforeEach(async () => {
    adminPage = await context.newPage();
    userPage = await context.newPage();
    adminHelper = new TestHelper(adminPage);
    userHelper = new TestHelper(userPage);
  });

  test.afterEach(async () => {
    await adminPage.close();
    await userPage.close();
  });

  test.afterAll(async () => {
    await context.close();
    await browser.close();
  });

  /**
   * 認証フロー テスト
   */
  test.describe('Authentication Flow', () => {
    test('should login and logout successfully', async () => {
      // ログイン
      await adminHelper.login(TEST_ADMIN);
      
      // ダッシュボードが表示されることを確認
      await expect(adminPage.locator('[data-testid="dashboard-title"]')).toBeVisible();
      await expect(adminPage.locator('[data-testid="user-menu"]')).toContainText(TEST_ADMIN.name);
      
      // ログアウト
      await adminHelper.logout();
      
      // ログインページにリダイレクトされることを確認
      await expect(adminPage.url()).toContain('/login');
    });

    test('should handle invalid credentials', async () => {
      await adminPage.goto('/login');
      await adminPage.fill('[data-testid="email-input"]', 'invalid@test.com');
      await adminPage.fill('[data-testid="password-input"]', 'wrongpassword');
      await adminPage.click('[data-testid="login-button"]');
      
      // エラーメッセージが表示されることを確認
      await adminHelper.expectError('認証に失敗');
    });

    test('should redirect unauthenticated users to login', async () => {
      await adminPage.goto('/dashboard');
      
      // ログインページにリダイレクトされることを確認
      await adminPage.waitForURL('/login');
      await expect(adminPage.locator('[data-testid="login-form"]')).toBeVisible();
    });
  });

  /**
   * サーバー管理 テスト
   */
  test.describe('Server Management', () => {
    test.beforeEach(async () => {
      await adminHelper.login(TEST_ADMIN);
    });

    test('should create, view, and delete a server', async () => {
      // サーバー作成
      await adminHelper.createServer(TEST_SERVER);
      
      // サーバー一覧で確認
      await adminPage.goto('/servers');
      await expect(adminPage.locator(`[data-testid="server-${TEST_SERVER.name}"]`)).toBeVisible();
      
      // サーバー詳細表示
      await adminPage.click(`[data-testid="server-${TEST_SERVER.name}"]`);
      await expect(adminPage.locator('[data-testid="server-details"]')).toBeVisible();
      await expect(adminPage.locator('[data-testid="server-name"]')).toContainText(TEST_SERVER.name);
      await expect(adminPage.locator('[data-testid="server-description"]')).toContainText(TEST_SERVER.description);
      
      // サーバー削除
      await adminPage.click('[data-testid="delete-server-button"]');
      await adminPage.click('[data-testid="confirm-delete-button"]');
      await adminHelper.expectSuccess('削除されました');
    });

    test('should start and stop a server', async () => {
      // サーバー作成
      await adminHelper.createServer(TEST_SERVER);
      
      // サーバー詳細に移動
      await adminPage.goto('/servers');
      await adminPage.click(`[data-testid="server-${TEST_SERVER.name}"]`);
      
      // サーバー開始
      await adminPage.click('[data-testid="start-server-button"]');
      await adminHelper.expectSuccess('開始されました');
      await expect(adminPage.locator('[data-testid="server-status"]')).toContainText('running');
      
      // サーバー停止
      await adminPage.click('[data-testid="stop-server-button"]');
      await adminHelper.expectSuccess('停止されました');
      await expect(adminPage.locator('[data-testid="server-status"]')).toContainText('stopped');
    });

    test('should validate server configuration', async () => {
      await adminPage.goto('/servers/create');
      
      // 必須フィールドの検証
      await adminPage.click('[data-testid="create-server-button"]');
      await adminHelper.expectError('名前は必須');
      
      // 無効なコマンドの検証
      await adminPage.fill('[data-testid="server-name-input"]', 'invalid-server');
      await adminPage.fill('[data-testid="command-input"]', '');
      await adminPage.click('[data-testid="create-server-button"]');
      await adminHelper.expectError('コマンドは必須');
    });
  });

  /**
   * シークレット管理 テスト
   */
  test.describe('Secret Management', () => {
    test.beforeEach(async () => {
      await adminHelper.login(TEST_ADMIN);
    });

    test('should create, view, and delete a secret', async () => {
      // シークレット作成
      await adminHelper.createSecret(TEST_SECRET);
      
      // シークレット一覧で確認
      await adminPage.goto('/secrets');
      await expect(adminPage.locator(`[data-testid="secret-${TEST_SECRET.name}"]`)).toBeVisible();
      
      // シークレット詳細表示
      await adminPage.click(`[data-testid="secret-${TEST_SECRET.name}"]`);
      await expect(adminPage.locator('[data-testid="secret-details"]')).toBeVisible();
      await expect(adminPage.locator('[data-testid="secret-name"]')).toContainText(TEST_SECRET.name);
      
      // シークレット値は隠されていることを確認
      await expect(adminPage.locator('[data-testid="secret-value"]')).toContainText('******');
      
      // シークレット削除
      await adminPage.click('[data-testid="delete-secret-button"]');
      await adminPage.click('[data-testid="confirm-delete-button"]');
      await adminHelper.expectSuccess('削除されました');
    });

    test('should handle secret value visibility', async () => {
      await adminHelper.createSecret(TEST_SECRET);
      
      // シークレット詳細に移動
      await adminPage.goto('/secrets');
      await adminPage.click(`[data-testid="secret-${TEST_SECRET.name}"]`);
      
      // シークレット値を表示
      await adminPage.click('[data-testid="show-secret-button"]');
      await expect(adminPage.locator('[data-testid="secret-value"]')).toContainText(TEST_SECRET.value);
      
      // シークレット値を非表示
      await adminPage.click('[data-testid="hide-secret-button"]');
      await expect(adminPage.locator('[data-testid="secret-value"]')).toContainText('******');
    });
  });

  /**
   * カタログ機能 テスト
   */
  test.describe('Catalog Functionality', () => {
    test.beforeEach(async () => {
      await adminHelper.login(TEST_ADMIN);
    });

    test('should browse and search catalog', async () => {
      await adminPage.goto('/catalog');
      
      // カタログページの表示確認
      await expect(adminPage.locator('[data-testid="catalog-title"]')).toBeVisible();
      
      // 検索機能
      await adminPage.fill('[data-testid="catalog-search"]', 'filesystem');
      await adminPage.press('[data-testid="catalog-search"]', 'Enter');
      await adminHelper.waitForPageLoad();
      
      // 検索結果の確認
      await expect(adminPage.locator('[data-testid="catalog-results"]')).toBeVisible();
      
      // カタログアイテムの詳細表示
      const firstItem = adminPage.locator('[data-testid^="catalog-item-"]').first();
      if (await firstItem.isVisible()) {
        await firstItem.click();
        await expect(adminPage.locator('[data-testid="catalog-item-details"]')).toBeVisible();
      }
    });

    test('should install server from catalog', async () => {
      await adminPage.goto('/catalog');
      
      // カタログアイテムを選択
      const catalogItem = adminPage.locator('[data-testid^="catalog-item-"]').first();
      if (await catalogItem.isVisible()) {
        await catalogItem.click();
        
        // インストールボタンをクリック
        await adminPage.click('[data-testid="install-from-catalog-button"]');
        
        // インストール設定画面
        await expect(adminPage.locator('[data-testid="install-config-form"]')).toBeVisible();
        
        // 設定を入力してインストール
        await adminPage.fill('[data-testid="server-name-input"]', 'Catalog Server');
        await adminPage.click('[data-testid="confirm-install-button"]');
        
        await adminHelper.expectSuccess('インストールされました');
      }
    });
  });

  /**
   * 監視・ログ機能 テスト
   */
  test.describe('Monitoring and Logging', () => {
    test.beforeEach(async () => {
      await adminHelper.login(TEST_ADMIN);
    });

    test('should display monitoring dashboard', async () => {
      await adminPage.goto('/monitoring');
      
      // 監視ダッシュボードの表示確認
      await expect(adminPage.locator('[data-testid="monitoring-dashboard"]')).toBeVisible();
      
      // メトリクスカードの表示確認
      await expect(adminPage.locator('[data-testid="cpu-usage-card"]')).toBeVisible();
      await expect(adminPage.locator('[data-testid="memory-usage-card"]')).toBeVisible();
      await expect(adminPage.locator('[data-testid="request-rate-card"]')).toBeVisible();
      
      // リアルタイム更新の確認
      await adminPage.click('[data-testid="auto-refresh-toggle"]');
      await expect(adminPage.locator('[data-testid="last-updated"]')).toBeVisible();
    });

    test('should display and filter logs', async () => {
      await adminPage.goto('/logs');
      
      // ログビューアの表示確認
      await expect(adminPage.locator('[data-testid="log-viewer"]')).toBeVisible();
      
      // ログフィルタリング
      await adminPage.selectOption('[data-testid="log-level-filter"]', 'ERROR');
      await adminHelper.waitForPageLoad();
      
      // フィルタ結果の確認
      const logEntries = adminPage.locator('[data-testid^="log-entry-"]');
      const count = await logEntries.count();
      if (count > 0) {
        // すべてのエントリがERRORレベルであることを確認
        for (let i = 0; i < count; i++) {
          const entry = logEntries.nth(i);
          await expect(entry.locator('[data-testid="log-level"]')).toContainText('ERROR');
        }
      }
    });

    test('should display active alerts', async () => {
      await adminPage.goto('/alerts');
      
      // アラート一覧の表示確認
      await expect(adminPage.locator('[data-testid="alerts-list"]')).toBeVisible();
      
      // アラートフィルタリング
      await adminPage.selectOption('[data-testid="severity-filter"]', 'high');
      await adminHelper.waitForPageLoad();
      
      // アラート詳細表示
      const alertItems = adminPage.locator('[data-testid^="alert-item-"]');
      const count = await alertItems.count();
      if (count > 0) {
        await alertItems.first().click();
        await expect(adminPage.locator('[data-testid="alert-details"]')).toBeVisible();
      }
    });
  });

  /**
   * 権限・アクセス制御 テスト
   */
  test.describe('Access Control', () => {
    test('should enforce admin-only access', async () => {
      // 一般ユーザーでログイン
      await userHelper.login(TEST_USER);
      
      // 管理者限定機能へのアクセス試行
      await userPage.goto('/users');
      await userHelper.expectError('管理者権限が必要');
      
      // シークレット管理へのアクセス試行
      await userPage.goto('/secrets/create');
      await userHelper.expectError('権限が不十分');
    });

    test('should allow user access to permitted features', async () => {
      // 一般ユーザーでログイン
      await userHelper.login(TEST_USER);
      
      // ダッシュボードアクセス
      await userPage.goto('/dashboard');
      await expect(userPage.locator('[data-testid="dashboard-title"]')).toBeVisible();
      
      // サーバー一覧表示（読み取り専用）
      await userPage.goto('/servers');
      await expect(userPage.locator('[data-testid="servers-list"]')).toBeVisible();
      
      // 作成ボタンが表示されないことを確認
      await expect(userPage.locator('[data-testid="create-server-button"]')).not.toBeVisible();
    });
  });

  /**
   * レスポンシブデザイン テスト
   */
  test.describe('Responsive Design', () => {
    test('should work on mobile devices', async () => {
      // モバイルビューポートに変更
      await adminPage.setViewportSize({ width: 375, height: 667 });
      
      await adminHelper.login(TEST_ADMIN);
      
      // ハンバーガーメニューの表示確認
      await expect(adminPage.locator('[data-testid="mobile-menu-button"]')).toBeVisible();
      
      // サイドバーが非表示であることを確認
      await expect(adminPage.locator('[data-testid="desktop-sidebar"]')).not.toBeVisible();
      
      // メニューを開く
      await adminPage.click('[data-testid="mobile-menu-button"]');
      await expect(adminPage.locator('[data-testid="mobile-menu"]')).toBeVisible();
    });

    test('should work on tablet devices', async () => {
      // タブレットビューポートに変更
      await adminPage.setViewportSize({ width: 768, height: 1024 });
      
      await adminHelper.login(TEST_ADMIN);
      
      // タブレット用レイアウトの確認
      await expect(adminPage.locator('[data-testid="dashboard-grid"]')).toBeVisible();
      
      // カード配置の確認
      const cards = adminPage.locator('[data-testid^="dashboard-card-"]');
      const count = await cards.count();
      expect(count).toBeGreaterThan(0);
    });
  });

  /**
   * パフォーマンス テスト
   */
  test.describe('Performance', () => {
    test('should load pages within acceptable time', async () => {
      await adminHelper.login(TEST_ADMIN);
      
      // ダッシュボード読み込み時間
      const dashboardStart = Date.now();
      await adminPage.goto('/dashboard');
      await adminHelper.waitForPageLoad();
      const dashboardTime = Date.now() - dashboardStart;
      expect(dashboardTime).toBeLessThan(3000); // 3秒以内
      
      // サーバー一覧読み込み時間
      const serversStart = Date.now();
      await adminPage.goto('/servers');
      await adminHelper.waitForPageLoad();
      const serversTime = Date.now() - serversStart;
      expect(serversTime).toBeLessThan(2000); // 2秒以内
    });

    test('should handle large datasets efficiently', async () => {
      await adminHelper.login(TEST_ADMIN);
      
      // ログページで大量データの表示
      await adminPage.goto('/logs');
      
      // 大量のログが表示される場合のスクロールパフォーマンス
      const logContainer = adminPage.locator('[data-testid="log-container"]');
      if (await logContainer.isVisible()) {
        // スクロールテスト
        await logContainer.scrollIntoViewIfNeeded();
        await adminPage.mouse.wheel(0, 1000);
        await adminHelper.waitForPageLoad();
        
        // 仮想化による効率的な表示確認
        const visibleLogs = adminPage.locator('[data-testid^="log-entry-"]');
        const count = await visibleLogs.count();
        expect(count).toBeLessThan(100); // 仮想化により表示数制限
      }
    });
  });

  /**
   * エラーハンドリング テスト
   */
  test.describe('Error Handling', () => {
    test('should handle API errors gracefully', async () => {
      await adminHelper.login(TEST_ADMIN);
      
      // ネットワークエラーのシミュレーション
      await adminPage.route('**/api/v1/servers', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });
      });
      
      await adminPage.goto('/servers');
      await adminHelper.expectError('サーバーの取得に失敗');
    });

    test('should handle offline scenarios', async () => {
      await adminHelper.login(TEST_ADMIN);
      
      // オフライン状態をシミュレーション
      await adminPage.context().setOffline(true);
      
      await adminPage.goto('/servers/create');
      await adminHelper.createServer(TEST_SERVER);
      
      // オフライン時のエラーメッセージ確認
      await adminHelper.expectError('ネットワークエラー');
      
      // オンライン復帰
      await adminPage.context().setOffline(false);
    });
  });
});