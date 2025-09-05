/**
 * Jest グローバルティアダウンファイル
 * 
 * 機能要件：
 * - テスト環境のクリーンアップ
 * - 一時ファイルの削除
 * - リソースの解放
 * - テストレポートの生成
 */

const fs = require('fs/promises')
const path = require('path')

module.exports = async () => {
  console.log('🧹 グローバルテストティアダウンを開始...')

  try {
    // テスト用一時ファイルのクリーンアップ
    await cleanupTempFiles()

    // テストレポートの生成
    await generateTestReport()

    console.log('✅ グローバルテストティアダウンが完了しました')
  } catch (error) {
    console.error('❌ グローバルテストティアダウンでエラーが発生:', error)
    // ティアダウンエラーはテストを失敗させない
  }
}

/**
 * 一時ファイルをクリーンアップ
 */
async function cleanupTempFiles() {
  try {
    const tempPaths = [
      'tests/fixtures',
      // 注意: test-results と coverage は削除しない（CI/CDで使用）
    ]

    for (const tempPath of tempPaths) {
      const fullPath = path.join(process.cwd(), tempPath)
      try {
        await fs.access(fullPath)
        await fs.rm(fullPath, { recursive: true, force: true })
        console.log(`🗑️ 一時ディレクトリを削除: ${tempPath}`)
      } catch (error) {
        // ファイルが存在しない場合は無視
        if (error.code !== 'ENOENT') {
          console.warn(`⚠️ 一時ファイル削除に失敗: ${tempPath}`, error.message)
        }
      }
    }
  } catch (error) {
    console.warn('⚠️ 一時ファイルクリーンアップ中にエラー:', error.message)
  }
}

/**
 * テストレポートを生成
 */
async function generateTestReport() {
  try {
    const reportData = {
      timestamp: new Date().toISOString(),
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        testEnvironment: process.env.NODE_ENV,
      },
      configuration: {
        jestVersion: require('jest/package.json').version,
        testTimeout: 10000,
        maxWorkers: '50%',
      },
      summary: 'テスト実行完了',
    }

    const reportPath = path.join(process.cwd(), 'test-results', 'test-report.json')
    await fs.writeFile(reportPath, JSON.stringify(reportData, null, 2), 'utf8')
    
    console.log('📊 テストレポートを生成しました: test-results/test-report.json')
  } catch (error) {
    console.warn('⚠️ テストレポート生成に失敗:', error.message)
  }
}