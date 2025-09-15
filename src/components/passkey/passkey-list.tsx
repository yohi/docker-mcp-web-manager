'use client';

import { useState, useEffect } from 'react';
import {
  KeyIcon,
  TrashIcon,
  PencilIcon,
  DevicePhoneMobileIcon,
  ComputerDesktopIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';
import { ButtonLoading } from '@/components/common/LoadingSpinner';

// =============================================================================
// Passkey List Component
// パスキー一覧・管理コンポーネント
// =============================================================================

interface Passkey {
  id: string;
  name?: string;
  credentialId: string;
  credentialDeviceType: 'singleDevice' | 'multiDevice';
  credentialBackedUp: boolean;
  transports?: string[];
  lastUsedAt?: Date;
  createdAt: Date;
}

interface PasskeyListProps {
  onPasskeyDeleted?: (passkeyId: string) => void;
  onPasskeyRenamed?: (passkeyId: string, newName: string) => void;
}

export function PasskeyList({ onPasskeyDeleted, onPasskeyRenamed }: PasskeyListProps) {
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadPasskeys();
  }, []);

  const loadPasskeys = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/auth/passkey/manage');

      if (!response.ok) {
        throw new Error('パスキー一覧の取得に失敗しました');
      }

      const { data } = await response.json();
      setPasskeys(data.passkeys || []);
      setError('');
    } catch (err) {
      console.error('Failed to load passkeys:', err);
      setError(err instanceof Error ? err.message : 'パスキーの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePasskey = async (passkeyId: string) => {
    if (!confirm('このパスキーを削除してもよろしいですか？')) {
      return;
    }

    try {
      setDeletingId(passkeyId);
      const response = await fetch(`/api/auth/passkey/manage?id=${passkeyId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('パスキーの削除に失敗しました');
      }

      setPasskeys(prev => prev.filter(p => p.id !== passkeyId));

      if (onPasskeyDeleted) {
        onPasskeyDeleted(passkeyId);
      }
    } catch (err) {
      console.error('Failed to delete passkey:', err);
      setError(err instanceof Error ? err.message : 'パスキーの削除に失敗しました');
    } finally {
      setDeletingId(null);
    }
  };

  const handleStartEdit = (passkey: Passkey) => {
    setEditingId(passkey.id);
    setEditName(passkey.name || '');
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) {
      return;
    }

    try {
      const response = await fetch('/api/auth/passkey/manage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passkeyId: editingId,
          name: editName.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error('パスキー名の更新に失敗しました');
      }

      setPasskeys(prev => prev.map(p =>
        p.id === editingId ? { ...p, name: editName.trim() } : p
      ));

      if (onPasskeyRenamed) {
        onPasskeyRenamed(editingId, editName.trim());
      }

      setEditingId(null);
      setEditName('');
    } catch (err) {
      console.error('Failed to rename passkey:', err);
      setError(err instanceof Error ? err.message : 'パスキー名の更新に失敗しました');
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  const getDeviceIcon = (passkey: Passkey) => {
    const transports = passkey.transports || [];

    if (transports.includes('internal')) {
      return <DevicePhoneMobileIcon className="h-5 w-5 text-gray-500" />;
    } else if (transports.includes('usb') || transports.includes('nfc')) {
      return <ShieldCheckIcon className="h-5 w-5 text-gray-500" />;
    } else {
      return <ComputerDesktopIcon className="h-5 w-5 text-gray-500" />;
    }
  };

  const getDeviceTypeLabel = (passkey: Passkey) => {
    if (passkey.credentialDeviceType === 'multiDevice') {
      return '同期可能デバイス';
    } else {
      return '単一デバイス';
    }
  };

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-center">
          <ButtonLoading />
          <span className="ml-2 text-gray-600">パスキーを読み込み中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center">
          <KeyIcon className="h-6 w-6 text-gray-600" />
          <h3 className="ml-3 text-lg font-medium text-gray-900">
            登録済みパスキー
          </h3>
          <span className="ml-2 bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full">
            {passkeys.length}個
          </span>
        </div>
      </div>

      {error && (
        <div className="px-6 py-4 bg-red-50 border-b border-red-200">
          <div className="text-sm text-red-700">{error}</div>
        </div>
      )}

      {passkeys.length === 0 ? (
        <div className="px-6 py-8 text-center">
          <KeyIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            パスキーが登録されていません
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            新しいパスキーを登録してセキュアな認証を始めましょう
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-200">
          {passkeys.map((passkey) => (
            <div key={passkey.id} className="px-6 py-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 mt-1">
                    {getDeviceIcon(passkey)}
                  </div>
                  <div className="min-w-0 flex-1">
                    {editingId === passkey.id ? (
                      <div className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="flex-1 min-w-0 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          placeholder="パスキーの名前"
                        />
                        <button
                          onClick={handleSaveEdit}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          保存
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="text-sm text-gray-600 hover:text-gray-800"
                        >
                          キャンセル
                        </button>
                      </div>
                    ) : (
                      <>
                        <h4 className="text-sm font-medium text-gray-900">
                          {passkey.name || 'Unnamed Passkey'}
                        </h4>
                        <div className="mt-1 flex items-center space-x-4 text-xs text-gray-500">
                          <span>{getDeviceTypeLabel(passkey)}</span>
                          {passkey.credentialBackedUp && (
                            <span className="flex items-center">
                              <ShieldCheckIcon className="h-3 w-3 mr-1" />
                              バックアップ済み
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          登録日: {formatDate(passkey.createdAt)}
                          {passkey.lastUsedAt && (
                            <span className="ml-4">
                              最終使用: {formatDate(passkey.lastUsedAt)}
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {editingId !== passkey.id && (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleStartEdit(passkey)}
                      className="text-gray-400 hover:text-gray-600"
                      title="名前を編集"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDeletePasskey(passkey.id)}
                      disabled={deletingId === passkey.id}
                      className="text-red-400 hover:text-red-600 disabled:opacity-50"
                      title="削除"
                    >
                      {deletingId === passkey.id ? (
                        <ButtonLoading size="sm" />
                      ) : (
                        <TrashIcon className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}