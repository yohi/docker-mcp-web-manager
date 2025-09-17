import { NextRequest, NextResponse } from 'next/server';

// =============================================================================
// Dashboard Stats API - ダッシュボード統計情報エンドポイント
// システム統計、サーバー状況、リソース使用率等を統合して返却
// =============================================================================

interface DashboardStats {
  servers: {
    total: number;
    running: number;
    stopped: number;
    error: number;
  };
  catalog: {
    available: number;
    installed: number;
  };
  system: {
    uptime: string;
    version: string;
    lastUpdated: string;
  };
  resources: {
    cpu: number;
    memory: number;
    disk: number;
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    console.log('[DASHBOARD_API] 🚀 Dashboard stats API called');

    // 一時的な固定値データ（後で実際のデータソースと接続）
    const mockStats: DashboardStats = {
      servers: {
        total: 3,
        running: 2,
        stopped: 1,
        error: 0,
      },
      catalog: {
        available: 25,
        installed: 3,
      },
      system: {
        uptime: '2d 14h 32m',
        version: '2.0.0',
        lastUpdated: new Date().toISOString(),
      },
      resources: {
        cpu: 15,
        memory: 45,
        disk: 62,
      },
    };

    console.log('[DASHBOARD_API] ✅ Returning mock stats:', mockStats);

    return NextResponse.json({
      success: true,
      data: mockStats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[DASHBOARD_API] ❌ Error fetching dashboard stats:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch dashboard statistics',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}