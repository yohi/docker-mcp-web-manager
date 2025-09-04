import { eq, and, like, or, inArray } from 'drizzle-orm';
import { BaseRepository } from './base-repository';
import { servers, configurations, tools, resources, prompts } from '../schema';
import type {
  Server,
  NewServer,
  ServerWithDetails,
  PaginatedResponse,
} from '../../types/database';

/**
 * サーバーリポジトリ
 * MCPサーバーに関するデータ操作を担当
 */
export class ServerRepository extends BaseRepository<Server, NewServer> {
  protected tableName = 'servers';
  protected table = servers;

  /**
   * サーバー詳細情報を取得（関連データを含む）
   */
  async findByIdWithDetails(id: string): Promise<ServerWithDetails | null> {
    try {
      const server = await this.findById(id);
      if (!server) {
        return null;
      }

      // 関連データを並行で取得
      const [configuration, serverTools, serverResources, serverPrompts] =
        await Promise.all([
          this.db
            .select()
            .from(configurations)
            .where(eq(configurations.serverId, id))
            .limit(1),
          this.db
            .select()
            .from(tools)
            .where(eq(tools.serverId, id)),
          this.db
            .select()
            .from(resources)
            .where(eq(resources.serverId, id)),
          this.db
            .select()
            .from(prompts)
            .where(eq(prompts.serverId, id)),
        ]);

      return {
        ...server,
        configuration: configuration[0] || undefined,
        tools: serverTools,
        resources: serverResources,
        prompts: serverPrompts,
      };
    } catch (error) {
      throw new Error(`Failed to find server with details: ${error}`);
    }
  }

  /**
   * 名前でサーバーを検索
   */
  async findByName(name: string): Promise<Server | null> {
    try {
      const results = await this.db
        .select()
        .from(servers)
        .where(eq(servers.name, name))
        .limit(1);

      return results[0] || null;
    } catch (error) {
      throw new Error(`Failed to find server by name: ${error}`);
    }
  }

  /**
   * ステータスでサーバーを検索
   */
  async findByStatus(
    status: 'running' | 'stopped' | 'error',
  ): Promise<Server[]> {
    try {
      return await this.findByCondition(eq(servers.status, status));
    } catch (error) {
      throw new Error(`Failed to find servers by status: ${error}`);
    }
  }

  /**
   * 複数のステータスでサーバーを検索
   */
  async findByStatuses(
    statuses: ('running' | 'stopped' | 'error')[],
  ): Promise<Server[]> {
    try {
      return await this.findByCondition(inArray(servers.status, statuses));
    } catch (error) {
      throw new Error(`Failed to find servers by statuses: ${error}`);
    }
  }

  /**
   * サーバー名での部分一致検索
   */
  async searchByName(
    searchTerm: string,
    options?: {
      page?: number;
      limit?: number;
    },
  ): Promise<PaginatedResponse<Server>> {
    try {
      const { page = 1, limit = 20 } = options || {};

      return await this.findAll({
        page,
        limit,
        where: like(servers.name, `%${searchTerm}%`),
      });
    } catch (error) {
      throw new Error(`Failed to search servers by name: ${error}`);
    }
  }

  /**
   * サーバー名と説明での複合検索
   */
  async search(
    searchTerm: string,
    options?: {
      page?: number;
      limit?: number;
      status?: 'running' | 'stopped' | 'error';
    },
  ): Promise<PaginatedResponse<Server>> {
    try {
      const { page = 1, limit = 20, status } = options || {};

      let whereCondition = or(
        like(servers.name, `%${searchTerm}%`),
        like(servers.description, `%${searchTerm}%`),
      );

      if (status) {
        whereCondition = and(whereCondition, eq(servers.status, status));
      }

      return await this.findAll({
        page,
        limit,
        where: whereCondition,
      });
    } catch (error) {
      throw new Error(`Failed to search servers: ${error}`);
    }
  }

  /**
   * サーバーステータスを更新
   */
  async updateStatus(
    id: string,
    status: 'running' | 'stopped' | 'error',
  ): Promise<Server | null> {
    try {
      return await this.update(id, { status });
    } catch (error) {
      throw new Error(`Failed to update server status: ${error}`);
    }
  }

  /**
   * イメージでサーバーを検索
   */
  async findByImage(image: string): Promise<Server[]> {
    try {
      return await this.findByCondition(eq(servers.image, image));
    } catch (error) {
      throw new Error(`Failed to find servers by image: ${error}`);
    }
  }

  /**
   * バージョンでサーバーを検索
   */
  async findByVersion(version: string): Promise<Server[]> {
    try {
      return await this.findByCondition(eq(servers.version, version));
    } catch (error) {
      throw new Error(`Failed to find servers by version: ${error}`);
    }
  }

  /**
   * サーバー名の存在チェック
   */
  async isNameExists(name: string, excludeId?: string): Promise<boolean> {
    try {
      let condition = eq(servers.name, name);

      if (excludeId) {
        condition = and(condition, eq(servers.id, excludeId));
      }

      return await this.exists(condition);
    } catch (error) {
      throw new Error(`Failed to check if server name exists: ${error}`);
    }
  }

  /**
   * 実行中のサーバー数を取得
   */
  async countRunningServers(): Promise<number> {
    try {
      return await this.count(eq(servers.status, 'running'));
    } catch (error) {
      throw new Error(`Failed to count running servers: ${error}`);
    }
  }

  /**
   * サーバー統計情報を取得
   */
  async getStatistics(): Promise<{
    total: number;
    running: number;
    stopped: number;
    error: number;
  }> {
    try {
      const [total, running, stopped, error] = await Promise.all([
        this.count(),
        this.count(eq(servers.status, 'running')),
        this.count(eq(servers.status, 'stopped')),
        this.count(eq(servers.status, 'error')),
      ]);

      return {
        total,
        running,
        stopped,
        error,
      };
    } catch (error) {
      throw new Error(`Failed to get server statistics: ${error}`);
    }
  }
}