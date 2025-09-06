export default function HomePage() {
  return (
    <div className='min-h-screen bg-background'>
      <div className='container mx-auto px-4 py-8'>
        <div className='max-w-4xl mx-auto'>
          <h1 className='text-4xl font-bold text-center mb-8'>
            Docker MCP Web Manager
          </h1>
          <div className='bg-card rounded-lg p-6 shadow-sm border'>
            <h2 className='text-2xl font-semibold mb-4'>
              プロジェクトセットアップが完了しました
            </h2>
            <p className='text-muted-foreground mb-4'>
              Docker MCP Web Managerの基本的なプロジェクト構造とコア設定が完了しました。
            </p>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <div className='p-4 bg-muted rounded-lg'>
                <h3 className='font-semibold mb-2'>技術スタック</h3>
                <ul className='text-sm space-y-1'>
                  <li>• Next.js 15.5.2</li>
                  <li>• Node.js 24.7.0</li>
                  <li>• TypeScript 5.9</li>
                  <li>• Tailwind CSS 4.1.13</li>
                  <li>• Drizzle ORM 0.44.5</li>
                  <li>• SQLite 3.50.4</li>
                </ul>
              </div>
              <div className='p-4 bg-muted rounded-lg'>
                <h3 className='font-semibold mb-2'>Docker環境</h3>
                <ul className='text-sm space-y-1'>
                  <li>• マルチステージビルド</li>
                  <li>• 開発・本番環境対応</li>
                  <li>• セキュリティ強化</li>
                  <li>• ヘルスチェック対応</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}