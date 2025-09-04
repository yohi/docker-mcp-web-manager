/**
 * メインページコンポーネント
 * Docker MCP Web Managerのホームページ
 */
export default function HomePage() {
  return (
    <main className="container mx-auto px-4 py-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
          Docker MCP Web Manager
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-300 mb-8">
          DockerMCPGatewayの包括的なWeb管理ツール
        </p>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mt-12">
          <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-3">サーバー管理</h2>
            <p className="text-gray-600 dark:text-gray-300">
              MCPサーバーの一覧表示、詳細確認、設定管理
            </p>
          </div>

          <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-3">リアルタイム監視</h2>
            <p className="text-gray-600 dark:text-gray-300">
              ログストリーミング、メトリクス表示、アラート機能
            </p>
          </div>

          <div className="p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-3">セキュリティ</h2>
            <p className="text-gray-600 dark:text-gray-300">認証、シークレット管理、アクセス制御</p>
          </div>
        </div>
      </div>
    </main>
  );
}
