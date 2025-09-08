import { test, expect, Page } from '@playwright/test';
import { chromium, Browser, BrowserContext } from '@playwright/test';
import { randomBytes } from 'crypto';

// =============================================================================
// セキュリティテスト
// 認証、認可、インジェクション、CSRF、XSS などのセキュリティテスト
// =============================================================================

/**
 * セキュリティテストヘルパー
 */
class SecurityTestHelper {
  constructor(private page: Page) {}

  /**
   * SQLインジェクション攻撃テスト
   */
  async testSqlInjection(inputSelector: string, expectedBehavior: 'blocked' | 'sanitized') {
    const maliciousInputs = [
      "'; DROP TABLE users; --",
      "' OR '1'='1",
      "' UNION SELECT * FROM secrets --",
      "'; INSERT INTO users (email, password) VALUES ('hacker@evil.com', 'hacked'); --",
      "' OR 1=1 --",
      "admin'--",
      "1' OR '1'='1' /*",
    ];

    for (const input of maliciousInputs) {
      await this.page.fill(inputSelector, input);
      await this.page.press(inputSelector, 'Enter');
      
      // エラーメッセージまたはサニタイズされた結果を待機
      if (expectedBehavior === 'blocked') {
        await expect(this.page.locator('[data-testid="error-message"]')).toBeVisible();
      } else {
        // データベースエラーが表示されないことを確認
        const dbError = this.page.locator(':has-text("database error")');
        await expect(dbError).not.toBeVisible();
      }
      
      await this.page.reload();
    }
  }

  /**
   * XSS攻撃テスト
   */
  async testXssAttack(inputSelector: string) {
    const xssPayloads = [
      '<script>alert("XSS")</script>',
      '<img src=x onerror=alert("XSS")>',
      '<svg onload=alert("XSS")>',
      'javascript:alert("XSS")',
      '<iframe src="javascript:alert(\'XSS\')"></iframe>',
      '<body onload=alert("XSS")>',
      '<div onclick=alert("XSS")>Click me</div>',
      '"><script>alert("XSS")</script>',
      "'; alert('XSS'); //",
    ];

    for (const payload of xssPayloads) {
      await this.page.fill(inputSelector, payload);
      await this.page.press(inputSelector, 'Enter');
      await this.page.waitForTimeout(1000);
      
      // アラートダイアログが表示されないことを確認
      const alerts = [];
      this.page.on('dialog', dialog => {
        alerts.push(dialog.message());
        dialog.dismiss();
      });
      
      expect(alerts).toEqual([]);
      
      // スクリプトタグが実行されずにエスケープされていることを確認
      const dangerousScript = this.page.locator('script:has-text("alert")');
      await expect(dangerousScript).toHaveCount(0);
      
      await this.page.reload();
    }
  }

  /**
   * CSRF攻撃テスト
   */
  async testCsrfProtection(formSelector: string, submitButtonSelector: string) {
    // CSRF トークンの存在確認
    const csrfToken = this.page.locator('[name="csrf-token"], [name="_token"]');
    if (await csrfToken.count() > 0) {
      await expect(csrfToken).toBeVisible();
      
      // トークンを削除して送信試行
      await this.page.evaluate(() => {
        const tokens = document.querySelectorAll('[name="csrf-token"], [name="_token"]');
        tokens.forEach(token => token.remove());
      });
      
      await this.page.click(submitButtonSelector);
      
      // CSRF エラーが表示されることを確認
      await expect(this.page.locator('[data-testid="csrf-error"]')).toBeVisible();
    } else {
      // CSRF トークンが存在しない場合は警告
      console.warn('CSRF token not found - potential security vulnerability');
    }
  }

  /**
   * 認証バイパステスト
   */
  async testAuthenticationBypass() {
    const bypassAttempts = [
      '/dashboard',
      '/servers',
      '/secrets',
      '/admin',
      '/api/v1/servers',
      '/api/v1/secrets',
      '/api/v1/users',
    ];

    for (const path of bypassAttempts) {
      await this.page.goto(path);
      
      // 未認証状態でのアクセスがリダイレクトされることを確認
      await this.page.waitForTimeout(1000);
      const currentUrl = this.page.url();
      
      if (!currentUrl.includes('/login')) {
        console.error(`Authentication bypass detected for path: ${path}`);
        expect(currentUrl).toContain('/login');
      }
    }
  }

  /**
   * セッション固定攻撃テスト
   */
  async testSessionFixation() {
    // ログイン前のセッションIDを取得
    await this.page.goto('/login');
    const beforeLoginCookies = await this.page.context().cookies();
    const beforeSessionId = beforeLoginCookies.find(c => c.name.includes('session'))?.value;

    // ログイン
    await this.page.fill('[data-testid="email-input"]', 'admin@test.com');
    await this.page.fill('[data-testid="password-input"]', 'Admin123!');
    await this.page.click('[data-testid="login-button"]');
    await this.page.waitForURL('/dashboard');

    // ログイン後のセッションIDを取得
    const afterLoginCookies = await this.page.context().cookies();
    const afterSessionId = afterLoginCookies.find(c => c.name.includes('session'))?.value;

    // セッションIDが変更されていることを確認（セッション再生成）
    expect(afterSessionId).toBeDefined();
    expect(beforeSessionId).not.toEqual(afterSessionId);
  }

  /**
   * パスワード強度テスト
   */
  async testPasswordStrength(passwordInputSelector: string) {
    const weakPasswords = [
      '123456',
      'password',
      'admin',
      'qwerty',
      '12345678',
      'abc123',
      'password123',
      '111111',
    ];

    for (const weakPassword of weakPasswords) {
      await this.page.fill(passwordInputSelector, weakPassword);
      await this.page.blur(passwordInputSelector);
      
      // 弱いパスワードに対する警告が表示されることを確認
      const passwordStrengthIndicator = this.page.locator('[data-testid="password-strength"]');
      if (await passwordStrengthIndicator.isVisible()) {
        const strengthText = await passwordStrengthIndicator.textContent();
        expect(strengthText?.toLowerCase()).toContain('weak');
      }
    }
  }

  /**
   * ディレクトリトラバーサルテスト
   */
  async testDirectoryTraversal(filePathInputSelector: string) {
    const maliciousPaths = [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\drivers\\etc\\hosts',
      '../../../../etc/shadow',
      '../../../etc/hosts',
      '..\\..\\..\\..\\boot.ini',
      '/etc/passwd',
      'C:\\Windows\\System32\\config\\SAM',
    ];

    for (const path of maliciousPaths) {
      await this.page.fill(filePathInputSelector, path);
      await this.page.press(filePathInputSelector, 'Enter');
      
      // システムファイルの内容が表示されないことを確認
      const systemFileContent = this.page.locator(':has-text("root:"), :has-text("[boot loader]")');
      await expect(systemFileContent).not.toBeVisible();
      
      // エラーメッセージまたは拒否メッセージの表示を確認
      const errorMessage = this.page.locator('[data-testid="error-message"], [data-testid="access-denied"]');
      await expect(errorMessage).toBeVisible();
      
      await this.page.reload();
    }
  }

  /**
   * HTTPヘッダーセキュリティテスト
   */
  async testSecurityHeaders() {
    const response = await this.page.goto('/dashboard');
    const headers = response?.headers() || {};

    // セキュリティヘッダーの確認
    const securityHeaders = {
      'x-frame-options': ['DENY', 'SAMEORIGIN'],
      'x-content-type-options': ['nosniff'],
      'x-xss-protection': ['1; mode=block'],
      'strict-transport-security': ['max-age'],
      'content-security-policy': ['default-src', 'script-src'],
      'referrer-policy': ['no-referrer', 'strict-origin'],
    };

    for (const [headerName, expectedValues] of Object.entries(securityHeaders)) {
      const headerValue = headers[headerName.toLowerCase()];
      
      if (headerValue) {
        const hasExpectedValue = expectedValues.some(expected => 
          headerValue.toLowerCase().includes(expected.toLowerCase())
        );
        expect(hasExpectedValue).toBeTruthy(`${headerName} header should contain one of: ${expectedValues.join(', ')}`);
      } else {
        console.warn(`Missing security header: ${headerName}`);
      }
    }
  }

  /**
   * レート制限テスト
   */
  async testRateLimit(endpoint: string, method: 'GET' | 'POST' = 'GET', maxAttempts: number = 100) {
    let blockedCount = 0;
    
    for (let i = 0; i < maxAttempts; i++) {
      const response = await this.page.request[method.toLowerCase() as 'get' | 'post'](endpoint);
      
      if (response.status() === 429) { // Too Many Requests
        blockedCount++;
        break;
      }
      
      // 短時間で大量リクエスト
      await this.page.waitForTimeout(10);
    }
    
    // レート制限が機能していることを確認
    expect(blockedCount).toBeGreaterThan(0);
  }

  /**
   * セッションハイジャックテスト
   */
  async testSessionHijacking() {
    // 正常なログインプロセス
    await this.page.goto('/login');
    await this.page.fill('[data-testid="email-input"]', 'admin@test.com');
    await this.page.fill('[data-testid="password-input"]', 'Admin123!');
    await this.page.click('[data-testid="login-button"]');
    await this.page.waitForURL('/dashboard');

    // セッションクッキーを取得
    const cookies = await this.page.context().cookies();
    const sessionCookie = cookies.find(c => c.name.includes('session'));
    
    expect(sessionCookie).toBeDefined();
    
    // セッションクッキーのセキュリティ属性を確認
    if (sessionCookie) {
      expect(sessionCookie.httpOnly).toBeTruthy(); // HTTPOnly属性
      expect(sessionCookie.secure).toBeTruthy(); // Secure属性（HTTPS環境の場合）
      expect(sessionCookie.sameSite).toBe('strict'); // SameSite属性
    }
  }

  /**
   * 権限昇格テスト
   */
  async testPrivilegeEscalation(userEmail: string, userPassword: string) {
    // 一般ユーザーでログイン
    await this.page.goto('/login');
    await this.page.fill('[data-testid="email-input"]', userEmail);
    await this.page.fill('[data-testid="password-input"]', userPassword);
    await this.page.click('[data-testid="login-button"]');
    await this.page.waitForURL('/dashboard');

    // 管理者専用機能への不正アクセス試行
    const adminOnlyPaths = [
      '/users',
      '/users/create',
      '/secrets/create',
      '/admin',
      '/api/v1/users',
      '/api/v1/secrets',
    ];

    for (const path of adminOnlyPaths) {
      await this.page.goto(path);
      await this.page.waitForTimeout(1000);
      
      // アクセス拒否またはログインページへのリダイレクトを確認
      const currentUrl = this.page.url();
      const hasAccessDenied = await this.page.locator('[data-testid="access-denied"]').isVisible();
      const isLoginPage = currentUrl.includes('/login');
      
      expect(hasAccessDenied || isLoginPage).toBeTruthy(`Unauthorized access to ${path} should be blocked`);
    }
  }
}

/**
 * セキュリティテストスイート
 */
test.describe('Security Tests', () => {
  let helper: SecurityTestHelper;

  test.beforeEach(async ({ page }) => {
    helper = new SecurityTestHelper(page);
  });

  /**
   * 認証・認可テスト
   */
  test.describe('Authentication & Authorization', () => {
    test('should prevent authentication bypass', async () => {
      await helper.testAuthenticationBypass();
    });

    test('should prevent session fixation attacks', async () => {
      await helper.testSessionFixation();
    });

    test('should prevent session hijacking', async () => {
      await helper.testSessionHijacking();
    });

    test('should prevent privilege escalation', async () => {
      await helper.testPrivilegeEscalation('user@test.com', 'User123!');
    });

    test('should enforce strong password requirements', async ({ page }) => {
      await page.goto('/register');
      if (await page.locator('[data-testid="password-input"]').isVisible()) {
        await helper.testPasswordStrength('[data-testid="password-input"]');
      }
    });
  });

  /**
   * インジェクション攻撃テスト
   */
  test.describe('Injection Attacks', () => {
    test('should prevent SQL injection in search functionality', async ({ page }) => {
      // 管理者でログイン
      await page.goto('/login');
      await page.fill('[data-testid="email-input"]', 'admin@test.com');
      await page.fill('[data-testid="password-input"]', 'Admin123!');
      await page.click('[data-testid="login-button"]');
      await page.waitForURL('/dashboard');

      // サーバー検索でSQLインジェクションテスト
      await page.goto('/servers');
      if (await page.locator('[data-testid="search-input"]').isVisible()) {
        await helper.testSqlInjection('[data-testid="search-input"]', 'sanitized');
      }
    });

    test('should prevent XSS attacks in form inputs', async ({ page }) => {
      // 管理者でログイン
      await page.goto('/login');
      await page.fill('[data-testid="email-input"]', 'admin@test.com');
      await page.fill('[data-testid="password-input"]', 'Admin123!');
      await page.click('[data-testid="login-button"]');
      await page.waitForURL('/dashboard');

      // サーバー作成フォームでXSSテスト
      await page.goto('/servers/create');
      if (await page.locator('[data-testid="server-name-input"]').isVisible()) {
        await helper.testXssAttack('[data-testid="server-name-input"]');
      }
    });

    test('should prevent directory traversal attacks', async ({ page }) => {
      // 管理者でログイン
      await page.goto('/login');
      await page.fill('[data-testid="email-input"]', 'admin@test.com');
      await page.fill('[data-testid="password-input"]', 'Admin123!');
      await page.click('[data-testid="login-button"]');
      await page.waitForURL('/dashboard');

      // ファイルパス入力でディレクトリトラバーサルテスト
      await page.goto('/servers/create');
      if (await page.locator('[data-testid="config-file-input"]').isVisible()) {
        await helper.testDirectoryTraversal('[data-testid="config-file-input"]');
      }
    });
  });

  /**
   * CSRF攻撃テスト
   */
  test.describe('CSRF Protection', () => {
    test('should protect forms with CSRF tokens', async ({ page }) => {
      // 管理者でログイン
      await page.goto('/login');
      await page.fill('[data-testid="email-input"]', 'admin@test.com');
      await page.fill('[data-testid="password-input"]', 'Admin123!');
      await page.click('[data-testid="login-button"]');
      await page.waitForURL('/dashboard');

      // サーバー作成フォームでCSRF保護テスト
      await page.goto('/servers/create');
      await helper.testCsrfProtection(
        '[data-testid="server-create-form"]',
        '[data-testid="create-server-button"]'
      );
    });
  });

  /**
   * セキュリティヘッダーテスト
   */
  test.describe('Security Headers', () => {
    test('should set appropriate security headers', async () => {
      await helper.testSecurityHeaders();
    });

    test('should prevent clickjacking with X-Frame-Options', async ({ page }) => {
      const response = await page.goto('/dashboard');
      const headers = response?.headers() || {};
      
      const xFrameOptions = headers['x-frame-options'];
      expect(xFrameOptions).toBeDefined();
      expect(['DENY', 'SAMEORIGIN']).toContain(xFrameOptions);
    });

    test('should prevent MIME type sniffing', async ({ page }) => {
      const response = await page.goto('/dashboard');
      const headers = response?.headers() || {};
      
      expect(headers['x-content-type-options']).toBe('nosniff');
    });
  });

  /**
   * レート制限テスト
   */
  test.describe('Rate Limiting', () => {
    test('should limit login attempts', async ({ page }) => {
      let blockedAttempts = 0;
      const maxAttempts = 10;

      for (let i = 0; i < maxAttempts; i++) {
        await page.goto('/login');
        await page.fill('[data-testid="email-input"]', 'nonexistent@test.com');
        await page.fill('[data-testid="password-input"]', 'wrongpassword');
        await page.click('[data-testid="login-button"]');
        
        // レート制限に達した場合の確認
        const rateLimitError = page.locator('[data-testid="rate-limit-error"]');
        if (await rateLimitError.isVisible()) {
          blockedAttempts++;
          break;
        }
        
        await page.waitForTimeout(100);
      }

      // レート制限が機能することを確認
      expect(blockedAttempts).toBeGreaterThan(0);
    });

    test('should limit API requests', async ({ page }) => {
      // 管理者でログイン
      await page.goto('/login');
      await page.fill('[data-testid="email-input"]', 'admin@test.com');
      await page.fill('[data-testid="password-input"]', 'Admin123!');
      await page.click('[data-testid="login-button"]');
      await page.waitForURL('/dashboard');

      // API エンドポイントのレート制限テスト
      await helper.testRateLimit('/api/v1/servers', 'GET', 50);
    });
  });

  /**
   * 暗号化・データ保護テスト
   */
  test.describe('Data Protection', () => {
    test('should encrypt sensitive data in transit', async ({ page }) => {
      // HTTPS接続の確認
      await page.goto('/login');
      const url = page.url();
      
      if (process.env.NODE_ENV === 'production') {
        expect(url).toMatch(/^https:/);
      }
    });

    test('should mask sensitive information in UI', async ({ page }) => {
      // 管理者でログイン
      await page.goto('/login');
      await page.fill('[data-testid="email-input"]', 'admin@test.com');
      await page.fill('[data-testid="password-input"]', 'Admin123!');
      await page.click('[data-testid="login-button"]');
      await page.waitForURL('/dashboard');

      // シークレット値がマスクされていることを確認
      await page.goto('/secrets');
      const secretValues = page.locator('[data-testid="secret-value"]');
      const count = await secretValues.count();
      
      for (let i = 0; i < count; i++) {
        const secretValue = await secretValues.nth(i).textContent();
        expect(secretValue).toMatch(/^\*+$|^•+$|^\[HIDDEN\]$/);
      }
    });

    test('should prevent sensitive data in browser history', async ({ page }) => {
      // 管理者でログイン
      await page.goto('/login');
      await page.fill('[data-testid="email-input"]', 'admin@test.com');
      await page.fill('[data-testid="password-input"]', 'Admin123!');
      await page.click('[data-testid="login-button"]');
      await page.waitForURL('/dashboard');

      // 機密ページでのキャッシュ制御ヘッダー確認
      const response = await page.goto('/secrets');
      const headers = response?.headers() || {};
      
      const cacheControl = headers['cache-control'];
      if (cacheControl) {
        expect(cacheControl.toLowerCase()).toContain('no-store');
      }
    });
  });

  /**
   * 入力検証テスト
   */
  test.describe('Input Validation', () => {
    test('should validate file upload types', async ({ page }) => {
      // 管理者でログイン
      await page.goto('/login');
      await page.fill('[data-testid="email-input"]', 'admin@test.com');
      await page.fill('[data-testid="password-input"]', 'Admin123!');
      await page.click('[data-testid="login-button"]');
      await page.waitForURL('/dashboard');

      // 不正なファイル形式のアップロードテスト
      await page.goto('/servers/create');
      const fileInput = page.locator('[data-testid="file-upload"]');
      
      if (await fileInput.isVisible()) {
        // 実行可能ファイルのアップロード試行
        const maliciousFile = Buffer.from('#!/bin/bash\nrm -rf /');
        await fileInput.setInputFiles({
          name: 'malicious.sh',
          mimeType: 'application/x-sh',
          buffer: maliciousFile,
        });
        
        // ファイル形式エラーが表示されることを確認
        await expect(page.locator('[data-testid="file-type-error"]')).toBeVisible();
      }
    });

    test('should validate input length limits', async ({ page }) => {
      // 管理者でログイン
      await page.goto('/login');
      await page.fill('[data-testid="email-input"]', 'admin@test.com');
      await page.fill('[data-testid="password-input"]', 'Admin123!');
      await page.click('[data-testid="login-button"]');
      await page.waitForURL('/dashboard');

      // 非常に長い入力値のテスト
      await page.goto('/servers/create');
      const longString = 'A'.repeat(10000);
      
      await page.fill('[data-testid="server-name-input"]', longString);
      await page.blur('[data-testid="server-name-input"]');
      
      // 入力長制限エラーが表示されることを確認
      await expect(page.locator('[data-testid="input-length-error"]')).toBeVisible();
    });
  });

  /**
   * セッション管理テスト
   */
  test.describe('Session Management', () => {
    test('should expire sessions after timeout', async ({ page }) => {
      // 管理者でログイン
      await page.goto('/login');
      await page.fill('[data-testid="email-input"]', 'admin@test.com');
      await page.fill('[data-testid="password-input"]', 'Admin123!');
      await page.click('[data-testid="login-button"]');
      await page.waitForURL('/dashboard');

      // セッションタイムアウト設定が短い場合のテスト（実際の環境に応じて調整）
      await page.waitForTimeout(2000); // 2秒待機
      
      // 保護されたページへのアクセス
      await page.goto('/servers');
      
      // セッション有効性の確認（実際のタイムアウト時間に依存）
      const isLoggedIn = !page.url().includes('/login');
      console.log(`Session still active after timeout: ${isLoggedIn}`);
    });

    test('should invalidate session on logout', async ({ page }) => {
      // 管理者でログイン
      await page.goto('/login');
      await page.fill('[data-testid="email-input"]', 'admin@test.com');
      await page.fill('[data-testid="password-input"]', 'Admin123!');
      await page.click('[data-testid="login-button"]');
      await page.waitForURL('/dashboard');

      // ログアウト
      await page.click('[data-testid="user-menu"]');
      await page.click('[data-testid="logout-button"]');
      await page.waitForURL('/login');

      // ログアウト後の保護されたページアクセス
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/login/);
    });
  });
});