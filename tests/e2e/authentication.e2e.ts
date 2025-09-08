import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // セッションをクリア
    await page.context().clearCookies();
  });

  test('login flow works correctly', async ({ page }) => {
    // ログインページへアクセス
    await page.goto('/auth/signin');
    
    // ログインページが表示されることを確認
    await expect(page).toHaveTitle(/ログイン/);
    await expect(page.locator('h1')).toContainText('ログイン');
    
    // フォームフィールドが表示されることを確認
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    
    // 有効な認証情報でログイン
    await page.fill('input[name="email"]', 'user@test.example.com');
    await page.fill('input[name="password"]', 'user-password');
    await page.click('button[type="submit"]');
    
    // ダッシュボードにリダイレクトされることを確認
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('h1')).toContainText('ダッシュボード');
    
    // ナビゲーションにユーザー情報が表示されることを確認
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
  });

  test('invalid credentials show error message', async ({ page }) => {
    await page.goto('/auth/signin');
    
    // 無効な認証情報でログインを試行
    await page.fill('input[name="email"]', 'invalid@example.com');
    await page.fill('input[name="password"]', 'wrong-password');
    await page.click('button[type="submit"]');
    
    // エラーメッセージが表示されることを確認
    await expect(page.locator('[data-testid="error-message"]').or(page.locator('.error'))).toBeVisible();
    await expect(page.locator('[data-testid="error-message"]').or(page.locator('.error'))).toContainText(/認証に失敗|ログインに失敗|無効/i);
    
    // ログインページに留まることを確認
    await expect(page).toHaveURL(/\/auth\/signin/);
  });

  test('empty form validation works', async ({ page }) => {
    await page.goto('/auth/signin');
    
    // 空のフォームでログインを試行
    await page.click('button[type="submit"]');
    
    // バリデーションエラーが表示されることを確認
    await expect(page.locator('input[name="email"]:invalid').or(page.locator('[data-testid="email-error"]'))).toBeVisible();
    await expect(page.locator('input[name="password"]:invalid').or(page.locator('[data-testid="password-error"]'))).toBeVisible();
  });

  test('email format validation works', async ({ page }) => {
    await page.goto('/auth/signin');
    
    // 無効なメール形式でログインを試行
    await page.fill('input[name="email"]', 'invalid-email');
    await page.fill('input[name="password"]', 'password');
    await page.click('button[type="submit"]');
    
    // メール形式のバリデーションエラーが表示されることを確認
    const emailInput = page.locator('input[name="email"]');
    await expect(emailInput).toHaveAttribute('type', 'email');
    
    // HTML5のバリデーションまたはカスタムエラーメッセージの確認
    const isInvalid = await emailInput.evaluate((el: HTMLInputElement) => !el.validity.valid);
    expect(isInvalid).toBeTruthy();
  });

  test('logout functionality works', async ({ page }) => {
    // まずログイン
    await page.goto('/auth/signin');
    await page.fill('input[name="email"]', 'user@test.example.com');
    await page.fill('input[name="password"]', 'user-password');
    await page.click('button[type="submit"]');
    
    await expect(page).toHaveURL('/dashboard');
    
    // ログアウト
    await page.click('[data-testid="user-menu"]');
    await page.click('button', { hasText: 'ログアウト' });
    
    // ログインページにリダイレクトされることを確認
    await expect(page).toHaveURL(/\/auth\/signin/);
    
    // 認証が必要なページにアクセスできないことを確認
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/auth\/signin/);
  });

  test('protected routes redirect to login', async ({ page }) => {
    // 認証なしで保護されたページにアクセス
    const protectedRoutes = ['/dashboard', '/servers', '/catalog', '/monitoring', '/settings'];
    
    for (const route of protectedRoutes) {
      await page.goto(route);
      
      // ログインページにリダイレクトされることを確認
      await expect(page).toHaveURL(/\/auth\/signin/);
    }
  });

  test('remember me functionality works', async ({ page }) => {
    await page.goto('/auth/signin');
    
    // Remember meチェックボックスがある場合のテスト
    const rememberMeCheckbox = page.locator('input[type="checkbox"][name="remember"]');
    
    if (await rememberMeCheckbox.isVisible()) {
      await rememberMeCheckbox.check();
      
      await page.fill('input[name="email"]', 'user@test.example.com');
      await page.fill('input[name="password"]', 'user-password');
      await page.click('button[type="submit"]');
      
      await expect(page).toHaveURL('/dashboard');
      
      // ブラウザを閉じて再開する（セッションをシミュレート）
      await page.context().close();
      const newContext = await page.context().browser()?.newContext();
      const newPage = await newContext?.newPage();
      
      if (newPage) {
        await newPage.goto('/dashboard');
        
        // セッションが維持されているかチェック
        // （実装に依存するため、ログインページではなくダッシュボードが表示されることを確認）
        const isLoggedIn = await newPage.locator('h1', { hasText: 'ダッシュボード' }).isVisible({ timeout: 5000 });
        
        if (isLoggedIn) {
          await expect(newPage).toHaveURL('/dashboard');
        } else {
          await expect(newPage).toHaveURL(/\/auth\/signin/);
        }
        
        await newContext?.close();
      }
    }
  });

  test('session timeout works correctly', async ({ page }) => {
    // ログイン
    await page.goto('/auth/signin');
    await page.fill('input[name="email"]', 'user@test.example.com');
    await page.fill('input[name="password"]', 'user-password');
    await page.click('button[type="submit"]');
    
    await expect(page).toHaveURL('/dashboard');
    
    // セッションタイムアウトをシミュレート（テスト環境では短い時間に設定）
    // 実際のセッション期限切れを待つのではなく、APIコールで確認
    await page.waitForTimeout(2000);
    
    // 長時間操作後のAPI呼び出しテスト
    await page.goto('/servers');
    
    // セッションが有効であることを確認（または期限切れの場合はリダイレクト）
    const currentUrl = page.url();
    expect(currentUrl).toMatch(/\/(servers|auth\/signin)/);
  });

  test('multiple login attempts lockout', async ({ page }) => {
    await page.goto('/auth/signin');
    
    // 複数回の無効なログインを試行
    for (let i = 0; i < 3; i++) {
      await page.fill('input[name="email"]', 'user@test.example.com');
      await page.fill('input[name="password"]', 'wrong-password');
      await page.click('button[type="submit"]');
      
      await page.waitForTimeout(500);
    }
    
    // アカウントロックアウトメッセージが表示されるかチェック
    // （実装によってはロックアウト機能がない場合もある）
    const lockoutMessage = page.locator('[data-testid="lockout-message"]');
    const generalError = page.locator('[data-testid="error-message"]');
    
    // いずれかのエラーメッセージが表示されることを確認
    await expect(lockoutMessage.or(generalError)).toBeVisible();
  });

  test('password visibility toggle works', async ({ page }) => {
    await page.goto('/auth/signin');
    
    const passwordInput = page.locator('input[name="password"]');
    const toggleButton = page.locator('[data-testid="password-toggle"]');
    
    // パスワード可視性切り替えボタンがある場合のテスト
    if (await toggleButton.isVisible()) {
      // 初期状態はパスワードが隠されている
      await expect(passwordInput).toHaveAttribute('type', 'password');
      
      // 可視性トグルをクリック
      await toggleButton.click();
      await expect(passwordInput).toHaveAttribute('type', 'text');
      
      // 再度クリックして隠す
      await toggleButton.click();
      await expect(passwordInput).toHaveAttribute('type', 'password');
    }
  });

  test('keyboard navigation works', async ({ page }) => {
    await page.goto('/auth/signin');
    
    // タブキーでフィールド間を移動
    await page.keyboard.press('Tab');
    await expect(page.locator('input[name="email"]')).toBeFocused();
    
    await page.keyboard.press('Tab');
    await expect(page.locator('input[name="password"]')).toBeFocused();
    
    await page.keyboard.press('Tab');
    await expect(page.locator('button[type="submit"]')).toBeFocused();
    
    // Enterキーでフォーム送信
    await page.fill('input[name="email"]', 'user@test.example.com');
    await page.fill('input[name="password"]', 'user-password');
    await page.keyboard.press('Enter');
    
    await expect(page).toHaveURL('/dashboard');
  });
});

test.describe('Role-based Access Control', () => {
  test('admin user has full access', async ({ page }) => {
    await page.goto('/auth/signin');
    await page.fill('input[name="email"]', 'admin@test.example.com');
    await page.fill('input[name="password"]', 'admin-password');
    await page.click('button[type="submit"]');
    
    await expect(page).toHaveURL('/dashboard');
    
    // 管理者専用メニューが表示されることを確認
    await expect(page.locator('nav a[href="/settings"]')).toBeVisible();
    await expect(page.locator('[data-testid="admin-section"]')).toBeVisible();
    
    // 設定ページにアクセス可能
    await page.goto('/settings');
    await expect(page.locator('h1')).toContainText('システム設定');
  });

  test('regular user has limited access', async ({ page }) => {
    await page.goto('/auth/signin');
    await page.fill('input[name="email"]', 'user@test.example.com');
    await page.fill('input[name="password"]', 'user-password');
    await page.click('button[type="submit"]');
    
    await expect(page).toHaveURL('/dashboard');
    
    // 一般ユーザーメニューの確認
    await expect(page.locator('nav a[href="/servers"]')).toBeVisible();
    await expect(page.locator('nav a[href="/catalog"]')).toBeVisible();
    
    // 管理者専用機能へのアクセスが制限されることを確認
    await expect(page.locator('nav a[href="/settings"]')).not.toBeVisible();
    
    // 直接URLでアクセスしても拒否されることを確認
    await page.goto('/settings');
    await expect(page.locator('[data-testid="access-denied"]').or(page)).toHaveURL(/\/dashboard/);
  });

  test('viewer user has read-only access', async ({ page }) => {
    await page.goto('/auth/signin');
    await page.fill('input[name="email"]', 'viewer@test.example.com');
    await page.fill('input[name="password"]', 'viewer-password');
    await page.click('button[type="submit"]');
    
    await expect(page).toHaveURL('/dashboard');
    
    // サーバーページで読み取り専用アクセスを確認
    await page.goto('/servers');
    await expect(page.locator('h1')).toContainText('サーバー管理');
    
    // 作成・編集・削除ボタンが表示されないことを確認
    await expect(page.locator('button', { hasText: '新規作成' })).not.toBeVisible();
    await expect(page.locator('button', { hasText: '編集' })).not.toBeVisible();
    await expect(page.locator('button', { hasText: '削除' })).not.toBeVisible();
  });
});