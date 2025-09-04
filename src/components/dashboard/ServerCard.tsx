/**
 * サーバーカードコンポーネント
 * 
 * 機能要件：
 * - 個別サーバー情報の表示
 * - ステータスインジケーター
 * - アクション実行（開始、停止、再起動、削除）
 * - リアルタイム状態更新
 * - 詳細情報の表示
 */

'use client';

import { useState, useCallback } from 'react';
import { Server, ServerStatus } from '@/types/server';
import { useAuth } from '@/components/auth/AuthProvider';

/**
 * サーバーカードのプロパティ
 */
interface ServerCardProps {
  server: Server;
  onStart: (serverId: string) => Promise<void>;
  onStop: (serverId: string) => Promise<void>;
  onRestart: (serverId: string) => Promise<void>;
  onDelete: (serverId: string) => Promise<void>;
  onViewDetails: (serverId: string) => void;
  onToggleSelect?: (serverId: string, selected: boolean) => void;
  isSelected?: boolean;
  showCheckbox?: boolean;
  className?: string;
}

/**
 * ステータス情報の取得
 */
function getStatusInfo(status: ServerStatus) {
  switch (status) {
    case ServerStatus.RUNNING:
      return {
        color: 'bg-green-500',
        textColor: 'text-green-800',
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200',
        label: '稼働中',
        pulseClass: 'animate-pulse',
      };
    case ServerStatus.STOPPED:
      return {
        color: 'bg-gray-500',
        textColor: 'text-gray-800',
        bgColor: 'bg-gray-50',
        borderColor: 'border-gray-200',
        label: '停止中',
        pulseClass: '',
      };
    case ServerStatus.STARTING:
      return {
        color: 'bg-blue-500',
        textColor: 'text-blue-800',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
        label: '開始中',
        pulseClass: 'animate-pulse',
      };
    case ServerStatus.STOPPING:
      return {
        color: 'bg-yellow-500',
        textColor: 'text-yellow-800',
        bgColor: 'bg-yellow-50',
        borderColor: 'border-yellow-200',
        label: '停止中',
        pulseClass: 'animate-pulse',
      };
    case ServerStatus.ERROR:
      return {
        color: 'bg-red-500',
        textColor: 'text-red-800',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        label: 'エラー',
        pulseClass: 'animate-bounce',
      };
    case ServerStatus.UNKNOWN:
    default:
      return {
        color: 'bg-gray-400',
        textColor: 'text-gray-600',
        bgColor: 'bg-gray-50',
        borderColor: 'border-gray-200',
        label: '不明',
        pulseClass: '',
      };
  }
}

/**
 * リソース使用量の表示
 */
function ResourceUsage({ 
  label, 
  used, 
  total, 
  unit, 
  color = 'blue' 
}: { 
  label: string; 
  used: number; 
  total?: number; 
  unit: string; 
  color?: string; 
}) {
  const percentage = total ? (used / total) * 100 : 0;
  
  const getColorClass = (color: string) => {
    const colorMap = {
      blue: 'bg-blue-500',
      green: 'bg-green-500',
      yellow: 'bg-yellow-500',
      red: 'bg-red-500',
    };
    return colorMap[color as keyof typeof colorMap] || 'bg-blue-500';
  };

  return (
    <div className="flex flex-col space-y-1">
      <div className="flex justify-between text-xs text-gray-600">
        <span>{label}</span>
        <span>
          {used.toFixed(1)}{unit}
          {total && ` / ${total.toFixed(1)}${unit}`}
        </span>
      </div>
      {total && (
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${getColorClass(color)}`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * アクションボタン
 */
function ActionButton({
  onClick,
  disabled,
  variant,
  size = 'sm',
  children,
  tooltip,
}: {
  onClick: () => void;
  disabled?: boolean;
  variant: 'primary' | 'secondary' | 'danger';
  size?: 'xs' | 'sm' | 'md';
  children: React.ReactNode;
  tooltip?: string;
}) {
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variantClasses = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500',
    secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-900 focus:ring-gray-500',
    danger: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500',
  };
  
  const sizeClasses = {
    xs: 'px-2 py-1 text-xs',
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]}`}
      title={tooltip}
    >
      {children}
    </button>
  );
}

/**
 * サーバーカードコンポーネント
 */
export default function ServerCard({
  server,
  onStart,
  onStop,
  onRestart,
  onDelete,
  onViewDetails,
  onToggleSelect,
  isSelected = false,
  showCheckbox = false,
  className = '',
}: ServerCardProps) {
  const { hasPermission, hasRole, user } = useAuth();
  const [isPerformingAction, setIsPerformingAction] = useState<string | null>(null);

  const statusInfo = getStatusInfo(server.status);
  const canStart = server.status === ServerStatus.STOPPED;
  const canStop = server.status === ServerStatus.RUNNING;
  const canRestart = server.status === ServerStatus.RUNNING;
  const canDelete = server.status === ServerStatus.STOPPED;
  
  // 権限チェック
  const canManageServers = hasPermission('servers:manage') || hasRole('admin' as any);
  const canDeleteServers = hasPermission('servers:delete') || hasRole('admin' as any);
  
  /**
   * アクション実行のラッパー
   */
  const performAction = useCallback(async (
    actionName: string,
    actionFn: (serverId: string) => Promise<void>
  ) => {
    if (isPerformingAction) return;
    
    setIsPerformingAction(actionName);
    try {
      await actionFn(server.id);
    } catch (error) {
      console.error(`Failed to ${actionName} server:`, error);
      // エラーハンドリングは親コンポーネントで行う
    } finally {
      setIsPerformingAction(null);
    }
  }, [isPerformingAction, server.id]);

  /**
   * チェックボックス変更ハンドラ
   */
  const handleCheckboxChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (onToggleSelect) {
      onToggleSelect(server.id, e.target.checked);
    }
  }, [server.id, onToggleSelect]);

  return (
    <div className={`bg-white rounded-lg border-2 shadow-sm hover:shadow-md transition-all duration-200 ${statusInfo.borderColor} ${className}`}>
      {/* カードヘッダー */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3">
            {showCheckbox && (
              <input
                type="checkbox"
                checked={isSelected}
                onChange={handleCheckboxChange}
                className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
            )}
            
            <div className="flex-1">
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-semibold text-gray-900 truncate">
                  {server.name}
                </h3>
                <div className="flex items-center space-x-1">
                  <div className={`w-2 h-2 rounded-full ${statusInfo.color} ${statusInfo.pulseClass}`} />
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusInfo.textColor} ${statusInfo.bgColor}`}>
                    {statusInfo.label}
                  </span>
                </div>
              </div>
              
              <div className="mt-1 text-sm text-gray-600 flex items-center space-x-4">
                <span className="truncate" title={server.image}>
                  <span className="font-medium">Image:</span> {server.image}
                </span>
                {server.network && (
                  <span>
                    <span className="font-medium">Network:</span> {server.network}
                  </span>
                )}
              </div>
              
              {server.ports && server.ports.length > 0 && (
                <div className="mt-1 text-xs text-gray-500">
                  <span className="font-medium">Ports:</span> {server.ports.join(', ')}
                </div>
              )}
            </div>
          </div>
          
          <button
            onClick={() => onViewDetails(server.id)}
            className="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md p-1"
            title="詳細を表示"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* リソース使用量 */}
      {server.stats && (
        <div className="p-4 border-b border-gray-100 bg-gray-50">
          <div className="grid grid-cols-2 gap-4">
            <ResourceUsage
              label="CPU"
              used={server.stats.cpu}
              unit="%"
              color={server.stats.cpu > 80 ? 'red' : server.stats.cpu > 60 ? 'yellow' : 'green'}
            />
            <ResourceUsage
              label="Memory"
              used={server.stats.memory}
              total={server.stats.memoryLimit}
              unit="MB"
              color={server.stats.memoryLimit && (server.stats.memory / server.stats.memoryLimit) > 0.8 ? 'red' : 'blue'}
            />
          </div>
          
          {server.stats.network && (
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div className="text-xs text-gray-600">
                <span className="font-medium">Network I/O:</span> ↑{server.stats.network.tx}MB ↓{server.stats.network.rx}MB
              </div>
              <div className="text-xs text-gray-600">
                <span className="font-medium">Disk I/O:</span> ↑{server.stats.disk?.write || 0}MB ↓{server.stats.disk?.read || 0}MB
              </div>
            </div>
          )}
        </div>
      )}

      {/* メタデータ */}
      <div className="p-4 border-b border-gray-100">
        <div className="grid grid-cols-2 gap-4 text-xs text-gray-600">
          <div>
            <span className="font-medium">Created:</span>
            <br />
            {new Date(server.createdAt).toLocaleDateString('ja-JP', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
          <div>
            <span className="font-medium">Updated:</span>
            <br />
            {new Date(server.updatedAt).toLocaleDateString('ja-JP', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
          <div>
            <span className="font-medium">Owner:</span>
            <br />
            {server.owner || 'Unknown'}
          </div>
          <div>
            <span className="font-medium">Uptime:</span>
            <br />
            {server.uptime || 'N/A'}
          </div>
        </div>
      </div>

      {/* アクション */}
      {canManageServers && (
        <div className="p-4 flex flex-wrap gap-2 justify-end">
          <ActionButton
            onClick={() => performAction('start', onStart)}
            disabled={!canStart || isPerformingAction !== null}
            variant="primary"
            tooltip="サーバーを開始"
          >
            {isPerformingAction === 'start' ? (
              <>
                <svg className="animate-spin -ml-1 mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                開始中...
              </>
            ) : (
              <>
                <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                開始
              </>
            )}
          </ActionButton>

          <ActionButton
            onClick={() => performAction('stop', onStop)}
            disabled={!canStop || isPerformingAction !== null}
            variant="secondary"
            tooltip="サーバーを停止"
          >
            {isPerformingAction === 'stop' ? (
              <>
                <svg className="animate-spin -ml-1 mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                停止中...
              </>
            ) : (
              <>
                <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                停止
              </>
            )}
          </ActionButton>

          <ActionButton
            onClick={() => performAction('restart', onRestart)}
            disabled={!canRestart || isPerformingAction !== null}
            variant="secondary"
            tooltip="サーバーを再起動"
          >
            {isPerformingAction === 'restart' ? (
              <>
                <svg className="animate-spin -ml-1 mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                再起動中...
              </>
            ) : (
              <>
                <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                再起動
              </>
            )}
          </ActionButton>

          {canDeleteServers && (
            <ActionButton
              onClick={() => performAction('delete', onDelete)}
              disabled={!canDelete || isPerformingAction !== null}
              variant="danger"
              tooltip="サーバーを削除"
            >
              {isPerformingAction === 'delete' ? (
                <>
                  <svg className="animate-spin -ml-1 mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  削除中...
                </>
              ) : (
                <>
                  <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  削除
                </>
              )}
            </ActionButton>
          )}
        </div>
      )}
      
      {/* 権限がない場合の表示 */}
      {!canManageServers && (
        <div className="p-4 text-center text-sm text-gray-500 bg-gray-50 border-t border-gray-100">
          サーバー管理権限がありません
        </div>
      )}
    </div>
  );
}