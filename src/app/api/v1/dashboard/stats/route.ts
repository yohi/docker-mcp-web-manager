import { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/response';

// =============================================================================
// /api/v1/dashboard/stats - ダッシュボード統計API
// 認証なしでアクセス可能なダッシュボード統計データを提供
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    // モックデータを返す（実際の実装ではデータベースから取得）
    const stats = {
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
        uptime: '2 days, 14 hours',
        version: '2.0.0',
        lastUpdated: '2025-09-09T22:00:00.000Z', // 固定値でハイドレーションエラーを回避
      },
      resources: {
        cpu: 45, // 固定値を使用してハイドレーションエラーを回避
        memory: 62,
        disk: 28,
      },
    };

    return createSuccessResponse(stats);
  } catch (error) {
    console.error('Dashboard stats API error:', error);
    
    // フォールバック用の空データ
    const fallbackStats = {
      servers: {
        total: 0,
        running: 0,
        stopped: 0,
        error: 0,
      },
      catalog: {
        available: 0,
        installed: 0,
      },
      system: {
        uptime: 'Unknown',
        version: '2.0.0',
        lastUpdated: '2025-09-09T22:00:00.000Z', // 固定値でハイドレーションエラーを回避
      },
      resources: {
        cpu: 0,
        memory: 0,
        disk: 0,
      },
    };

    return createSuccessResponse(fallbackStats);
  }
}