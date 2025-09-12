import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authConfig } from '@/lib/auth/auth-config';
import { z } from 'zod';
import { sendNotificationToUser, broadcastNotification } from '../sse/route';

// 通知送信スキーマ
const NotificationSchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1),
  message: z.string().min(1),
  severity: z.enum(['info', 'success', 'warning', 'error']).optional().default('info'),
  targetUserId: z.string().optional(), // 指定なしの場合はブロードキャスト
  data: z.any().optional(),
});

export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const session = await getServerSession(authConfig);
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 管理者権限チェック（必要に応じて）
    // if (session.user.role !== 'admin') {
    //   return NextResponse.json(
    //     { error: 'Forbidden - Admin access required' },
    //     { status: 403 }
    //   );
    // }

    const body = await request.json();
    const validatedData = NotificationSchema.parse(body);

    const notification = {
      type: validatedData.type,
      title: validatedData.title,
      message: validatedData.message,
      severity: validatedData.severity,
      data: validatedData.data,
    };

    // 個別ユーザーか全体ブロードキャストかを判定
    if (validatedData.targetUserId) {
      sendNotificationToUser(validatedData.targetUserId, notification);
      
      return NextResponse.json({
        success: true,
        message: `通知をユーザー ${validatedData.targetUserId} に送信しました`,
        notification,
      });
    } else {
      broadcastNotification(notification);
      
      return NextResponse.json({
        success: true,
        message: '通知を全ユーザーにブロードキャストしました',
        notification,
      });
    }

  } catch (error) {
    console.error('通知送信エラー:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Invalid request data',
          details: error.errors 
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// 通知統計の取得
export async function GET(request: NextRequest) {
  try {
    // 認証チェック
    const session = await getServerSession(authConfig);
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 動的インポートを使用して接続統計を取得
    const { getConnectionStats } = await import('../sse/route');
    const stats = getConnectionStats();

    return NextResponse.json({
      success: true,
      stats,
    });

  } catch (error) {
    console.error('通知統計取得エラー:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}