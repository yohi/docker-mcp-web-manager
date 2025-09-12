import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authConfig } from '@/lib/auth/auth-config';

// グローバルなSSE接続管理
const connections = new Map<string, {
  controller: ReadableStreamDefaultController;
  userId: string;
  lastActivity: Date;
}>();

// ハートビート間隔（30秒）
const HEARTBEAT_INTERVAL = 30000;
const CONNECTION_TIMEOUT = 60000; // 1分

export async function GET(request: NextRequest) {
  // 認証チェック
  const session = await getServerSession(authConfig);
  if (!session?.user) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const userId = session.user.id!;
  const connectionId = `${userId}_${Date.now()}`;

  // Server-Sent Events ストリームを作成
  const stream = new ReadableStream({
    start(controller) {
      // 接続を登録
      connections.set(connectionId, {
        controller,
        userId,
        lastActivity: new Date(),
      });

      // 初期メッセージを送信
      const welcomeMessage = {
        type: 'connected',
        data: {
          message: 'リアルタイム通知に接続しました',
          connectionId,
          timestamp: new Date().toISOString(),
        }
      };

      controller.enqueue(`data: ${JSON.stringify(welcomeMessage)}\n\n`);

      // ハートビートを開始
      const heartbeatInterval = setInterval(() => {
        try {
          const heartbeat = {
            type: 'heartbeat',
            data: {
              timestamp: new Date().toISOString(),
              activeConnections: connections.size,
            }
          };
          controller.enqueue(`data: ${JSON.stringify(heartbeat)}\n\n`);
        } catch (error) {
          console.error('ハートビート送信エラー:', error);
          clearInterval(heartbeatInterval);
          connections.delete(connectionId);
        }
      }, HEARTBEAT_INTERVAL);

      // クリーンアップ処理
      const cleanup = () => {
        clearInterval(heartbeatInterval);
        connections.delete(connectionId);
      };

      // 接続切断時のクリーンアップ
      request.signal.addEventListener('abort', cleanup);

      // タイムアウト処理
      setTimeout(() => {
        const connection = connections.get(connectionId);
        if (connection && Date.now() - connection.lastActivity.getTime() > CONNECTION_TIMEOUT) {
          cleanup();
          try {
            controller.close();
          } catch (error) {
            console.error('接続クローズエラー:', error);
          }
        }
      }, CONNECTION_TIMEOUT);
    },
    
    cancel() {
      connections.delete(connectionId);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    },
  });
}

// 特定ユーザーに通知を送信する関数
export function sendNotificationToUser(userId: string, notification: {
  type: string;
  title: string;
  message: string;
  severity?: 'info' | 'success' | 'warning' | 'error';
  data?: any;
}) {
  const message = {
    type: 'notification',
    data: {
      ...notification,
      timestamp: new Date().toISOString(),
    }
  };

  // 該当ユーザーの全接続に通知を送信
  for (const [connectionId, connection] of connections.entries()) {
    if (connection.userId === userId) {
      try {
        connection.controller.enqueue(`data: ${JSON.stringify(message)}\n\n`);
        connection.lastActivity = new Date();
      } catch (error) {
        console.error(`通知送信エラー (connectionId: ${connectionId}):`, error);
        connections.delete(connectionId);
      }
    }
  }
}

// 全ユーザーに通知を送信する関数
export function broadcastNotification(notification: {
  type: string;
  title: string;
  message: string;
  severity?: 'info' | 'success' | 'warning' | 'error';
  data?: any;
}) {
  const message = {
    type: 'broadcast',
    data: {
      ...notification,
      timestamp: new Date().toISOString(),
    }
  };

  // 全接続に通知を送信
  for (const [connectionId, connection] of connections.entries()) {
    try {
      connection.controller.enqueue(`data: ${JSON.stringify(message)}\n\n`);
      connection.lastActivity = new Date();
    } catch (error) {
      console.error(`ブロードキャスト送信エラー (connectionId: ${connectionId}):`, error);
      connections.delete(connectionId);
    }
  }
}

// 接続状況の取得
export function getConnectionStats() {
  const userCounts = new Map<string, number>();
  
  for (const connection of connections.values()) {
    const count = userCounts.get(connection.userId) || 0;
    userCounts.set(connection.userId, count + 1);
  }

  return {
    totalConnections: connections.size,
    uniqueUsers: userCounts.size,
    userConnections: Object.fromEntries(userCounts),
    lastUpdate: new Date().toISOString(),
  };
}