/**
 * Docker MCP CLI モックファイル
 * 
 * 機能要件：
 * - Docker MCP CLI の動作をモック
 * - テスト用のサーバー管理機能
 * - エラーケースのシミュレーション
 * - レスポンス時間の制御
 */

import { ServerInfo, ServerCreateOptions, ServerUpdateOptions } from '@/types/docker'

/**
 * モック Docker MCP レスポンス
 */
export interface MockDockerResponse<T = any> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
  timestamp: string
}

/**
 * Docker MCP CLI モック実装
 */
export class MockDockerMCP {
  private servers: Map<string, ServerInfo> = new Map()
  private isConnected: boolean = true
  private responseDelay: number = 100

  constructor() {
    this.initializeDefaultServers()
  }

  /**
   * デフォルトサーバーの初期化
   */
  private initializeDefaultServers(): void {
    const defaultServers: ServerInfo[] = [
      {
        id: 'nginx-web-server',
        name: 'Nginx Web Server',
        image: 'nginx:1.21-alpine',
        imageId: 'sha256:nginx-image-id',
        status: 'running',
        state: 'running',
        ports: [
          {
            containerPort: 80,
            hostPort: 8080,
            protocol: 'tcp',
          },
        ],
        environment: {
          NGINX_PORT: '80',
        },
        volumes: [],
        networks: ['bridge'],
        createdAt: new Date('2024-01-01T10:00:00Z').toISOString(),
        updatedAt: new Date('2024-01-01T10:00:00Z').toISOString(),
      },
      {
        id: 'redis-cache',
        name: 'Redis Cache',
        image: 'redis:7-alpine',
        imageId: 'sha256:redis-image-id',
        status: 'stopped',
        state: 'exited',
        ports: [
          {
            containerPort: 6379,
            hostPort: 6379,
            protocol: 'tcp',
          },
        ],
        environment: {},
        volumes: [
          {
            hostPath: '/data/redis',
            containerPath: '/data',
            mode: 'rw',
          },
        ],
        networks: ['bridge'],
        createdAt: new Date('2024-01-01T09:00:00Z').toISOString(),
        updatedAt: new Date('2024-01-01T11:30:00Z').toISOString(),
      },
    ]

    defaultServers.forEach(server => {
      this.servers.set(server.id, server)
    })
  }

  /**
   * 接続状態設定（テスト用）
   */
  setConnectionStatus(connected: boolean): void {
    this.isConnected = connected
  }

  /**
   * レスポンス遅延設定（テスト用）
   */
  setResponseDelay(delay: number): void {
    this.responseDelay = delay
  }

  /**
   * エラー応答生成
   */
  private createErrorResponse(code: string, message: string): MockDockerResponse {
    return {
      success: false,
      error: { code, message },
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * 成功応答生成
   */
  private createSuccessResponse<T>(data: T): MockDockerResponse<T> {
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    }
  }

  /**
   * レスポンス遅延シミュレーション
   */
  private async delay(): Promise<void> {
    if (this.responseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.responseDelay))
    }
  }

  /**
   * サーバー一覧取得
   */
  async listServers(): Promise<MockDockerResponse<ServerInfo[]>> {
    await this.delay()

    if (!this.isConnected) {
      return this.createErrorResponse(
        'CONNECTION_ERROR',
        'Docker daemon is not accessible'
      )
    }

    const servers = Array.from(this.servers.values())
    return this.createSuccessResponse(servers)
  }

  /**
   * サーバー詳細取得
   */
  async getServer(id: string): Promise<MockDockerResponse<ServerInfo>> {
    await this.delay()

    if (!this.isConnected) {
      return this.createErrorResponse(
        'CONNECTION_ERROR',
        'Docker daemon is not accessible'
      )
    }

    const server = this.servers.get(id)
    if (!server) {
      return this.createErrorResponse(
        'SERVER_NOT_FOUND',
        `Server with ID '${id}' not found`
      )
    }

    return this.createSuccessResponse(server)
  }

  /**
   * サーバー作成
   */
  async createServer(options: ServerCreateOptions): Promise<MockDockerResponse<ServerInfo>> {
    await this.delay()

    if (!this.isConnected) {
      return this.createErrorResponse(
        'CONNECTION_ERROR',
        'Docker daemon is not accessible'
      )
    }

    // 名前の重複チェック
    const existingServer = Array.from(this.servers.values())
      .find(server => server.name === options.name)
    if (existingServer) {
      return this.createErrorResponse(
        'SERVER_NAME_EXISTS',
        `Server with name '${options.name}' already exists`
      )
    }

    const now = new Date().toISOString()
    const server: ServerInfo = {
      id: 'server-' + Math.random().toString(36).substr(2, 9),
      name: options.name,
      image: options.image,
      imageId: 'sha256:' + Math.random().toString(36).substr(2, 16),
      status: 'created',
      state: 'created',
      ports: options.ports || [],
      environment: options.environment || {},
      volumes: options.volumes || [],
      networks: options.networks || ['bridge'],
      createdAt: now,
      updatedAt: now,
    }

    this.servers.set(server.id, server)
    return this.createSuccessResponse(server)
  }

  /**
   * サーバー更新
   */
  async updateServer(id: string, options: ServerUpdateOptions): Promise<MockDockerResponse<ServerInfo>> {
    await this.delay()

    if (!this.isConnected) {
      return this.createErrorResponse(
        'CONNECTION_ERROR',
        'Docker daemon is not accessible'
      )
    }

    const server = this.servers.get(id)
    if (!server) {
      return this.createErrorResponse(
        'SERVER_NOT_FOUND',
        `Server with ID '${id}' not found`
      )
    }

    const updatedServer: ServerInfo = {
      ...server,
      ...options,
      updatedAt: new Date().toISOString(),
    }

    this.servers.set(id, updatedServer)
    return this.createSuccessResponse(updatedServer)
  }

  /**
   * サーバー開始
   */
  async startServer(id: string): Promise<MockDockerResponse<ServerInfo>> {
    await this.delay()

    if (!this.isConnected) {
      return this.createErrorResponse(
        'CONNECTION_ERROR',
        'Docker daemon is not accessible'
      )
    }

    const server = this.servers.get(id)
    if (!server) {
      return this.createErrorResponse(
        'SERVER_NOT_FOUND',
        `Server with ID '${id}' not found`
      )
    }

    if (server.status === 'running') {
      return this.createErrorResponse(
        'SERVER_ALREADY_RUNNING',
        `Server '${server.name}' is already running`
      )
    }

    const updatedServer: ServerInfo = {
      ...server,
      status: 'running',
      state: 'running',
      updatedAt: new Date().toISOString(),
    }

    this.servers.set(id, updatedServer)
    return this.createSuccessResponse(updatedServer)
  }

  /**
   * サーバー停止
   */
  async stopServer(id: string): Promise<MockDockerResponse<ServerInfo>> {
    await this.delay()

    if (!this.isConnected) {
      return this.createErrorResponse(
        'CONNECTION_ERROR',
        'Docker daemon is not accessible'
      )
    }

    const server = this.servers.get(id)
    if (!server) {
      return this.createErrorResponse(
        'SERVER_NOT_FOUND',
        `Server with ID '${id}' not found`
      )
    }

    if (server.status === 'stopped') {
      return this.createErrorResponse(
        'SERVER_ALREADY_STOPPED',
        `Server '${server.name}' is already stopped`
      )
    }

    const updatedServer: ServerInfo = {
      ...server,
      status: 'stopped',
      state: 'exited',
      updatedAt: new Date().toISOString(),
    }

    this.servers.set(id, updatedServer)
    return this.createSuccessResponse(updatedServer)
  }

  /**
   * サーバー削除
   */
  async deleteServer(id: string): Promise<MockDockerResponse<{ id: string }>> {
    await this.delay()

    if (!this.isConnected) {
      return this.createErrorResponse(
        'CONNECTION_ERROR',
        'Docker daemon is not accessible'
      )
    }

    const server = this.servers.get(id)
    if (!server) {
      return this.createErrorResponse(
        'SERVER_NOT_FOUND',
        `Server with ID '${id}' not found`
      )
    }

    if (server.status === 'running') {
      return this.createErrorResponse(
        'SERVER_STILL_RUNNING',
        `Server '${server.name}' must be stopped before deletion`
      )
    }

    this.servers.delete(id)
    return this.createSuccessResponse({ id })
  }

  /**
   * テスト用: 全サーバーリセット
   */
  resetServers(): void {
    this.servers.clear()
    this.initializeDefaultServers()
  }
}

// デフォルトインスタンスをエクスポート
export const mockDockerMCP = new MockDockerMCP()