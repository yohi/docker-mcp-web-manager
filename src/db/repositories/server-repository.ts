import { eq, and, desc } from 'drizzle-orm';
import { servers, configurations, tools, resources, prompts } from '../schema';
import { BaseRepository } from './base-repository';
import db from '../connection';
import {
  MCPServer,
  ServerRow,
  Tool,
  Resource,
  Prompt,
  ServerConfiguration,
} from '../../types/models';

// =============================================================================
// Server Repository
// サーバー情報の CRUD 操作を提供
// =============================================================================

export class ServerRepository extends BaseRepository<
  typeof servers,
  ServerRow,
  MCPServer
> {
  constructor() {
    super(servers, 'id', ['name', 'description', 'image']);
  }

  /**
   * データベースの行をMCPServerモデルに変換
   */
  protected mapRowToModel(row: ServerRow): MCPServer {
    return {
      id: row.id,
      name: row.name,
      image: row.image,
      status: row.status,
      version: row.version || '',
      description: row.description || '',
      tools: [], // 別途取得が必要
      resources: [], // 別途取得が必要
      prompts: [], // 別途取得が必要
      configuration: {} as ServerConfiguration, // 別途取得が必要
      createdAt: this.parseDate(row.createdAt),
      updatedAt: this.parseDate(row.updatedAt),
    };
  }

  /**
   * MCPServerモデルをデータベースの行に変換
   */
  protected mapModelToRow(model: Partial<MCPServer>): Partial<ServerRow> {
    return {
      id: model.id,
      name: model.name,
      image: model.image,
      status: model.status,
      version: model.version,
      description: model.description,
      // createdAt/updatedAtはデータベースで自動設定
    };
  }

  /**
   * サーバー情報を完全な形で取得（関連データも含む）
   */
  async findByIdWithDetails(id: string): Promise<MCPServer | null> {
    try {
      // 基本情報を取得
      const server = await this.findById(id);
      if (!server) return null;

      // 関連データを並行取得
      const [serverTools, serverResources, serverPrompts, serverConfig] = await Promise.all([
        this.getServerTools(id),
        this.getServerResources(id),
        this.getServerPrompts(id),
        this.getServerConfiguration(id),
      ]);

      return {
        ...server,
        tools: serverTools,
        resources: serverResources,
        prompts: serverPrompts,
        configuration: serverConfig,
      };
    } catch (error) {
      console.error(`Error finding server with details for ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * サーバー一覧を関連データと共に取得
   */
  async findAllWithBasicDetails(options: any = {}) {
    const result = await this.findAll(options);
    
    // 基本的な関連データを並行取得
    const serversWithDetails = await Promise.all(
      result.data.map(async (server) => {
        const [toolsCount, resourcesCount, promptsCount] = await Promise.all([
          this.getServerToolsCount(server.id),
          this.getServerResourcesCount(server.id),
          this.getServerPromptsCount(server.id),
        ]);

        return {
          ...server,
          toolsCount,
          resourcesCount,
          promptsCount,
        };
      })
    );

    return {
      ...result,
      data: serversWithDetails,
    };
  }

  /**
   * ステータス別サーバー数を取得
   */
  async getStatusSummary(): Promise<Record<string, number>> {
    try {
      const statusCounts = await db
        .select({
          status: servers.status,
          count: db.sql<number>`count(*)`,
        })
        .from(servers)
        .groupBy(servers.status)
        .execute();

      const summary: Record<string, number> = {
        running: 0,
        stopped: 0,
        error: 0,
      };

      statusCounts.forEach((row) => {
        summary[row.status] = row.count;
      });

      return summary;
    } catch (error) {
      console.error('Error getting status summary:', error);
      throw error;
    }
  }

  /**
   * 名前でサーバーを検索
   */
  async findByName(name: string): Promise<MCPServer | null> {
    try {
      const [serverRow] = await db
        .select()
        .from(servers)
        .where(eq(servers.name, name))
        .limit(1)
        .execute();

      return serverRow ? this.mapRowToModel(serverRow) : null;
    } catch (error) {
      console.error(`Error finding server by name ${name}:`, error);
      throw error;
    }
  }

  /**
   * サーバーのステータスを更新
   */
  async updateStatus(id: string, status: 'running' | 'stopped' | 'error'): Promise<boolean> {
    try {
      const result = await db
        .update(servers)
        .set({ 
          status,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(servers.id, id))
        .execute();

      return result.changes > 0;
    } catch (error) {
      console.error(`Error updating server status for ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * サーバーのツール一覧を取得
   */
  private async getServerTools(serverId: string): Promise<Tool[]> {
    try {
      const toolRows = await db
        .select()
        .from(tools)
        .where(eq(tools.serverId, serverId))
        .orderBy(tools.name)
        .execute();

      return toolRows.map((row) => ({
        name: row.name,
        description: row.description || '',
        inputSchema: this.safeParseJson(row.inputSchema, {}),
        enabled: row.enabled,
      }));
    } catch (error) {
      console.error(`Error getting tools for server ${serverId}:`, error);
      return [];
    }
  }

  /**
   * サーバーのリソース一覧を取得
   */
  private async getServerResources(serverId: string): Promise<Resource[]> {
    try {
      const resourceRows = await db
        .select()
        .from(resources)
        .where(eq(resources.serverId, serverId))
        .orderBy(resources.name)
        .execute();

      return resourceRows.map((row) => ({
        uri: row.uri,
        name: row.name,
        description: row.description,
        mimeType: row.mimeType,
        metadata: this.safeParseJson(row.metadata, {}),
      }));
    } catch (error) {
      console.error(`Error getting resources for server ${serverId}:`, error);
      return [];
    }
  }

  /**
   * サーバーのプロンプト一覧を取得
   */
  private async getServerPrompts(serverId: string): Promise<Prompt[]> {
    try {
      const promptRows = await db
        .select()
        .from(prompts)
        .where(eq(prompts.serverId, serverId))
        .orderBy(prompts.name)
        .execute();

      return promptRows.map((row) => ({
        name: row.name,
        description: row.description,
        arguments: this.safeParseJson(row.arguments),
        metadata: this.safeParseJson(row.metadata, {}),
      }));
    } catch (error) {
      console.error(`Error getting prompts for server ${serverId}:`, error);
      return [];
    }
  }

  /**
   * サーバーの設定情報を取得
   */
  private async getServerConfiguration(serverId: string): Promise<ServerConfiguration> {
    try {
      const [configRow] = await db
        .select()
        .from(configurations)
        .where(eq(configurations.serverId, serverId))
        .limit(1)
        .execute();

      if (!configRow) {
        // デフォルト設定を返す
        return {
          id: this.generateId(),
          serverId,
          environment: {},
          enabledTools: [],
          secrets: [],
          resourceLimits: {},
          networkConfig: { mode: 'bridge' },
        };
      }

      return {
        id: configRow.id,
        serverId: configRow.serverId,
        environment: this.safeParseJson(configRow.environment, {}),
        enabledTools: this.safeParseJson(configRow.enabledTools, []),
        secrets: [], // SecretReferenceRepositoryから取得が必要
        resourceLimits: this.safeParseJson(configRow.resourceLimits, {}),
        networkConfig: this.safeParseJson(configRow.networkConfig, { mode: 'bridge' }),
      };
    } catch (error) {
      console.error(`Error getting configuration for server ${serverId}:`, error);
      // エラーの場合もデフォルト設定を返す
      return {
        id: this.generateId(),
        serverId,
        environment: {},
        enabledTools: [],
        secrets: [],
        resourceLimits: {},
        networkConfig: { mode: 'bridge' },
      };
    }
  }

  /**
   * サーバーのツール数を取得
   */
  private async getServerToolsCount(serverId: string): Promise<number> {
    try {
      const [{ count }] = await db
        .select({ count: db.sql<number>`count(*)` })
        .from(tools)
        .where(eq(tools.serverId, serverId))
        .execute();

      return count;
    } catch (error) {
      console.error(`Error getting tools count for server ${serverId}:`, error);
      return 0;
    }
  }

  /**
   * サーバーのリソース数を取得
   */
  private async getServerResourcesCount(serverId: string): Promise<number> {
    try {
      const [{ count }] = await db
        .select({ count: db.sql<number>`count(*)` })
        .from(resources)
        .where(eq(resources.serverId, serverId))
        .execute();

      return count;
    } catch (error) {
      console.error(`Error getting resources count for server ${serverId}:`, error);
      return 0;
    }
  }

  /**
   * サーバーのプロンプト数を取得
   */
  private async getServerPromptsCount(serverId: string): Promise<number> {
    try {
      const [{ count }] = await db
        .select({ count: db.sql<number>`count(*)` })
        .from(prompts)
        .where(eq(prompts.serverId, serverId))
        .execute();

      return count;
    } catch (error) {
      console.error(`Error getting prompts count for server ${serverId}:`, error);
      return 0;
    }
  }

  /**
   * 新しいサーバーを作成（IDを自動生成）
   */
  async createServer(serverData: Omit<MCPServer, 'id' | 'createdAt' | 'updatedAt' | 'tools' | 'resources' | 'prompts' | 'configuration'>): Promise<MCPServer> {
    const server = {
      ...serverData,
      id: this.generateId(),
    };

    return this.create(server);
  }

  /**
   * サーバーを完全削除（関連データも削除）
   */
  async deleteServer(id: string): Promise<boolean> {
    try {
      // 外部キー制約により関連データは自動削除される
      return await this.delete(id);
    } catch (error) {
      console.error(`Error deleting server ${id}:`, error);
      throw error;
    }
  }

  /**
   * 最近アップデートされたサーバー一覧を取得
   */
  async getRecentlyUpdated(limit: number = 10): Promise<MCPServer[]> {
    try {
      const serverRows = await db
        .select()
        .from(servers)
        .orderBy(desc(servers.updatedAt))
        .limit(limit)
        .execute();

      return serverRows.map((row) => this.mapRowToModel(row));
    } catch (error) {
      console.error('Error getting recently updated servers:', error);
      throw error;
    }
  }
}