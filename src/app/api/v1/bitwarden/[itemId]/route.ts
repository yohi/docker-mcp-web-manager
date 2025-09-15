import { NextRequest, NextResponse } from 'next/server';
import {
  getBitwardenClient,
  checkBitwardenSession,
  attemptSessionRecovery
} from '@/lib/auth/bitwarden-instance';

// =============================================================================
// Bitwarden特定アイテム API エンドポイント
// 特定のBitwardenアイテムから値を取得
// =============================================================================

/**
 * 特定Bitwardenアイテムの値取得
 * GET /api/v1/bitwarden/[itemId]?field=fieldName
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { itemId: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const field = searchParams.get('field');
    const { itemId } = params;

    if (!itemId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'BITWARDEN_011',
            message: 'アイテムIDは必須です'
          }
        },
        { status: 400 }
      );
    }

    // グローバルBitwardenクライアントを取得
    const bitwardenClient = getBitwardenClient();

    // CLI利用可能性確認
    const isAvailable = await bitwardenClient.isAvailable();
    if (!isAvailable) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'BITWARDEN_001',
            message: 'Bitwarden CLIが利用できません'
          }
        },
        { status: 503 }
      );
    }

    // セッション復旧を試行
    await attemptSessionRecovery();

    // 認証状態確認
    const sessionCheck = await checkBitwardenSession();
    if (!sessionCheck.isUnlocked) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'BITWARDEN_002',
            message: sessionCheck.status === 'locked'
              ? 'Bitwardenがロックされています。アンロックしてください。'
              : 'Bitwardenにログインしていません。',
            currentStatus: {
              status: sessionCheck.status,
              userEmail: sessionCheck.userEmail,
              isLoggedIn: sessionCheck.isLoggedIn
            }
          }
        },
        { status: 401 }
      );
    }

    // アイテム取得
    const result = await bitwardenClient.getItem(itemId);

    if (!result.success || !result.item) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'BITWARDEN_012',
            message: result.error || 'アイテムが見つかりません'
          }
        },
        { status: 404 }
      );
    }

    const item = result.item;

    if (field) {
      // 特定フィールドの値を取得
      const value = getFieldValue(item, field);

      if (value === null) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'BITWARDEN_013',
              message: `フィールド '${field}' が見つかりません`
            }
          },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          itemId: item.id,
          itemName: item.name,
          field: field,
          value: value,
          type: getFieldType(item, field)
        }
      });
    } else {
      // アイテムの詳細情報（値は含めない）を返却
      return NextResponse.json({
        success: true,
        data: {
          id: item.id,
          name: item.name,
          type: item.type,
          favorite: item.favorite,
          availableFields: getAvailableFields(item)
        }
      });
    }

  } catch (error) {
    console.error('Bitwarden item API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'BITWARDEN_004',
          message: 'Bitwarden APIでエラーが発生しました'
        }
      },
      { status: 500 }
    );
  }
}

/**
 * Bitwardenアイテムから特定フィールドの値を取得
 */
function getFieldValue(item: any, fieldName: string): string | null {
  // ログインアイテムの標準フィールド
  if (item.type === 1 && item.login) {
    switch (fieldName.toLowerCase()) {
      case 'username':
        return item.login.username || null;
      case 'password':
        return item.login.password || null;
      case 'totp':
        return item.login.totp || null;
    }
  }

  // セキュアメモ
  if (item.type === 2 && fieldName.toLowerCase() === 'notes') {
    return item.notes || null;
  }

  // カスタムフィールド
  if (item.fields) {
    const field = item.fields.find((f: any) =>
      f.name.toLowerCase() === fieldName.toLowerCase()
    );
    if (field) {
      return field.value || null;
    }
  }

  return null;
}

/**
 * フィールドタイプを取得
 */
function getFieldType(item: any, fieldName: string): 'text' | 'password' | 'hidden' {
  // ログインアイテムの標準フィールド
  if (item.type === 1 && item.login) {
    switch (fieldName.toLowerCase()) {
      case 'username':
        return 'text';
      case 'password':
      case 'totp':
        return 'password';
    }
  }

  // セキュアメモ
  if (item.type === 2 && fieldName.toLowerCase() === 'notes') {
    return 'hidden';
  }

  // カスタムフィールド
  if (item.fields) {
    const field = item.fields.find((f: any) =>
      f.name.toLowerCase() === fieldName.toLowerCase()
    );
    if (field) {
      return field.type === 1 ? 'hidden' : field.type === 0 ? 'text' : 'text';
    }
  }

  return 'text';
}

/**
 * Bitwardenアイテムから利用可能なフィールドを抽出
 */
function getAvailableFields(item: any): Array<{ name: string; type: 'text' | 'password' | 'hidden' }> {
  const fields: Array<{ name: string; type: 'text' | 'password' | 'hidden' }> = [];

  // ログインアイテムの場合
  if (item.type === 1 && item.login) {
    if (item.login.username) {
      fields.push({ name: 'Username', type: 'text' });
    }
    if (item.login.password) {
      fields.push({ name: 'Password', type: 'password' });
    }
    if (item.login.totp) {
      fields.push({ name: 'TOTP', type: 'password' });
    }
  }

  // カスタムフィールド
  if (item.fields) {
    item.fields.forEach((field: any) => {
      const fieldType = field.type === 1 ? 'hidden' : field.type === 0 ? 'text' : 'text';
      fields.push({
        name: field.name,
        type: fieldType
      });
    });
  }

  // セキュアメモの場合
  if (item.type === 2 && item.notes) {
    fields.push({ name: 'Notes', type: 'hidden' });
  }

  return fields;
}