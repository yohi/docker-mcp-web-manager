import { NextResponse } from 'next/server';

/**
 * ヘルスチェックエンドポイント
 * Docker Composeのhealthcheckとプロダクション環境での監視に使用
 */
export async function GET() {
  try {
    // 基本的なシステム情報を収集
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      memory: {
        used: process.memoryUsage().heapUsed / 1024 / 1024, // MB
        total: process.memoryUsage().heapTotal / 1024 / 1024, // MB
      },
      // 将来的にデータベース接続チェックなどを追加予定
      checks: {
        server: 'ok',
        // database: 'ok', // データベース実装後に追加
        // mcpGateway: 'ok', // MCP Gateway統合後に追加
      },
    };

    return NextResponse.json(healthData, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
        details: process.env.NODE_ENV === 'development' ? error : undefined,
      },
      { status: 500 },
    );
  }
}
