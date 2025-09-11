import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  const { baseURL } = config.projects[0].use;
  
  // ブラウザを起動してアプリケーションの準備状態をチェック
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    // ヘルスチェックエンドポイントでアプリケーションの準備を確認
    await page.goto(`${baseURL}/api/health`, { waitUntil: 'domcontentloaded' });
    
    const response = await page.evaluate(() => {
      return document.body.textContent;
    });
    
    console.log('Health check response:', response);
    
    // 必要に応じてテスト用データの初期化
    // await page.goto(`${baseURL}/api/test/setup`, { waitUntil: 'domcontentloaded' });
    
  } catch (error) {
    console.error('Global setup failed:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

export default globalSetup;