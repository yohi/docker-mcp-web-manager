import { chromium, FullConfig } from '@playwright/test';

async function globalTeardown(config: FullConfig) {
  const { baseURL } = config.projects[0].use;
  
  // ブラウザを起動してクリーンアップ処理
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    // テスト用データのクリーンアップ
    console.log('Running global teardown...');
    
    // 必要に応じてテストデータの削除
    // await page.goto(`${baseURL}/api/test/cleanup`, { waitUntil: 'domcontentloaded' });
    
  } catch (error) {
    console.error('Global teardown failed:', error);
    // クリーンアップの失敗は警告として扱い、テスト実行は続行
    console.warn('Some cleanup operations failed, but continuing...');
  } finally {
    await browser.close();
  }
}

export default globalTeardown;