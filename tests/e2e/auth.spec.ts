/**
 * 認証機能 E2E テスト
 * 
 * 機能要件：
 * - ログイン・ログアウト機能の検証
 * - 認証エラーハンドリングの検証
 * - セッション管理の検証
 * - リダイレクト動作の検証
 */

import { test, expect, Page } from '@playwright/test'

test.describe('認証機能 E2E テスト', () => {
  test.beforeEach(async ({ page }) => {
    // 各テスト前に認証状態をクリア
    await page.context().clearCookies()
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
  })

  test.describe('ログイン機能', () => {
    test('有効な認証情報でログインできる', async ({ page }) => {
      // ログインページに移動
      await page.goto('/login')
      
      // ログインフォームの存在確認
      await expect(page.locator('form')).toBeVisible()
      await expect(page.locator('input[name="email"]')).toBeVisible()
      await expect(page.locator('input[name="password"]')).toBeVisible()
      
      // 認証情報を入力
      await page.fill('input[name="email"]', 'admin@test.com')
      await page.fill('input[name="password"]', 'test-password-123')
      
      // ログインボタンをクリック
      await page.click('button[type="submit"]')
      
      // ダッシュボードへのリダイレクト確認
      await expect(page).toHaveURL(/.*\/dashboard/)
      
      // ダッシュボードコンテンツの確認
      await expect(page.locator('text=ダッシュボード')).toBeVisible()
      await expect(page.locator('text=サーバー管理')).toBeVisible()
    })

    test('無効な認証情報でエラーメッセージが表示される', async ({ page }) => {
      await page.goto('/login')
      
      // 無効な認証情報を入力
      await page.fill('input[name="email"]', 'invalid@test.com')
      await page.fill('input[name="password"]', 'wrong-password')
      
      // ログインボタンをクリック
      await page.click('button[type="submit"]')
      
      // エラーメッセージの確認
      await expect(page.locator('text=認証に失敗しました')).toBeVisible()
      
      // ログインページに留まることを確認
      await expect(page).toHaveURL(/.*\/login/)
    })

    test('メールアドレスの形式検証', async ({ page }) => {
      await page.goto('/login')
      
      // 無効なメール形式を入力
      await page.fill('input[name="email"]', 'invalid-email')
      await page.fill('input[name="password"]', 'test-password')
      
      await page.click('button[type="submit"]')
      
      // バリデーションエラーメッセージの確認
      await expect(page.locator('text=正しいメールアドレスを入力してください')).toBeVisible()
    })

    test('パスワードの最小文字数検証', async ({ page }) => {
      await page.goto('/login')
      
      await page.fill('input[name="email"]', 'test@example.com')
      await page.fill('input[name="password"]', '123') // 短すぎるパスワード
      
      await page.click('button[type="submit"]')
      
      // バリデーションエラーメッセージの確認
      await expect(page.locator('text=パスワードは8文字以上で入力してください')).toBeVisible()
    })

    test('空のフィールドでバリデーションエラーが表示される', async ({ page }) => {
      await page.goto('/login')
      
      // 空のフィールドでログイン試行
      await page.click('button[type="submit"]')
      
      // エラーメッセージの確認
      await expect(page.locator('text=メールアドレスは必須です')).toBeVisible()
      await expect(page.locator('text=パスワードは必須です')).toBeVisible()
    })
  })

  test.describe('ログアウト機能', () => {
    test('ログアウト後にログインページにリダイレクトされる', async ({ page }) => {
      // 事前に管理者としてログイン
      await loginAsAdmin(page)
      
      // ダッシュボードでログアウトボタンをクリック
      await page.click('button:has-text("ログアウト")')
      
      // ログアウト確認ダイアログの処理（存在する場合）
      await page.waitForTimeout(500)
      
      // ログインページへのリダイレクト確認
      await expect(page).toHaveURL(/.*\/login/)
      
      // ログインフォームが表示されることを確認
      await expect(page.locator('form')).toBeVisible()
    })

    test('ログアウト後にダッシュボードにアクセスするとログインページにリダイレクトされる', async ({ page }) => {
      // 事前にログインしてからログアウト
      await loginAsAdmin(page)
      await page.click('button:has-text("ログアウト")')
      await expect(page).toHaveURL(/.*\/login/)
      
      // ダッシュボードに直接アクセスを試行
      await page.goto('/dashboard')
      
      // ログインページにリダイレクトされることを確認
      await expect(page).toHaveURL(/.*\/login/)
    })
  })

  test.describe('セッション管理', () => {
    test('ページリロード後もログイン状態が保持される', async ({ page }) => {
      // ログイン
      await loginAsAdmin(page)
      
      // ページリロード
      await page.reload()
      
      // ダッシュボードが表示されることを確認
      await expect(page.locator('text=ダッシュボード')).toBeVisible()
      await expect(page).toHaveURL(/.*\/dashboard/)
    })

    test('複数タブでの同時セッション管理', async ({ browser }) => {
      const context = await browser.newContext()
      
      // タブ1でログイン
      const page1 = await context.newPage()
      await loginAsAdmin(page1)
      
      // タブ2を開いてダッシュボードにアクセス
      const page2 = await context.newPage()
      await page2.goto('/dashboard')
      
      // 両方のタブでダッシュボードが表示されることを確認
      await expect(page1.locator('text=ダッシュボード')).toBeVisible()
      await expect(page2.locator('text=ダッシュボード')).toBeVisible()
      
      // タブ1でログアウト
      await page1.click('button:has-text("ログアウト")')
      
      // タブ2をリロードしてログアウト状態が反映されることを確認
      await page2.reload()
      await expect(page2).toHaveURL(/.*\/login/)
      
      await context.close()
    })
  })

  test.describe('プロバイダー選択', () => {
    test('認証プロバイダーの切り替えができる', async ({ page }) => {
      await page.goto('/login')
      
      // デフォルトでCredentialsプロバイダーが選択されていることを確認
      await expect(page.locator('select[name="provider"]')).toHaveValue('credentials')
      
      // Bitwardenプロバイダーに切り替え
      await page.selectOption('select[name="provider"]', 'bitwarden')
      
      // プロバイダーが変更されたことを確認
      await expect(page.locator('select[name="provider"]')).toHaveValue('bitwarden')
      
      // フォームフィールドが適切に表示されることを確認
      await expect(page.locator('input[name="email"]')).toBeVisible()
      await expect(page.locator('input[name="password"]')).toBeVisible()
    })
  })

  test.describe('リダイレクト動作', () => {
    test('未認証で保護されたページにアクセスするとログインページにリダイレクトされる', async ({ page }) => {
      // 直接ダッシュボードにアクセス試行
      await page.goto('/dashboard')
      
      // ログインページにリダイレクトされることを確認
      await expect(page).toHaveURL(/.*\/login/)
    })

    test('ログイン成功後に元々アクセスしようとしていたページにリダイレクトされる', async ({ page }) => {
      // 保護されたページに直接アクセス（クエリパラメータ付きで）
      await page.goto('/dashboard?tab=servers')
      
      // ログインページにリダイレクトされることを確認
      await expect(page).toHaveURL(/.*\/login/)
      
      // ログイン実行
      await page.fill('input[name="email"]', 'admin@test.com')
      await page.fill('input[name="password"]', 'test-password-123')
      await page.click('button[type="submit"]')
      
      // 元のページ（クエリパラメータ含む）にリダイレクトされることを確認
      await expect(page).toHaveURL(/.*\/dashboard\?tab=servers/)
    })

    test('すでにログイン済みでログインページにアクセスするとダッシュボードにリダイレクトされる', async ({ page }) => {
      // 事前にログイン
      await loginAsAdmin(page)
      
      // ログインページに直接アクセス試行
      await page.goto('/login')
      
      // ダッシュボードにリダイレクトされることを確認
      await expect(page).toHaveURL(/.*\/dashboard/)
    })
  })
})

/**
 * 管理者としてログインするヘルパー関数
 */
async function loginAsAdmin(page: Page) {
  await page.goto('/login')
  await page.fill('input[name="email"]', 'admin@test.com')
  await page.fill('input[name="password"]', 'test-password-123')
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL(/.*\/dashboard/)
}