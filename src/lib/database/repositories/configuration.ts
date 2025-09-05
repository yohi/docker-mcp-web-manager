/**
 * サーバー設定リポジトリ
 * サーバー設定関連のデータベース操作を提供
 */

import { BaseRepository } from './base';
import { ServerConfiguration, CreateConfigurationInput, UpdateConfigurationInput, ValidationError, ValidationResult } from '@/types/database';
import { Result } from '@/types/common';

export class ConfigurationRepository extends BaseRepository<ServerConfiguration, CreateConfigurationInput, UpdateConfigurationInput> {
  constructor() {
    super('server_configurations');
  }

  /**
   * サーバーIDで設定を検索
   */
  async findByServerId(serverId: string): Promise<Result<ServerConfiguration | null, Error>> {
    try {
      const stmt = this.db.prepare('SELECT * FROM server_configurations WHERE server_id = ?');
      const row = stmt.get(serverId);
      
      if (!row) {
        return { success: true, data: null };
      }

      const config = this.mapRowToEntity(row as Record<string, unknown>);
      return { success: true, data: config };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * 最新バージョンの設定を取得
   */
  async findLatestByServerId(serverId: string): Promise<Result<ServerConfiguration | null, Error>> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM server_configurations 
        WHERE server_id = ? 
        ORDER BY version DESC 
        LIMIT 1
      `);
      const row = stmt.get(serverId);
      
      if (!row) {
        return { success: true, data: null };
      }

      const config = this.mapRowToEntity(row as Record<string, unknown>);
      return { success: true, data: config };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * サーバーの設定履歴を取得
   */
  async findHistoryByServerId(serverId: string): Promise<Result<ServerConfiguration[], Error>> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM server_configurations 
        WHERE server_id = ? 
        ORDER BY version DESC
      `);
      const rows = stmt.all(serverId) as Record<string, unknown>[];
      
      const configs = rows.map(row => this.mapRowToEntity(row));
      return { success: true, data: configs };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * 特定バージョンの設定を取得
   */
  async findByServerIdAndVersion(serverId: string, version: number): Promise<Result<ServerConfiguration | null, Error>> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM server_configurations 
        WHERE server_id = ? AND version = ?
      `);
      const row = stmt.get([serverId, version]);
      
      if (!row) {
        return { success: true, data: null };
      }

      const config = this.mapRowToEntity(row as Record<string, unknown>);
      return { success: true, data: config };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * 設定を作成（バージョン自動インクリメント）
   */
  async createWithVersioning(input: CreateConfigurationInput): Promise<Result<ServerConfiguration, Error>> {
    try {
      // 次のバージョン番号を取得
      const nextVersionResult = await this.getNextVersion(input.server_id);
      if (!nextVersionResult.success) {
        return { success: false, error: nextVersionResult.error };
      }

      const entity = this.createEntityFromInput(input);
      entity.version = nextVersionResult.data;

      const { sql, params } = this.buildInsertQuery(entity);
      const stmt = this.db.prepare(sql);
      stmt.run(params);

      const createdResult = await this.findById(entity.id);
      if (!createdResult.success || !createdResult.data) {
        return {
          success: false,
          error: new Error('Failed to retrieve created configuration')
        };
      }

      return { success: true, data: createdResult.data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * 設定の比較
   */
  async compareVersions(serverId: string, version1: number, version2: number): Promise<Result<{
    version1: ServerConfiguration;
    version2: ServerConfiguration;
    differences: string[];
  }, Error>> {
    try {
      const config1Result = await this.findByServerIdAndVersion(serverId, version1);
      const config2Result = await this.findByServerIdAndVersion(serverId, version2);

      if (!config1Result.success || !config2Result.success) {
        return {
          success: false,
          error: new Error('Failed to retrieve configurations for comparison')
        };
      }

      if (!config1Result.data || !config2Result.data) {
        return {
          success: false,
          error: new Error('One or both configurations not found')
        };
      }

      const differences = this.calculateDifferences(config1Result.data, config2Result.data);

      return {
        success: true,
        data: {
          version1: config1Result.data,
          version2: config2Result.data,
          differences
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * 古い設定バージョンのクリーンアップ
   */
  async cleanupOldVersions(serverId: string, keepVersions: number = 10): Promise<Result<number, Error>> {
    try {
      const stmt = this.db.prepare(`
        DELETE FROM server_configurations 
        WHERE server_id = ? 
        AND id NOT IN (
          SELECT id FROM server_configurations 
          WHERE server_id = ? 
          ORDER BY version DESC 
          LIMIT ?
        )
      `);
      
      const result = stmt.run([serverId, serverId, keepVersions]);
      return { success: true, data: result.changes };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * 次のバージョン番号を取得
   */
  private async getNextVersion(serverId: string): Promise<Result<number, Error>> {
    try {
      const stmt = this.db.prepare(`
        SELECT MAX(version) as max_version 
        FROM server_configurations 
        WHERE server_id = ?
      `);
      const row = stmt.get(serverId) as { max_version: number | null };
      
      const nextVersion = (row.max_version || 0) + 1;
      return { success: true, data: nextVersion };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * 設定間の差分を計算
   */
  private calculateDifferences(config1: ServerConfiguration, config2: ServerConfiguration): string[] {
    const differences: string[] = [];

    // 環境変数の比較
    const env1 = JSON.stringify(config1.environment_variables, Object.keys(config1.environment_variables).sort());
    const env2 = JSON.stringify(config2.environment_variables, Object.keys(config2.environment_variables).sort());
    if (env1 !== env2) {
      differences.push('Environment variables changed');
    }

    // リソース制限の比較
    if (config1.memory_limit !== config2.memory_limit) {
      differences.push(`Memory limit: ${config1.memory_limit} → ${config2.memory_limit}`);
    }
    if (config1.cpu_limit !== config2.cpu_limit) {
      differences.push(`CPU limit: ${config1.cpu_limit} → ${config2.cpu_limit}`);
    }

    // ネットワーク設定の比較
    if (config1.network_mode !== config2.network_mode) {
      differences.push(`Network mode: ${config1.network_mode} → ${config2.network_mode}`);
    }

    const networks1 = JSON.stringify([...config1.networks].sort());
    const networks2 = JSON.stringify([...config2.networks].sort());
    if (networks1 !== networks2) {
      differences.push('Networks configuration changed');
    }

    // ボリュームの比較
    const volumes1 = JSON.stringify(config1.volumes, null, 2);
    const volumes2 = JSON.stringify(config2.volumes, null, 2);
    if (volumes1 !== volumes2) {
      differences.push('Volume mounts changed');
    }

    // ポートマッピングの比較
    const ports1 = JSON.stringify(config1.ports, Object.keys(config1.ports).sort());
    const ports2 = JSON.stringify(config2.ports, Object.keys(config2.ports).sort());
    if (ports1 !== ports2) {
      differences.push('Port mappings changed');
    }

    // その他の設定項目
    if (JSON.stringify(config1.docker_args) !== JSON.stringify(config2.docker_args)) {
      differences.push('Docker arguments changed');
    }
    if (config1.command !== config2.command) {
      differences.push(`Command: ${config1.command} → ${config2.command}`);
    }
    if (config1.entrypoint !== config2.entrypoint) {
      differences.push(`Entrypoint: ${config1.entrypoint} → ${config2.entrypoint}`);
    }
    if (config1.working_dir !== config2.working_dir) {
      differences.push(`Working directory: ${config1.working_dir} → ${config2.working_dir}`);
    }

    return differences;
  }

  // 基底クラスの抽象メソッドの実装
  protected mapRowToEntity(row: Record<string, unknown>): ServerConfiguration {
    return {
      id: row.id as string,
      server_id: row.server_id as string,
      environment_variables: JSON.parse(row.environment_variables as string),
      memory_limit: row.memory_limit as string | undefined,
      cpu_limit: row.cpu_limit as string | undefined,
      network_mode: row.network_mode as 'bridge' | 'host' | 'none' | 'container',
      networks: JSON.parse(row.networks as string),
      volumes: JSON.parse(row.volumes as string),
      ports: JSON.parse(row.ports as string),
      docker_args: JSON.parse(row.docker_args as string),
      command: row.command as string | undefined,
      entrypoint: row.entrypoint as string | undefined,
      working_dir: row.working_dir as string | undefined,
      version: row.version as number,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string
    };
  }

  protected createEntityFromInput(input: CreateConfigurationInput): ServerConfiguration {
    const timestamp = this.getCurrentTimestamp();
    return {
      id: this.generateId(),
      server_id: input.server_id,
      environment_variables: input.environment_variables || {},
      memory_limit: input.memory_limit,
      cpu_limit: input.cpu_limit,
      network_mode: input.network_mode || 'bridge',
      networks: input.networks || [],
      volumes: input.volumes || [],
      ports: input.ports || {},
      docker_args: input.docker_args || [],
      command: input.command,
      entrypoint: input.entrypoint,
      working_dir: input.working_dir,
      version: 1, // デフォルト値、実際は createWithVersioning で設定
      created_at: timestamp,
      updated_at: timestamp
    };
  }

  protected validateCreate(input: CreateConfigurationInput): ValidationResult {
    const errors: ValidationError[] = [];

    // サーバーID検証
    if (!input.server_id) {
      errors.push({ field: 'server_id', message: 'Server ID is required' });
    }

    // ネットワークモード検証
    if (input.network_mode && !['bridge', 'host', 'none', 'container'].includes(input.network_mode)) {
      errors.push({ field: 'network_mode', message: 'Invalid network mode' });
    }

    // メモリ制限形式検証
    if (input.memory_limit && !/^\d+[KMGT]?B?$/i.test(input.memory_limit)) {
      errors.push({ field: 'memory_limit', message: 'Invalid memory limit format (e.g., 512MB, 1GB)' });
    }

    // CPU制限形式検証
    if (input.cpu_limit && !/^\d*\.?\d+$/.test(input.cpu_limit)) {
      errors.push({ field: 'cpu_limit', message: 'Invalid CPU limit format (e.g., 0.5, 1.0)' });
    }

    // ボリュームマウント検証
    if (input.volumes) {
      for (const volume of input.volumes) {
        if (!volume.host || !volume.container) {
          errors.push({ field: 'volumes', message: 'Volume must have both host and container paths' });
        }
        if (!['rw', 'ro'].includes(volume.mode)) {
          errors.push({ field: 'volumes', message: 'Volume mode must be "rw" or "ro"' });
        }
      }
    }

    // ポートマッピング検証
    if (input.ports) {
      for (const [containerPort, hostPort] of Object.entries(input.ports)) {
        const containerPortNum = parseInt(containerPort);
        const hostPortNum = parseInt(hostPort);
        
        if (isNaN(containerPortNum) || containerPortNum < 1 || containerPortNum > 65535) {
          errors.push({ field: 'ports', message: 'Invalid container port number' });
        }
        if (isNaN(hostPortNum) || hostPortNum < 1 || hostPortNum > 65535) {
          errors.push({ field: 'ports', message: 'Invalid host port number' });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  protected validateUpdate(input: UpdateConfigurationInput): ValidationResult {
    const errors: ValidationError[] = [];

    // ネットワークモード検証（更新する場合）
    if (input.network_mode && !['bridge', 'host', 'none', 'container'].includes(input.network_mode)) {
      errors.push({ field: 'network_mode', message: 'Invalid network mode' });
    }

    // メモリ制限形式検証（更新する場合）
    if (input.memory_limit && !/^\d+[KMGT]?B?$/i.test(input.memory_limit)) {
      errors.push({ field: 'memory_limit', message: 'Invalid memory limit format (e.g., 512MB, 1GB)' });
    }

    // CPU制限形式検証（更新する場合）
    if (input.cpu_limit && !/^\d*\.?\d+$/.test(input.cpu_limit)) {
      errors.push({ field: 'cpu_limit', message: 'Invalid CPU limit format (e.g., 0.5, 1.0)' });
    }

    // ボリュームマウント検証（更新する場合）
    if (input.volumes) {
      for (const volume of input.volumes) {
        if (!volume.host || !volume.container) {
          errors.push({ field: 'volumes', message: 'Volume must have both host and container paths' });
        }
        if (!['rw', 'ro'].includes(volume.mode)) {
          errors.push({ field: 'volumes', message: 'Volume mode must be "rw" or "ro"' });
        }
      }
    }

    // ポートマッピング検証（更新する場合）
    if (input.ports) {
      for (const [containerPort, hostPort] of Object.entries(input.ports)) {
        const containerPortNum = parseInt(containerPort);
        const hostPortNum = parseInt(hostPort);
        
        if (isNaN(containerPortNum) || containerPortNum < 1 || containerPortNum > 65535) {
          errors.push({ field: 'ports', message: 'Invalid container port number' });
        }
        if (isNaN(hostPortNum) || hostPortNum < 1 || hostPortNum > 65535) {
          errors.push({ field: 'ports', message: 'Invalid host port number' });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private buildInsertQuery(entity: ServerConfiguration): { sql: string; params: unknown[] } {
    const fields = [
      'id', 'server_id', 'environment_variables', 'memory_limit', 'cpu_limit',
      'network_mode', 'networks', 'volumes', 'ports', 'docker_args',
      'command', 'entrypoint', 'working_dir', 'version', 'created_at', 'updated_at'
    ];
    
    const values = [
      entity.id,
      entity.server_id,
      JSON.stringify(entity.environment_variables),
      entity.memory_limit,
      entity.cpu_limit,
      entity.network_mode,
      JSON.stringify(entity.networks),
      JSON.stringify(entity.volumes),
      JSON.stringify(entity.ports),
      JSON.stringify(entity.docker_args),
      entity.command,
      entity.entrypoint,
      entity.working_dir,
      entity.version,
      entity.created_at,
      entity.updated_at
    ];

    const placeholders = fields.map(() => '?').join(', ');
    const sql = `INSERT INTO ${this.tableName} (${fields.join(', ')}) VALUES (${placeholders})`;
    
    return { sql, params: values };
  }
}