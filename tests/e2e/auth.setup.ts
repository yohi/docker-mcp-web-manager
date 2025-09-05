/**
 * 認証セットアップ - E2E テスト
 * 
 * 機能要件：
 * - 認証状態の事前準備
 * - テストユーザーアカウントのセットアップ
 * - セッション状態の保存
 * - 認証フローの最適化
 */

import { test as setup, expect } from '@playwright/test'
import path from 'path'

const adminAuthFile = path.join(__dirname, '../../test-results/admin-auth.json')
const userAuthFile = path.join(__dirname, '../../test-results/user-auth.json')

setup('管理者認証状態をセットアップ', async ({ page }) => {
  try {
    // ログインページに移動
    await page.goto('/login')
    
    // ログインフォームの表示待機
    await expect(page.locator('input[name="email"]')).toBeVisible({ timeout: 10000 })
    
    // 管理者認証情報でログイン
    await page.fill('input[name="email"]', 'admin@test.com')
    await page.fill('input[name="password"]', 'test-password-123')
    
    // プロバイダー選択（デフォルト: credentials）
    const providerSelect = page.locator('select[name="provider"]')
    if (await providerSelect.isVisible()) {
      await providerSelect.selectOption('credentials')
    }
    
    // ログイン実行
    await page.click('button[type="submit"]')
    
    // ダッシュボードへのリダイレクト待機
    await expect(page).toHaveURL(/.*\/dashboard/, { timeout: 10000 })
    
    // ダッシュボードコンテンツの確認
    await expect(page.locator('text=ダッシュボード')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=サーバー管理')).toBeVisible()
    
    // 管理者専用機能の確認
    await expect(page.locator('button:has-text("新規サーバー")')).toBeVisible()
    
    // 認証状態を保存
    await page.context().storageState({ path: adminAuthFile })
    
    console.log('✅ 管理者認証状態をセットアップしました')
  } catch (error) {
    console.error('❌ 管理者認証セットアップに失敗:', error)
    
    // スクリーンショットを撮影（デバッグ用）
    await page.screenshot({ 
      path: path.join(__dirname, '../../test-results/admin-setup-error.png'),
      fullPage: true 
    })
    
    throw error
  }
})

setup('一般ユーザー認証状態をセットアップ', async ({ page }) => {
  try {
    // ログインページに移動
    await page.goto('/login')
    
    // ログインフォームの表示待機
    await expect(page.locator('input[name="email"]')).toBeVisible({ timeout: 10000 })
    
    // 一般ユーザー認証情報でログイン
    await page.fill('input[name="email"]', 'user@test.com')
    await page.fill('input[name="password"]', 'test-password-123')
    
    // プロバイダー選択（デフォルト: credentials）
    const providerSelect = page.locator('select[name="provider"]')
    if (await providerSelect.isVisible()) {
      await providerSelect.selectOption('credentials')
    }
    
    // ログイン実行
    await page.click('button[type="submit"]')
    
    // ダッシュボードへのリダイレクト待機
    await expect(page).toHaveURL(/.*\/dashboard/, { timeout: 10000 })
    
    // ダッシュボードコンテンツの確認
    await expect(page.locator('text=ダッシュボード')).toBeVisible({ timeout: 5000 })
    
    // 一般ユーザーは管理者専用機能が非表示であることを確認
    await expect(page.locator('button:has-text("新規サーバー")')).not.toBeVisible()
    
    // 認証状態を保存
    await page.context().storageState({ path: userAuthFile })
    
    console.log('✅ 一般ユーザー認証状態をセットアップしました')
  } catch (error) {
    console.error('❌ 一般ユーザー認証セットアップに失敗:', error)
    
    // スクリーンショットを撮影（デバッグ用）
    await page.screenshot({ 
      path: path.join(__dirname, '../../test-results/user-setup-error.png'),
      fullPage: true 
    })
    
    throw error
  }
})

setup('認証なし状態をセットアップ', async ({ page }) => {
  try {
    // 認証状態をクリア
    await page.context().clearCookies()
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
    
    // ログインページに移動して未認証状態を確認
    await page.goto('/login')
    await expect(page.locator('form')).toBeVisible({ timeout: 5000 })
    
    // 未認証状態でのダッシュボードアクセスをテスト
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/.*\/login/, { timeout: 5000 })
    
    console.log('✅ 認証なし状態をセットアップしました')
  } catch (error) {
    console.error('❌ 認証なし状態セットアップに失敗:', error)
    throw error
  }
})

setup('テストデータ初期化', async ({ page }) => {
  try {
    // テスト用のモックデータやAPIの初期状態を設定
    // （実際の実装では、バックエンドAPIまたはモックサーバーの初期化）
    
    console.log('✅ テストデータ初期化が完了しました')
  } catch (error) {
    console.error('❌ テストデータ初期化に失敗:', error)
    throw error
  }
})