/**
 * ダッシュボード機能 E2E テスト
 * 
 * 機能要件：
 * - ダッシュボードの表示とナビゲーション
 * - サーバー管理機能の統合テスト
 * - ユーザー権限による表示制御の検証
 * - リアルタイム更新機能の検証
 */

import { test, expect, Page } from '@playwright/test'

test.describe('ダッシュボード機能 E2E テスト', () => {
  test.beforeEach(async ({ page }) => {
    // 各テスト前に認証状態をクリア
    await page.context().clearCookies()
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
  })

  test.describe('ダッシュボードアクセス', () => {
    test('管理者ユーザーがダッシュボードにアクセスできる', async ({ page }) => {
      await loginAsAdmin(page)
      
      // ダッシュボードメインコンテンツの確認
      await expect(page.locator('text=ダッシュボード')).toBeVisible()
      await expect(page.locator('text=サーバー管理')).toBeVisible()
      
      // ナビゲーションの確認
      await expect(page.locator('nav')).toBeVisible()
      await expect(page.locator('text=概要')).toBeVisible()
      await expect(page.locator('text=サーバー')).toBeVisible()
      
      // 管理者専用機能の確認
      await expect(page.locator('button:has-text("新規サーバー")')).toBeVisible()
      await expect(page.locator('button:has-text("サーバー作成")')).toBeVisible()
    })

    test('一般ユーザーがダッシュボードにアクセスできる', async ({ page }) => {
      await loginAsUser(page)
      
      // ダッシュボードコンテンツの確認
      await expect(page.locator('text=ダッシュボード')).toBeVisible()
      await expect(page.locator('text=サーバー管理')).toBeVisible()
      
      // 一般ユーザーは管理者専用機能が非表示
      await expect(page.locator('button:has-text("新規サーバー")')).not.toBeVisible()
      await expect(page.locator('button:has-text("サーバー作成")')).not.toBeVisible()
    })
  })

  test.describe('サーバー一覧表示', () => {
    test('サーバー一覧が適切に表示される', async ({ page }) => {
      await loginAsAdmin(page)
      
      // サーバー一覧セクションの確認
      await expect(page.locator('[data-testid="server-list"]')).toBeVisible()
      
      // 最低限のサーバーカードが表示されることを確認
      await expect(page.locator('[data-testid="server-card"]').first()).toBeVisible()
      
      // サーバーカードの基本情報確認
      const firstServerCard = page.locator('[data-testid="server-card"]').first()
      await expect(firstServerCard.locator('.server-name')).toBeVisible()
      await expect(firstServerCard.locator('.server-status')).toBeVisible()
      await expect(firstServerCard.locator('.server-image')).toBeVisible()
    })

    test('サーバーステータスが適切に表示される', async ({ page }) => {
      await loginAsAdmin(page)
      
      // 実行中サーバーの確認
      const runningServer = page.locator('[data-testid="server-card"]:has(.status-running)')
      if (await runningServer.count() > 0) {
        await expect(runningServer.first().locator('.status-indicator')).toHaveClass(/.*running.*/)
        await expect(runningServer.first().locator('text=実行中')).toBeVisible()
      }
      
      // 停止中サーバーの確認
      const stoppedServer = page.locator('[data-testid="server-card"]:has(.status-stopped)')
      if (await stoppedServer.count() > 0) {
        await expect(stoppedServer.first().locator('.status-indicator')).toHaveClass(/.*stopped.*/)
        await expect(stoppedServer.first().locator('text=停止中')).toBeVisible()
      }
    })

    test('サーバーの検索・フィルタリング機能', async ({ page }) => {
      await loginAsAdmin(page)
      
      // 検索フィールドの存在確認
      await expect(page.locator('input[placeholder*="検索"]')).toBeVisible()
      
      // サーバー名で検索
      await page.fill('input[placeholder*="検索"]', 'nginx')
      
      // 検索結果の確認
      await page.waitForTimeout(500) // デバウンス待機
      const searchResults = page.locator('[data-testid="server-card"]')
      const count = await searchResults.count()
      
      if (count > 0) {
        // 検索結果にnginxが含まれることを確認
        await expect(searchResults.first().locator('text=nginx')).toBeVisible()
      }
      
      // 検索クリア
      await page.fill('input[placeholder*="検索"]', '')
      await page.waitForTimeout(500)
    })
  })

  test.describe('サーバー操作', () => {
    test('サーバーの詳細表示ができる', async ({ page }) => {
      await loginAsAdmin(page)
      
      // 最初のサーバーカードをクリック
      await page.locator('[data-testid="server-card"]').first().click()
      
      // サーバー詳細モーダルの確認
      await expect(page.locator('[data-testid="server-detail-modal"]')).toBeVisible()
      
      // 詳細情報の確認
      await expect(page.locator('.server-detail-name')).toBeVisible()
      await expect(page.locator('.server-detail-status')).toBeVisible()
      await expect(page.locator('.server-detail-image')).toBeVisible()
      await expect(page.locator('.server-detail-ports')).toBeVisible()
    })

    test('管理者がサーバーを開始できる', async ({ page }) => {
      await loginAsAdmin(page)
      
      // 停止中のサーバーを探す
      const stoppedServer = page.locator('[data-testid="server-card"]:has(.status-stopped)')
      
      if (await stoppedServer.count() > 0) {
        // サーバーカードをクリックして詳細表示
        await stoppedServer.first().click()
        
        // 開始ボタンをクリック
        await page.click('button:has-text("開始")')
        
        // 確認ダイアログの処理（存在する場合）
        const confirmDialog = page.locator('text=サーバーを開始しますか？')
        if (await confirmDialog.isVisible()) {
          await page.click('button:has-text("開始")')
        }
        
        // 成功メッセージの確認
        await expect(page.locator('text=サーバーを開始しました')).toBeVisible({ timeout: 10000 })
      }
    })

    test('管理者がサーバーを停止できる', async ({ page }) => {
      await loginAsAdmin(page)
      
      // 実行中のサーバーを探す
      const runningServer = page.locator('[data-testid="server-card"]:has(.status-running)')
      
      if (await runningServer.count() > 0) {
        // サーバーカードをクリックして詳細表示
        await runningServer.first().click()
        
        // 停止ボタンをクリック
        await page.click('button:has-text("停止")')
        
        // 確認ダイアログの処理
        const confirmDialog = page.locator('text=サーバーを停止しますか？')
        if (await confirmDialog.isVisible()) {
          await page.click('button:has-text("停止")')
        }
        
        // 成功メッセージの確認
        await expect(page.locator('text=サーバーを停止しました')).toBeVisible({ timeout: 10000 })
      }
    })

    test('一般ユーザーはサーバー操作ボタンが非表示になる', async ({ page }) => {
      await loginAsUser(page)
      
      // サーバーカードをクリック
      await page.locator('[data-testid="server-card"]').first().click()
      
      // 詳細モーダルは表示される
      await expect(page.locator('[data-testid="server-detail-modal"]')).toBeVisible()
      
      // 操作ボタンが非表示であることを確認
      await expect(page.locator('button:has-text("開始")')).not.toBeVisible()
      await expect(page.locator('button:has-text("停止")')).not.toBeVisible()
      await expect(page.locator('button:has-text("削除")')).not.toBeVisible()
    })
  })

  test.describe('サーバー作成', () => {
    test('管理者がサーバーを作成できる', async ({ page }) => {
      await loginAsAdmin(page)
      
      // 新規サーバーボタンをクリック
      await page.click('button:has-text("新規サーバー")')
      
      // サーバー作成フォームの確認
      await expect(page.locator('[data-testid="server-create-form"]')).toBeVisible()
      
      // フォーム入力
      await page.fill('input[name="name"]', 'E2E Test Server')
      await page.fill('input[name="image"]', 'nginx:alpine')
      await page.fill('input[name="hostPort"]', '8081')
      await page.fill('input[name="containerPort"]', '80')
      
      // 作成ボタンをクリック
      await page.click('button[type="submit"]')
      
      // 成功メッセージの確認
      await expect(page.locator('text=サーバーを作成しました')).toBeVisible({ timeout: 10000 })
      
      // サーバー一覧に新しいサーバーが追加されたことを確認
      await expect(page.locator('text=E2E Test Server')).toBeVisible()
    })

    test('サーバー作成フォームのバリデーション', async ({ page }) => {
      await loginAsAdmin(page)
      
      await page.click('button:has-text("新規サーバー")')
      
      // 空のフォームで送信
      await page.click('button[type="submit"]')
      
      // バリデーションエラーメッセージの確認
      await expect(page.locator('text=サーバー名は必須です')).toBeVisible()
      await expect(page.locator('text=イメージ名は必須です')).toBeVisible()
    })
  })

  test.describe('ダッシュボード統計', () => {
    test('サーバー統計情報が表示される', async ({ page }) => {
      await loginAsAdmin(page)
      
      // 統計情報カードの確認
      await expect(page.locator('[data-testid="stats-total-servers"]')).toBeVisible()
      await expect(page.locator('[data-testid="stats-running-servers"]')).toBeVisible()
      await expect(page.locator('[data-testid="stats-stopped-servers"]')).toBeVisible()
      
      // 統計数値の確認（数値が表示されることを確認）
      const totalServers = page.locator('[data-testid="stats-total-servers"] .stat-value')
      await expect(totalServers).toBeVisible()
      
      const runningServers = page.locator('[data-testid="stats-running-servers"] .stat-value')
      await expect(runningServers).toBeVisible()
    })
  })

  test.describe('レスポンシブデザイン', () => {
    test('モバイル表示でダッシュボードが適切に表示される', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 }) // iPhone 6/7/8サイズ
      await loginAsAdmin(page)
      
      // モバイルメニューの確認
      const mobileMenuButton = page.locator('[data-testid="mobile-menu-button"]')
      if (await mobileMenuButton.isVisible()) {
        await mobileMenuButton.click()
        
        // メニューが開くことを確認
        await expect(page.locator('[data-testid="mobile-menu"]')).toBeVisible()
      }
      
      // サーバーカードがモバイル表示に適応していることを確認
      await expect(page.locator('[data-testid="server-list"]')).toBeVisible()
      
      const serverCards = page.locator('[data-testid="server-card"]')
      if (await serverCards.count() > 0) {
        await expect(serverCards.first()).toBeVisible()
      }
    })

    test('タブレット表示でダッシュボードが適切に表示される', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 }) // iPad サイズ
      await loginAsAdmin(page)
      
      // タブレット表示での確認
      await expect(page.locator('text=ダッシュボード')).toBeVisible()
      await expect(page.locator('[data-testid="server-list"]')).toBeVisible()
      
      // サーバーカードのグリッド表示確認
      const serverCards = page.locator('[data-testid="server-card"]')
      if (await serverCards.count() > 0) {
        await expect(serverCards.first()).toBeVisible()
      }
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

/**
 * 一般ユーザーとしてログインするヘルパー関数
 */
async function loginAsUser(page: Page) {
  await page.goto('/login')
  await page.fill('input[name="email"]', 'user@test.com')
  await page.fill('input[name="password"]', 'test-password-123')
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL(/.*\/dashboard/)
}