import { randomUUID } from 'crypto';

// =============================================================================
// SSE Security Utilities
// リアルタイム通信のためのサーバーサイドイベント（SSE）セキュリティ機能
// =============================================================================

/**
 * SSE接続の制限値
 */
const SSE_LIMITS = {
  MAX_CONNECTIONS_PER_IP: 10, // IP単位の同時接続数制限
  MAX_CONNECTIONS_TOTAL: 500, // 総同時接続数制限
  CONNECTION_TIMEOUT: 900000, // 15分（接続タイムアウト）
  HEARTBEAT_INTERVAL: 30000, // 30秒（ハートビート間隔）
  MAX_MESSAGE_SIZE: 4096, // 4KB（メッセージサイズ制限）
  BACKPRESSURE_THRESHOLD: 10, // バックプレッシャー閾値（未送信メッセージ数）
  MEMORY_LIMIT_MB: 50, // メモリ制限（MB）
} as const;

/**
 * SSE接続の状態
 */
export type SSEConnectionState = 'connecting' | 'connected' | 'closing' | 'closed';

/**
 * SSEメッセージの型
 */
export interface SSEMessage {
  id?: string;
  event?: string;
  data: string;
  retry?: number;
}

/**
 * SSE接続の詳細情報
 */
export interface SSEConnectionInfo {
  id: string;
  ipAddress: string;
  userAgent: string;
  userId?: string;
  connectedAt: Date;
  lastActivity: Date;
  state: SSEConnectionState;
  messageQueue: SSEMessage[];
  memoryUsageBytes: number;
}

/**
 * SSEセキュリティマネージャー
 * 接続管理、レート制限、セキュリティ監視を行う
 */
export class SSESecurityManager {
  private connections = new Map<string, SSEConnectionInfo>();
  private ipConnectionCounts = new Map<string, number>();
  private heartbeatIntervals = new Map<string, NodeJS.Timer>();
  private cleanupInterval: NodeJS.Timer;

  constructor() {
    // 定期的なクリーンアップ処理（5分間隔）
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, 300000);
  }

  /**
   * 新しいSSE接続の認証と登録
   */
  public authenticateConnection(
    request: {
      ip: string;
      userAgent: string;
      userId?: string;
      headers: Record<string, string>;
    }
  ): { allowed: boolean; connectionId?: string; error?: string } {
    try {
      // IP単位の接続数チェック
      const currentIpConnections = this.ipConnectionCounts.get(request.ip) || 0;
      if (currentIpConnections >= SSE_LIMITS.MAX_CONNECTIONS_PER_IP) {
        this.logSecurityEvent('CONNECTION_LIMIT_IP_EXCEEDED', request);
        return {
          allowed: false,
          error: `Too many connections from IP: ${request.ip}`,
        };
      }

      // 総接続数チェック
      if (this.connections.size >= SSE_LIMITS.MAX_CONNECTIONS_TOTAL) {
        this.logSecurityEvent('CONNECTION_LIMIT_TOTAL_EXCEEDED', request);
        return {
          allowed: false,
          error: 'Server connection limit exceeded',
        };
      }

      // セキュリティヘッダーの検証
      const securityValidation = this.validateSecurityHeaders(request.headers);
      if (!securityValidation.valid) {
        this.logSecurityEvent('SECURITY_HEADER_VALIDATION_FAILED', request);
        return {
          allowed: false,
          error: securityValidation.error,
        };
      }

      // 接続IDの生成と登録
      const connectionId = this.generateConnectionId();
      const connectionInfo: SSEConnectionInfo = {
        id: connectionId,
        ipAddress: request.ip,
        userAgent: request.userAgent,
        userId: request.userId,
        connectedAt: new Date(),
        lastActivity: new Date(),
        state: 'connecting',
        messageQueue: [],
        memoryUsageBytes: 0,
      };

      this.connections.set(connectionId, connectionInfo);
      this.ipConnectionCounts.set(
        request.ip,
        currentIpConnections + 1
      );

      // ハートビートの開始
      this.startHeartbeat(connectionId);

      this.logSecurityEvent('CONNECTION_AUTHENTICATED', {
        ...request,
        connectionId,
      });

      return { allowed: true, connectionId };
    } catch (error) {
      this.logSecurityEvent('CONNECTION_AUTH_ERROR', { ...request, error });
      return {
        allowed: false,
        error: 'Authentication failed',
      };
    }
  }

  /**
   * 接続状態の更新
   */
  public updateConnectionState(
    connectionId: string,
    state: SSEConnectionState
  ): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.state = state;
      connection.lastActivity = new Date();

      if (state === 'closed' || state === 'closing') {
        this.cleanupConnection(connectionId);
      }
    }
  }

  /**
   * メッセージのキューイング（バックプレッシャー制御付き）
   */
  public queueMessage(
    connectionId: string,
    message: SSEMessage
  ): { success: boolean; error?: string } {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return { success: false, error: 'Connection not found' };
    }

    // バックプレッシャー制御
    if (connection.messageQueue.length >= SSE_LIMITS.BACKPRESSURE_THRESHOLD) {
      this.logSecurityEvent('BACKPRESSURE_TRIGGERED', {
        connectionId,
        queueSize: connection.messageQueue.length,
      });
      return { success: false, error: 'Message queue full (backpressure)' };
    }

    // メッセージサイズ制限
    const messageSize = this.calculateMessageSize(message);
    if (messageSize > SSE_LIMITS.MAX_MESSAGE_SIZE) {
      this.logSecurityEvent('MESSAGE_SIZE_EXCEEDED', {
        connectionId,
        messageSize,
        limit: SSE_LIMITS.MAX_MESSAGE_SIZE,
      });
      return { success: false, error: 'Message too large' };
    }

    // メモリ使用量制御
    const newMemoryUsage = connection.memoryUsageBytes + messageSize;
    const memoryLimitBytes = SSE_LIMITS.MEMORY_LIMIT_MB * 1024 * 1024;
    if (newMemoryUsage > memoryLimitBytes) {
      this.logSecurityEvent('MEMORY_LIMIT_EXCEEDED', {
        connectionId,
        currentMemory: connection.memoryUsageBytes,
        newMemory: newMemoryUsage,
        limit: memoryLimitBytes,
      });
      return { success: false, error: 'Memory limit exceeded' };
    }

    // メッセージID自動生成
    if (!message.id) {
      message.id = `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    }

    connection.messageQueue.push(message);
    connection.memoryUsageBytes = newMemoryUsage;
    connection.lastActivity = new Date();

    return { success: true };
  }

  /**
   * キューからメッセージを取得
   */
  public dequeueMessage(connectionId: string): SSEMessage | null {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.messageQueue.length === 0) {
      return null;
    }

    const message = connection.messageQueue.shift()!;
    const messageSize = this.calculateMessageSize(message);
    connection.memoryUsageBytes = Math.max(0, connection.memoryUsageBytes - messageSize);
    connection.lastActivity = new Date();

    return message;
  }

  /**
   * SSEメッセージの安全なフォーマット
   */
  public formatSSEMessage(message: SSEMessage): string {
    const lines: string[] = [];

    if (message.id) {
      lines.push(`id: ${this.sanitizeSSEValue(message.id)}`);
    }

    if (message.event) {
      lines.push(`event: ${this.sanitizeSSEValue(message.event)}`);
    }

    if (message.retry !== undefined) {
      lines.push(`retry: ${message.retry}`);
    }

    // データは複数行に対応
    const dataLines = message.data.split('\n');
    for (const line of dataLines) {
      lines.push(`data: ${this.sanitizeSSEValue(line)}`);
    }

    lines.push(''); // 空行でメッセージ終了
    return lines.join('\n') + '\n';
  }

  /**
   * ハートビートメッセージの送信
   */
  public generateHeartbeat(): SSEMessage {
    return {
      event: 'heartbeat',
      data: JSON.stringify({
        timestamp: new Date().toISOString(),
        server: 'docker-mcp-web-manager',
      }),
    };
  }

  /**
   * 接続情報の取得
   */
  public getConnectionInfo(connectionId: string): SSEConnectionInfo | null {
    return this.connections.get(connectionId) || null;
  }

  /**
   * 統計情報の取得
   */
  public getStatistics(): {
    totalConnections: number;
    connectionsByIp: Record<string, number>;
    memoryUsageMB: number;
    averageQueueSize: number;
  } {
    let totalMemoryUsage = 0;
    let totalQueueSize = 0;

    for (const connection of this.connections.values()) {
      totalMemoryUsage += connection.memoryUsageBytes;
      totalQueueSize += connection.messageQueue.length;
    }

    return {
      totalConnections: this.connections.size,
      connectionsByIp: Object.fromEntries(this.ipConnectionCounts),
      memoryUsageMB: totalMemoryUsage / (1024 * 1024),
      averageQueueSize: this.connections.size > 0 ? totalQueueSize / this.connections.size : 0,
    };
  }

  /**
   * 管理用：強制的に接続を切断
   */
  public forceDisconnect(connectionId: string): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return false;
    }

    this.logSecurityEvent('CONNECTION_FORCE_DISCONNECTED', {
      connectionId,
      ipAddress: connection.ipAddress,
    });

    this.cleanupConnection(connectionId);
    return true;
  }

  /**
   * 管理用：IPアドレスからの全接続を切断
   */
  public disconnectByIp(ipAddress: string): number {
    let disconnectedCount = 0;

    for (const [connectionId, connection] of this.connections.entries()) {
      if (connection.ipAddress === ipAddress) {
        this.cleanupConnection(connectionId);
        disconnectedCount++;
      }
    }

    if (disconnectedCount > 0) {
      this.logSecurityEvent('IP_CONNECTIONS_DISCONNECTED', {
        ipAddress,
        count: disconnectedCount,
      });
    }

    return disconnectedCount;
  }

  /**
   * リソースのクリーンアップ
   */
  public cleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // 全接続のクリーンアップ
    for (const connectionId of this.connections.keys()) {
      this.cleanupConnection(connectionId);
    }

    this.connections.clear();
    this.ipConnectionCounts.clear();
  }

  // =============================================================================
  // Private Helper Methods
  // =============================================================================

  private generateConnectionId(): string {
    return `sse_${randomUUID()}`;
  }

  private validateSecurityHeaders(headers: Record<string, string>): {
    valid: boolean;
    error?: string;
  } {
    // Acceptヘッダーの検証
    const accept = headers.accept || headers.Accept || '';
    if (!accept.includes('text/event-stream')) {
      return {
        valid: false,
        error: 'Invalid Accept header for SSE connection',
      };
    }

    // Cache-Controlの検証
    const cacheControl = headers['cache-control'] || headers['Cache-Control'] || '';
    if (!cacheControl.includes('no-cache')) {
      return {
        valid: false,
        error: 'Invalid Cache-Control header for SSE connection',
      };
    }

    return { valid: true };
  }

  private calculateMessageSize(message: SSEMessage): number {
    const formatted = this.formatSSEMessage(message);
    return Buffer.byteLength(formatted, 'utf8');
  }

  private sanitizeSSEValue(value: string): string {
    // SSE形式で危険な文字をエスケープ
    return value
      .replace(/\r\n/g, '\\n')
      .replace(/\r/g, '\\n')
      .replace(/\n/g, '\\n')
      .replace(/:/g, '\\:');
  }

  private startHeartbeat(connectionId: string): void {
    const interval = setInterval(() => {
      const connection = this.connections.get(connectionId);
      if (!connection || connection.state === 'closed') {
        clearInterval(interval);
        return;
      }

      // ハートビートメッセージをキューに追加
      const heartbeat = this.generateHeartbeat();
      this.queueMessage(connectionId, heartbeat);
    }, SSE_LIMITS.HEARTBEAT_INTERVAL);

    this.heartbeatIntervals.set(connectionId, interval);
  }

  private cleanupConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    // ハートビートの停止
    const interval = this.heartbeatIntervals.get(connectionId);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(connectionId);
    }

    // IP別接続数の減算
    const currentCount = this.ipConnectionCounts.get(connection.ipAddress) || 0;
    if (currentCount <= 1) {
      this.ipConnectionCounts.delete(connection.ipAddress);
    } else {
      this.ipConnectionCounts.set(connection.ipAddress, currentCount - 1);
    }

    // 接続情報の削除
    this.connections.delete(connectionId);
  }

  private performCleanup(): void {
    const now = new Date();
    const connectionsToCleanup: string[] = [];

    for (const [connectionId, connection] of this.connections.entries()) {
      // タイムアウトした接続の検出
      const timeSinceActivity = now.getTime() - connection.lastActivity.getTime();
      if (timeSinceActivity > SSE_LIMITS.CONNECTION_TIMEOUT) {
        connectionsToCleanup.push(connectionId);
        this.logSecurityEvent('CONNECTION_TIMEOUT', {
          connectionId,
          timeSinceActivity,
        });
      }
    }

    // タイムアウトした接続のクリーンアップ
    for (const connectionId of connectionsToCleanup) {
      this.cleanupConnection(connectionId);
    }

    // 統計ログの出力
    if (connectionsToCleanup.length > 0) {
      const stats = this.getStatistics();
      console.log('[SSE_CLEANUP]', {
        cleanedUp: connectionsToCleanup.length,
        remainingConnections: stats.totalConnections,
        memoryUsageMB: stats.memoryUsageMB,
      });
    }
  }

  private logSecurityEvent(event: string, data: any): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      event: `SSE_${event}`,
      data,
      securityLevel: 'high',
    };

    console.log('[SSE_SECURITY]', JSON.stringify(logEntry));
  }
}

/**
 * グローバルSSEセキュリティマネージャーのインスタンス
 */
export const sseSecurityManager = new SSESecurityManager();

/**
 * プロセス終了時のクリーンアップ
 */
process.on('SIGTERM', () => {
  sseSecurityManager.cleanup();
});

process.on('SIGINT', () => {
  sseSecurityManager.cleanup();
});