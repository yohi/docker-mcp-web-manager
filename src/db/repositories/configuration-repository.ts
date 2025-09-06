import { eq, and } from 'drizzle-orm';
import { configurations, secretReferences } from '../schema';
import { BaseRepository } from './base-repository';
import db from '../connection';
import {
  ServerConfiguration,
  ConfigurationRow,
  SecretReference,
  ResourceLimits,
  NetworkConfig,
} from '../../types/models';

// =============================================================================
// Configuration Repository
// サーバー設定情報の CRUD 操作を提供
// =============================================================================

export class ConfigurationRepository extends BaseRepository<
  typeof configurations,
  ConfigurationRow,
  ServerConfiguration
> {
  constructor() {
    super(configurations, 'id', []);
  }

  /**
   * データベースの行をServerConfigurationモデルに変換
   */
  protected mapRowToModel(row: ConfigurationRow): ServerConfiguration {
    return {
      id: row.id,
      serverId: row.serverId,
      environment: this.safeParseJson<Record<string, string>>(row.environment, {}),
      enabledTools: this.safeParseJson<string[]>(row.enabledTools, []),
      secrets: [], // 別途取得が必要
      resourceLimits: this.safeParseJson<ResourceLimits>(row.resourceLimits, {}),
      networkConfig: this.safeParseJson<NetworkConfig>(row.networkConfig, { mode: 'bridge' }),
    };
  }

  /**
   * ServerConfigurationモデルをデータベースの行に変換
   */
  protected mapModelToRow(model: Partial<ServerConfiguration>): Partial<ConfigurationRow> {
    return {
      id: model.id,
      serverId: model.serverId,
      environment: this.safeStringifyJson(model.environment),
      enabledTools: this.safeStringifyJson(model.enabledTools),
      resourceLimits: this.safeStringifyJson(model.resourceLimits),
      networkConfig: this.safeStringifyJson(model.networkConfig),
    };
  }

  /**
   * サーバーIDによる設定取得
   */
  async findByServerId(serverId: string): Promise<ServerConfiguration | null> {
    try {
      const [configRow] = await db
        .select()
        .from(configurations)
        .where(eq(configurations.serverId, serverId))
        .limit(1)
        .execute();

      if (!configRow) return null;

      const config = this.mapRowToModel(configRow);
      
      // シークレット参照を取得
      config.secrets = await this.getSecretReferences(config.id);

      return config;
    } catch (error) {
      console.error(`Error finding configuration by server ID ${serverId}:`, error);
      throw error;
    }
  }

  /**
   * サーバー設定を完全な形で取得（シークレット参照も含む）
   */
  async findByIdWithSecrets(id: string): Promise<ServerConfiguration | null> {
    try {
      const config = await this.findById(id);
      if (!config) return null;

      // シークレット参照を取得
      config.secrets = await this.getSecretReferences(id);

      return config;
    } catch (error) {
      console.error(`Error finding configuration with secrets for ID ${id}:`, error);
      throw error;
    }
  }

  /**
   * 新しい設定を作成（サーバーIDと共に）
   */
  async createForServer(
    serverId: string,
    configData: Omit<ServerConfiguration, 'id' | 'serverId' | 'secrets'>
  ): Promise<ServerConfiguration> {
    try {
      const configuration: ServerConfiguration = {
        id: this.generateId(),
        serverId,
        ...configData,
        secrets: [], // 初期状態では空
      };

      const created = await this.create(configuration);
      return created;
    } catch (error) {
      console.error(`Error creating configuration for server ${serverId}:`, error);
      throw error;
    }
  }

  /**
   * サーバーの設定を更新（シークレット参照も更新）
   */
  async updateServerConfiguration(
    serverId: string,
    configData: Partial<Omit<ServerConfiguration, 'id' | 'serverId'>>
  ): Promise<ServerConfiguration | null> {
    try {
      return await this.transaction(async (tx) => {
        // 既存の設定を取得
        let config = await this.findByServerId(serverId);
        
        if (!config) {
          // 設定が存在しない場合は新規作成
          config = await this.createForServer(serverId, {
            environment: configData.environment || {},
            enabledTools: configData.enabledTools || [],
            resourceLimits: configData.resourceLimits || {},
            networkConfig: configData.networkConfig || { mode: 'bridge' },
          });
        } else {
          // 既存の設定を更新
          const updated = await this.update(config.id, {
            ...config,
            ...configData,
          });
          if (!updated) throw new Error('Failed to update configuration');
          config = updated;
        }

        // シークレット参照を更新
        if (configData.secrets) {
          await this.updateSecretReferences(config.id, configData.secrets);
          config.secrets = configData.secrets;
        }

        return config;
      });
    } catch (error) {
      console.error(`Error updating server configuration for server ${serverId}:`, error);
      throw error;
    }
  }

  /**
   * 環境変数を更新
   */
  async updateEnvironment(
    serverId: string,
    environment: Record<string, string>
  ): Promise<boolean> {
    try {
      const config = await this.findByServerId(serverId);
      if (!config) return false;

      const result = await db
        .update(configurations)
        .set({
          environment: this.safeStringifyJson(environment),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(configurations.id, config.id))
        .execute();

      return result.changes > 0;
    } catch (error) {
      console.error(`Error updating environment for server ${serverId}:`, error);
      throw error;
    }
  }

  /**
   * 有効なツール一覧を更新
   */
  async updateEnabledTools(
    serverId: string,
    enabledTools: string[]
  ): Promise<boolean> {
    try {
      const config = await this.findByServerId(serverId);
      if (!config) return false;

      const result = await db
        .update(configurations)
        .set({
          enabledTools: this.safeStringifyJson(enabledTools),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(configurations.id, config.id))
        .execute();

      return result.changes > 0;
    } catch (error) {
      console.error(`Error updating enabled tools for server ${serverId}:`, error);
      throw error;
    }
  }

  /**
   * リソース制限を更新
   */
  async updateResourceLimits(
    serverId: string,
    resourceLimits: ResourceLimits
  ): Promise<boolean> {
    try {
      const config = await this.findByServerId(serverId);
      if (!config) return false;

      const result = await db
        .update(configurations)
        .set({
          resourceLimits: this.safeStringifyJson(resourceLimits),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(configurations.id, config.id))
        .execute();

      return result.changes > 0;
    } catch (error) {
      console.error(`Error updating resource limits for server ${serverId}:`, error);
      throw error;
    }
  }

  /**
   * ネットワーク設定を更新
   */
  async updateNetworkConfig(
    serverId: string,
    networkConfig: NetworkConfig
  ): Promise<boolean> {
    try {
      const config = await this.findByServerId(serverId);
      if (!config) return false;

      const result = await db
        .update(configurations)
        .set({
          networkConfig: this.safeStringifyJson(networkConfig),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(configurations.id, config.id))
        .execute();

      return result.changes > 0;
    } catch (error) {
      console.error(`Error updating network config for server ${serverId}:`, error);
      throw error;
    }
  }

  /**
   * シークレット参照一覧を取得
   */
  private async getSecretReferences(configurationId: string): Promise<SecretReference[]> {
    try {
      const references = await db
        .select()
        .from(secretReferences)
        .where(eq(secretReferences.configurationId, configurationId))
        .execute();

      return references.map((ref) => ({
        secretId: ref.secretId,
        environmentVariable: ref.environmentVariable,
        required: ref.required,
      }));
    } catch (error) {
      console.error(`Error getting secret references for configuration ${configurationId}:`, error);
      return [];
    }
  }

  /**
   * シークレット参照を更新
   */
  private async updateSecretReferences(
    configurationId: string,
    secrets: SecretReference[]
  ): Promise<void> {
    try {
      await this.transaction(async (tx) => {
        // 既存の参照をすべて削除
        await db
          .delete(secretReferences)
          .where(eq(secretReferences.configurationId, configurationId))
          .execute();

        // 新しい参照を挿入
        if (secrets.length > 0) {
          const secretRefs = secrets.map((secret) => ({
            id: this.generateId(),
            configurationId,
            secretId: secret.secretId,
            environmentVariable: secret.environmentVariable,
            required: secret.required,
          }));

          await db.insert(secretReferences).values(secretRefs).execute();
        }
      });
    } catch (error) {
      console.error(`Error updating secret references for configuration ${configurationId}:`, error);
      throw error;
    }
  }

  /**
   * 設定をサーバーと共に削除
   */
  async deleteByServerId(serverId: string): Promise<boolean> {
    try {
      const config = await this.findByServerId(serverId);
      if (!config) return false;

      return await this.delete(config.id);
    } catch (error) {
      console.error(`Error deleting configuration by server ID ${serverId}:`, error);
      throw error;
    }
  }

  /**
   * デフォルト設定を作成
   */
  async createDefaultConfiguration(serverId: string): Promise<ServerConfiguration> {
    const defaultConfig = {
      environment: {
        NODE_ENV: 'production',
      },
      enabledTools: [],
      resourceLimits: {
        memory: '512m',
        cpu: '0.5',
      },
      networkConfig: {
        mode: 'bridge' as const,
        ports: [
          {
            containerPort: 3000,
            hostPort: 3000,
            protocol: 'tcp' as const,
          },
        ],
      },
    };

    return this.createForServer(serverId, defaultConfig);
  }

  /**
   * 設定の統計情報を取得
   */
  async getConfigurationStats(): Promise<{
    totalConfigurations: number;
    averageToolsPerServer: number;
    commonEnvironmentVariables: Array<{ key: string; count: number }>;
  }> {
    try {
      // 総設定数
      const [{ totalConfigurations }] = await db
        .select({ totalConfigurations: db.sql<number>`count(*)` })
        .from(configurations)
        .execute();

      // 平均ツール数（概算）
      const configs = await db
        .select({ enabledTools: configurations.enabledTools })
        .from(configurations)
        .execute();

      const totalTools = configs.reduce((sum, config) => {
        const tools = this.safeParseJson<string[]>(config.enabledTools, []);
        return sum + tools.length;
      }, 0);

      const averageToolsPerServer = totalConfigurations > 0 ? totalTools / totalConfigurations : 0;

      // よく使われる環境変数（概算）
      const envVarCounts: Record<string, number> = {};
      configs.forEach((config) => {
        const env = this.safeParseJson<Record<string, string>>(config.environment, {});
        Object.keys(env).forEach((key) => {
          envVarCounts[key] = (envVarCounts[key] || 0) + 1;
        });
      });

      const commonEnvironmentVariables = Object.entries(envVarCounts)
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        totalConfigurations,
        averageToolsPerServer: Math.round(averageToolsPerServer * 100) / 100,
        commonEnvironmentVariables,
      };
    } catch (error) {
      console.error('Error getting configuration stats:', error);
      throw error;
    }
  }
}