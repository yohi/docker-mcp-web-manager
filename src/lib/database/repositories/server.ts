/**
 * MCPサーバーリポジトリ
 * MCPサーバー関連のデータベース操作を提供
 */

import { BaseRepository } from './base';
import { MCPServer, CreateServerInput, UpdateServerInput, ValidationError, ValidationResult, ServerSummary, ServerStatus } from '@/types/database';
import { Result } from '@/types/common';

export class ServerRepository extends BaseRepository<MCPServer, CreateServerInput, UpdateServerInput> {
  constructor() {
    super('mcp_servers');
  }

  /**
   * 名前でサーバーを検索
   */
  async findByName(name: string): Promise<Result<MCPServer | null, Error>> {
    try {
      const stmt = this.db.prepare('SELECT * FROM mcp_servers WHERE name = ?');
      const row = stmt.get(name);
      
      if (!row) {
        return { success: true, data: null };
      }

      const server = this.mapRowToEntity(row as Record<string, unknown>);
      return { success: true, data: server };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * コンテナIDでサーバーを検索
   */
  async findByContainerId(containerId: string): Promise<Result<MCPServer | null, Error>> {
    try {
      const stmt = this.db.prepare('SELECT * FROM mcp_servers WHERE container_id = ?');
      const row = stmt.get(containerId);
      
      if (!row) {
        return { success: true, data: null };
      }

      const server = this.mapRowToEntity(row as Record<string, unknown>);
      return { success: true, data: server };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * ステータス別サーバー取得
   */
  async findByStatus(status: ServerStatus): Promise<Result<MCPServer[], Error>> {
    return this.findWhere({ status });
  }

  /**
   * 有効なサーバー一覧取得
   */
  async findEnabledServers(): Promise<Result<MCPServer[], Error>> {
    return this.findWhere({ enabled: true });
  }

  /**
   * 自動起動対象サーバー取得
   */
  async findAutoStartServers(): Promise<Result<MCPServer[], Error>> {
    return this.findWhere({ auto_start: true, enabled: true });
  }

  /**
   * ユーザー作成のサーバー取得
   */
  async findByCreator(creatorId: string): Promise<Result<MCPServer[], Error>> {
    return this.findWhere({ created_by: creatorId });
  }

  /**
   * サーバーサマリー取得（ビューから）
   */
  async findServerSummaries(): Promise<Result<ServerSummary[], Error>> {
    try {
      const stmt = this.db.prepare('SELECT * FROM server_summary ORDER BY created_at DESC');
      const rows = stmt.all() as Record<string, unknown>[];

      const summaries = rows.map(row => this.mapRowToServerSummary(row));
      return { success: true, data: summaries };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * 特定サーバーのサマリー取得
   */
  async findServerSummaryById(id: string): Promise<Result<ServerSummary | null, Error>> {
    try {
      const stmt = this.db.prepare('SELECT * FROM server_summary WHERE id = ?');
      const row = stmt.get(id);
      
      if (!row) {
        return { success: true, data: null };
      }

      const summary = this.mapRowToServerSummary(row as Record<string, unknown>);
      return { success: true, data: summary };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * サーバーステータス更新
   */
  async updateStatus(id: string, status: ServerStatus, containerId?: string): Promise<Result<MCPServer, Error>> {
    try {
      const updateData: Partial<UpdateServerInput> = { status };
      
      // コンテナIDが提供された場合は更新
      if (containerId !== undefined) {
        updateData.container_id = containerId;
      }

      // 開始・停止時刻の記録
      const now = this.getCurrentTimestamp();
      if (status === 'running') {
        (updateData as any).last_started_at = now;
      } else if (status === 'stopped') {
        (updateData as any).last_stopped_at = now;
      }

      return this.update(id, updateData as UpdateServerInput);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * ポート重複チェック
   */
  async checkPortConflict(port: number, excludeServerId?: string): Promise<Result<boolean, Error>> {
    try {
      let stmt;
      let params: unknown[];

      if (excludeServerId) {
        stmt = this.db.prepare('SELECT id FROM mcp_servers WHERE port = ? AND id != ? AND enabled = 1');
        params = [port, excludeServerId];
      } else {
        stmt = this.db.prepare('SELECT id FROM mcp_servers WHERE port = ? AND enabled = 1');
        params = [port];
      }

      const row = stmt.get(params);
      return { success: true, data: row !== undefined };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * サーバー名重複チェック
   */
  async checkNameConflict(name: string, excludeServerId?: string): Promise<Result<boolean, Error>> {
    try {
      let stmt;
      let params: unknown[];

      if (excludeServerId) {
        stmt = this.db.prepare('SELECT id FROM mcp_servers WHERE name = ? AND id != ?');
        params = [name, excludeServerId];
      } else {
        stmt = this.db.prepare('SELECT id FROM mcp_servers WHERE name = ?');
        params = [name];
      }

      const row = stmt.get(params);
      return { success: true, data: row !== undefined };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * サーバー統計情報取得
   */
  async getServerStats(): Promise<Result<{
    total: number;
    running: number;
    stopped: number;
    error: number;
    enabled: number;
  }, Error>> {
    try {
      const stmt = this.db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
          SUM(CASE WHEN status = 'stopped' THEN 1 ELSE 0 END) as stopped,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error,
          SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) as enabled
        FROM mcp_servers
      `);
      
      const stats = stmt.get() as any;
      return {
        success: true,
        data: {
          total: stats.total || 0,
          running: stats.running || 0,
          stopped: stats.stopped || 0,
          error: stats.error || 0,
          enabled: stats.enabled || 0
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  // 基底クラスの抽象メソッドの実装
  protected mapRowToEntity(row: Record<string, unknown>): MCPServer {
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string | undefined,
      image: row.image as string,
      tag: row.tag as string,
      status: row.status as ServerStatus,
      port: row.port as number | undefined,
      internal_port: row.internal_port as number,
      enabled: Boolean(row.enabled),
      auto_start: Boolean(row.auto_start),
      restart_policy: row.restart_policy as 'no' | 'always' | 'unless-stopped' | 'on-failure',
      health_check_endpoint: row.health_check_endpoint as string,
      health_check_interval: row.health_check_interval as number,
      container_id: row.container_id as string | undefined,
      container_name: row.container_name as string | undefined,
      last_started_at: row.last_started_at as string | undefined,
      last_stopped_at: row.last_stopped_at as string | undefined,
      created_by: row.created_by as string,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string
    };
  }

  protected createEntityFromInput(input: CreateServerInput): MCPServer {
    const timestamp = this.getCurrentTimestamp();
    return {
      id: this.generateId(),
      name: input.name,
      description: input.description,
      image: input.image,
      tag: input.tag || 'latest',
      status: 'stopped',
      port: input.port,
      internal_port: input.internal_port || 3000,
      enabled: input.enabled ?? true,
      auto_start: input.auto_start ?? false,
      restart_policy: input.restart_policy || 'unless-stopped',
      health_check_endpoint: input.health_check_endpoint || '/health',
      health_check_interval: input.health_check_interval || 30,
      container_id: undefined,
      container_name: undefined,
      last_started_at: undefined,
      last_stopped_at: undefined,
      created_by: '', // 実際の作成時にセット
      created_at: timestamp,
      updated_at: timestamp
    };
  }

  protected validateCreate(input: CreateServerInput): ValidationResult {
    const errors: ValidationError[] = [];

    // 名前検証
    if (!input.name) {
      errors.push({ field: 'name', message: 'Server name is required' });
    } else if (input.name.length < 3 || input.name.length > 50) {
      errors.push({ field: 'name', message: 'Server name must be between 3 and 50 characters' });
    } else if (!/^[a-zA-Z0-9_-]+$/.test(input.name)) {
      errors.push({ field: 'name', message: 'Server name can only contain letters, numbers, hyphens, and underscores' });
    }

    // イメージ検証
    if (!input.image) {
      errors.push({ field: 'image', message: 'Docker image is required' });
    } else if (input.image.length < 1 || input.image.length > 255) {
      errors.push({ field: 'image', message: 'Docker image name is too long' });
    }

    // タグ検証
    if (input.tag && (input.tag.length < 1 || input.tag.length > 50)) {
      errors.push({ field: 'tag', message: 'Tag must be between 1 and 50 characters' });
    }

    // ポート検証
    if (input.port !== undefined) {
      if (input.port < 1 || input.port > 65535) {
        errors.push({ field: 'port', message: 'Port must be between 1 and 65535' });
      }
    }

    // 内部ポート検証
    if (input.internal_port !== undefined) {
      if (input.internal_port < 1 || input.internal_port > 65535) {
        errors.push({ field: 'internal_port', message: 'Internal port must be between 1 and 65535' });
      }
    }

    // ヘルスチェック間隔検証
    if (input.health_check_interval !== undefined) {
      if (input.health_check_interval < 5 || input.health_check_interval > 3600) {
        errors.push({ field: 'health_check_interval', message: 'Health check interval must be between 5 and 3600 seconds' });
      }
    }

    // 再起動ポリシー検証
    if (input.restart_policy && !['no', 'always', 'unless-stopped', 'on-failure'].includes(input.restart_policy)) {
      errors.push({ field: 'restart_policy', message: 'Invalid restart policy' });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  protected validateUpdate(input: UpdateServerInput): ValidationResult {
    const errors: ValidationError[] = [];

    // 名前検証（更新する場合）
    if (input.name !== undefined) {
      if (!input.name) {
        errors.push({ field: 'name', message: 'Server name cannot be empty' });
      } else if (input.name.length < 3 || input.name.length > 50) {
        errors.push({ field: 'name', message: 'Server name must be between 3 and 50 characters' });
      } else if (!/^[a-zA-Z0-9_-]+$/.test(input.name)) {
        errors.push({ field: 'name', message: 'Server name can only contain letters, numbers, hyphens, and underscores' });
      }
    }

    // イメージ検証（更新する場合）
    if (input.image !== undefined) {
      if (!input.image) {
        errors.push({ field: 'image', message: 'Docker image cannot be empty' });
      } else if (input.image.length < 1 || input.image.length > 255) {
        errors.push({ field: 'image', message: 'Docker image name is too long' });
      }
    }

    // タグ検証（更新する場合）
    if (input.tag !== undefined && input.tag && (input.tag.length < 1 || input.tag.length > 50)) {
      errors.push({ field: 'tag', message: 'Tag must be between 1 and 50 characters' });
    }

    // ポート検証（更新する場合）
    if (input.port !== undefined && input.port !== null) {
      if (input.port < 1 || input.port > 65535) {
        errors.push({ field: 'port', message: 'Port must be between 1 and 65535' });
      }
    }

    // 内部ポート検証（更新する場合）
    if (input.internal_port !== undefined) {
      if (input.internal_port < 1 || input.internal_port > 65535) {
        errors.push({ field: 'internal_port', message: 'Internal port must be between 1 and 65535' });
      }
    }

    // ヘルスチェック間隔検証（更新する場合）
    if (input.health_check_interval !== undefined) {
      if (input.health_check_interval < 5 || input.health_check_interval > 3600) {
        errors.push({ field: 'health_check_interval', message: 'Health check interval must be between 5 and 3600 seconds' });
      }
    }

    // 再起動ポリシー検証（更新する場合）
    if (input.restart_policy !== undefined && !['no', 'always', 'unless-stopped', 'on-failure'].includes(input.restart_policy)) {
      errors.push({ field: 'restart_policy', message: 'Invalid restart policy' });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * ServerSummaryマッピング
   */
  private mapRowToServerSummary(row: Record<string, unknown>): ServerSummary {
    return {
      ...this.mapRowToEntity(row),
      created_by_name: row.created_by_name as string,
      tool_count: row.tool_count as number,
      resource_count: row.resource_count as number,
      prompt_count: row.prompt_count as number
    };
  }
}