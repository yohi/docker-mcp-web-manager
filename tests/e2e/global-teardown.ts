/**
 * Playwright グローバルティアダウン
 * 
 * 機能要件：
 * - E2Eテスト環境のクリーンアップ
 * - テスト結果の集約
 * - レポートの生成
 * - 一時ファイルの削除
 */

import { FullConfig } from '@playwright/test'
import path from 'path'
import fs from 'fs/promises'

async function globalTeardown(config: FullConfig) {
  console.log('🧹 E2E テスト グローバルティアダウンを開始...')

  try {
    // テスト結果の集約
    await aggregateTestResults()
    
    // 一時ファイルのクリーンアップ
    await cleanupTemporaryFiles()
    
    // テストサマリーの生成
    await generateTestSummary()
    
    console.log('✅ E2E テスト グローバルティアダウンが完了しました')
  } catch (error) {
    console.error('❌ E2E テスト グローバルティアダウンでエラーが発生:', error)
    // ティアダウンエラーはテストを失敗させない
  }
}

/**
 * テスト結果を集約
 */
async function aggregateTestResults() {
  try {
    const testResultsDir = path.join(process.cwd(), 'test-results')
    const playwrightReportDir = path.join(process.cwd(), 'playwright-report')
    
    // テスト結果ファイルの存在確認
    const resultsExist = await fs.access(testResultsDir).then(() => true).catch(() => false)
    const reportExists = await fs.access(playwrightReportDir).then(() => true).catch(() => false)
    
    const summary = {
      timestamp: new Date().toISOString(),
      testResultsGenerated: resultsExist,
      htmlReportGenerated: reportExists,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      },
    }
    
    // E2E結果JSONが存在する場合は統計情報を追加
    const e2eResultsPath = path.join(testResultsDir, 'e2e-results.json')
    try {
      await fs.access(e2eResultsPath)
      const e2eResults = JSON.parse(await fs.readFile(e2eResultsPath, 'utf8'))
      
      summary.statistics = {
        totalTests: e2eResults.suites?.reduce((total: number, suite: any) => {
          return total + (suite.specs?.length || 0)
        }, 0) || 0,
        passedTests: e2eResults.suites?.reduce((passed: number, suite: any) => {
          return passed + (suite.specs?.filter((spec: any) => spec.ok).length || 0)
        }, 0) || 0,
        failedTests: e2eResults.suites?.reduce((failed: number, suite: any) => {
          return failed + (suite.specs?.filter((spec: any) => !spec.ok).length || 0)
        }, 0) || 0,
        duration: e2eResults.stats?.duration || 0,
      }
    } catch (error) {
      console.log('📊 E2E結果統計の生成をスキップしました')
    }
    
    await fs.writeFile(
      path.join(testResultsDir, 'e2e-summary.json'),
      JSON.stringify(summary, null, 2)
    )
    
    console.log('📈 テスト結果を集約しました')
  } catch (error) {
    console.warn('⚠️ テスト結果集約中にエラー:', error)
  }
}

/**
 * 一時ファイルをクリーンアップ
 */
async function cleanupTemporaryFiles() {
  try {
    const temporaryFiles = [
      'test-results/admin-auth.json',
      'test-results/user-auth.json',
      'test-results/e2e-mock-data.json',
    ]
    
    for (const filePath of temporaryFiles) {
      try {
        await fs.access(path.join(process.cwd(), filePath))
        await fs.unlink(path.join(process.cwd(), filePath))
        console.log(`🗑️ 一時ファイルを削除: ${filePath}`)
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          console.warn(`⚠️ 一時ファイル削除に失敗: ${filePath}`, error.message)
        }
      }
    }
  } catch (error) {
    console.warn('⚠️ 一時ファイルクリーンアップ中にエラー:', error)
  }
}

/**
 * テストサマリーを生成
 */
async function generateTestSummary() {
  try {
    const summaryPath = path.join(process.cwd(), 'test-results', 'e2e-summary.json')
    
    try {
      await fs.access(summaryPath)
      const summary = JSON.parse(await fs.readFile(summaryPath, 'utf8'))
      
      // コンソール出力用のサマリー
      console.log('\n📋 E2E テスト サマリー')
      console.log('================================')
      console.log(`実行時刻: ${summary.timestamp}`)
      console.log(`Node.js版: ${summary.environment.nodeVersion}`)
      console.log(`プラットフォーム: ${summary.environment.platform}`)
      
      if (summary.statistics) {
        console.log(`総テスト数: ${summary.statistics.totalTests}`)
        console.log(`成功: ${summary.statistics.passedTests}`)
        console.log(`失敗: ${summary.statistics.failedTests}`)
        console.log(`実行時間: ${Math.round(summary.statistics.duration / 1000)}秒`)
      }
      
      console.log(`HTMLレポート: ${summary.htmlReportGenerated ? '生成済み' : '未生成'}`)
      console.log('================================\n')
      
      // CI環境用の追加情報
      if (process.env.CI) {
        console.log('::group::E2E Test Summary')
        console.log(JSON.stringify(summary, null, 2))
        console.log('::endgroup::')
      }
      
    } catch (error) {
      console.log('📋 テストサマリー情報が利用できません')
    }
    
  } catch (error) {
    console.warn('⚠️ テストサマリー生成中にエラー:', error)
  }
}

export default globalTeardown