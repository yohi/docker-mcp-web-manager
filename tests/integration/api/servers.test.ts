/**
 * サーバーAPI 結合テスト
 * 
 * 機能要件：
 * - API エンドポイントの統合テスト
 * - 認証・認可の検証
 * - エラーハンドリングの検証
 * - バリデーションの検証
 */

import { NextRequest } from 'next/server'
import { GET, POST, PUT, DELETE } from '@/app/api/servers/route'
import { GET as GetServerById, PUT as UpdateServer, DELETE as DeleteServer } from '@/app/api/servers/[id]/route'
import { POST as StartServer } from '@/app/api/servers/[id]/start/route'
import { POST as StopServer } from '@/app/api/servers/[id]/stop/route'
import {
  createMockRequest,
  createTestAdminSession,
  createTestSession,
  validateApiResponse,
  validateErrorResponse,
} from '../../utils/test-helpers'
import { mockDockerMCP } from '../../mocks/docker-mcp'

// NextAuth のモック
jest.mock('next-auth/next', () => ({
  getServerSession: jest.fn(),
}))

// Docker MCP のモック
jest.mock('@/lib/docker/mcp-client', () => ({
  dockerMCP: mockDockerMCP,
}))

const mockGetServerSession = require('next-auth/next').getServerSession

describe('Servers API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDockerMCP.resetServers()
    mockDockerMCP.setConnectionStatus(true)
  })

  describe('GET /api/servers', () => {
    it('認証されたユーザーがサーバー一覧を取得できる', async () => {
      // セッションモック設定
      mockGetServerSession.mockResolvedValue({
        user: createTestSession(),
      })

      const request = createMockRequest('http://localhost:3000/api/servers')
      const response = await GET(request)

      const responseData = validateApiResponse(response, 200)
      const data = await response.json()

      expect(data.servers).toBeInstanceOf(Array)
      expect(data.servers.length).toBeGreaterThan(0)
      expect(data.servers[0]).toHaveProperty('id')
      expect(data.servers[0]).toHaveProperty('name')
      expect(data.servers[0]).toHaveProperty('status')
    })

    it('未認証ユーザーは401エラーを受ける', async () => {
      // セッションなし
      mockGetServerSession.mockResolvedValue(null)

      const request = createMockRequest('http://localhost:3000/api/servers')
      const response = await GET(request)

      validateErrorResponse(response, 401, 'UNAUTHORIZED')
    })

    it('Docker接続エラー時は502エラーを返す', async () => {
      mockGetServerSession.mockResolvedValue({
        user: createTestSession(),
      })

      // Docker接続エラーをシミュレート
      mockDockerMCP.setConnectionStatus(false)

      const request = createMockRequest('http://localhost:3000/api/servers')
      const response = await GET(request)

      validateErrorResponse(response, 502, 'CONNECTION_ERROR')
    })
  })

  describe('POST /api/servers', () => {
    const validServerData = {
      name: 'Test Server',
      image: 'nginx:latest',
      ports: [{ containerPort: 80, hostPort: 8080, protocol: 'tcp' }],
      environment: { NODE_ENV: 'production' },
    }

    it('管理者がサーバーを作成できる', async () => {
      mockGetServerSession.mockResolvedValue({
        user: createTestAdminSession(),
      })

      const request = createMockRequest('http://localhost:3000/api/servers', {
        method: 'POST',
        body: validServerData,
      })

      const response = await POST(request)

      const responseData = validateApiResponse(response, 201)
      const data = await response.json()

      expect(data.server).toHaveProperty('id')
      expect(data.server.name).toBe(validServerData.name)
      expect(data.server.image).toBe(validServerData.image)
      expect(data.server.status).toBe('created')
    })

    it('一般ユーザーはサーバー作成で403エラーを受ける', async () => {
      mockGetServerSession.mockResolvedValue({
        user: createTestSession(), // 一般ユーザー
      })

      const request = createMockRequest('http://localhost:3000/api/servers', {
        method: 'POST',
        body: validServerData,
      })

      const response = await POST(request)

      validateErrorResponse(response, 403, 'INSUFFICIENT_PERMISSIONS')
    })

    it('無効なデータで400エラーを返す', async () => {
      mockGetServerSession.mockResolvedValue({
        user: createTestAdminSession(),
      })

      const invalidData = {
        name: '', // 空の名前
        image: 'invalid-image', // 無効なイメージ
      }

      const request = createMockRequest('http://localhost:3000/api/servers', {
        method: 'POST',
        body: invalidData,
      })

      const response = await POST(request)

      validateErrorResponse(response, 400, 'VALIDATION_ERROR')
    })

    it('重複する名前で409エラーを返す', async () => {
      mockGetServerSession.mockResolvedValue({
        user: createTestAdminSession(),
      })

      // 既存のサーバー名を使用
      const duplicateData = {
        ...validServerData,
        name: 'Nginx Web Server', // 既存のサーバー名
      }

      const request = createMockRequest('http://localhost:3000/api/servers', {
        method: 'POST',
        body: duplicateData,
      })

      const response = await POST(request)

      validateErrorResponse(response, 409, 'SERVER_NAME_EXISTS')
    })
  })

  describe('GET /api/servers/[id]', () => {
    it('認証されたユーザーが特定のサーバー情報を取得できる', async () => {
      mockGetServerSession.mockResolvedValue({
        user: createTestSession(),
      })

      const request = createMockRequest('http://localhost:3000/api/servers/nginx-web-server')
      const response = await GetServerById(request, { params: { id: 'nginx-web-server' } })

      const responseData = validateApiResponse(response, 200)
      const data = await response.json()

      expect(data.server).toHaveProperty('id', 'nginx-web-server')
      expect(data.server).toHaveProperty('name')
      expect(data.server).toHaveProperty('image')
      expect(data.server).toHaveProperty('status')
    })

    it('存在しないサーバーIDで404エラーを返す', async () => {
      mockGetServerSession.mockResolvedValue({
        user: createTestSession(),
      })

      const request = createMockRequest('http://localhost:3000/api/servers/non-existent-id')
      const response = await GetServerById(request, { params: { id: 'non-existent-id' } })

      validateErrorResponse(response, 404, 'SERVER_NOT_FOUND')
    })
  })

  describe('PUT /api/servers/[id]', () => {
    it('管理者がサーバー情報を更新できる', async () => {
      mockGetServerSession.mockResolvedValue({
        user: createTestAdminSession(),
      })

      const updateData = {
        name: 'Updated Nginx Server',
        environment: {
          NODE_ENV: 'development',
        },
      }

      const request = createMockRequest('http://localhost:3000/api/servers/nginx-web-server', {
        method: 'PUT',
        body: updateData,
      })

      const response = await UpdateServer(request, { params: { id: 'nginx-web-server' } })

      const responseData = validateApiResponse(response, 200)
      const data = await response.json()

      expect(data.server.name).toBe(updateData.name)
      expect(data.server.environment.NODE_ENV).toBe('development')
    })

    it('一般ユーザーはサーバー更新で403エラーを受ける', async () => {
      mockGetServerSession.mockResolvedValue({
        user: createTestSession(),
      })

      const request = createMockRequest('http://localhost:3000/api/servers/nginx-web-server', {
        method: 'PUT',
        body: { name: 'Updated Name' },
      })

      const response = await UpdateServer(request, { params: { id: 'nginx-web-server' } })

      validateErrorResponse(response, 403, 'INSUFFICIENT_PERMISSIONS')
    })
  })

  describe('POST /api/servers/[id]/start', () => {
    it('管理者がサーバーを開始できる', async () => {
      mockGetServerSession.mockResolvedValue({
        user: createTestAdminSession(),
      })

      const request = createMockRequest('http://localhost:3000/api/servers/redis-cache/start', {
        method: 'POST',
      })

      const response = await StartServer(request, { params: { id: 'redis-cache' } })

      const responseData = validateApiResponse(response, 200)
      const data = await response.json()

      expect(data.server.status).toBe('running')
      expect(data.server.state).toBe('running')
    })

    it('すでに実行中のサーバーで409エラーを返す', async () => {
      mockGetServerSession.mockResolvedValue({
        user: createTestAdminSession(),
      })

      const request = createMockRequest('http://localhost:3000/api/servers/nginx-web-server/start', {
        method: 'POST',
      })

      const response = await StartServer(request, { params: { id: 'nginx-web-server' } })

      validateErrorResponse(response, 409, 'SERVER_ALREADY_RUNNING')
    })
  })

  describe('POST /api/servers/[id]/stop', () => {
    it('管理者がサーバーを停止できる', async () => {
      mockGetServerSession.mockResolvedValue({
        user: createTestAdminSession(),
      })

      const request = createMockRequest('http://localhost:3000/api/servers/nginx-web-server/stop', {
        method: 'POST',
      })

      const response = await StopServer(request, { params: { id: 'nginx-web-server' } })

      const responseData = validateApiResponse(response, 200)
      const data = await response.json()

      expect(data.server.status).toBe('stopped')
      expect(data.server.state).toBe('exited')
    })

    it('すでに停止中のサーバーで409エラーを返す', async () => {
      mockGetServerSession.mockResolvedValue({
        user: createTestAdminSession(),
      })

      const request = createMockRequest('http://localhost:3000/api/servers/redis-cache/stop', {
        method: 'POST',
      })

      const response = await StopServer(request, { params: { id: 'redis-cache' } })

      validateErrorResponse(response, 409, 'SERVER_ALREADY_STOPPED')
    })
  })

  describe('DELETE /api/servers/[id]', () => {
    it('管理者がサーバーを削除できる', async () => {
      mockGetServerSession.mockResolvedValue({
        user: createTestAdminSession(),
      })

      const request = createMockRequest('http://localhost:3000/api/servers/redis-cache', {
        method: 'DELETE',
      })

      const response = await DeleteServer(request, { params: { id: 'redis-cache' } })

      const responseData = validateApiResponse(response, 200)
      const data = await response.json()

      expect(data.message).toContain('削除')
      expect(data.serverId).toBe('redis-cache')
    })

    it('実行中のサーバー削除で409エラーを返す', async () => {
      mockGetServerSession.mockResolvedValue({
        user: createTestAdminSession(),
      })

      const request = createMockRequest('http://localhost:3000/api/servers/nginx-web-server', {
        method: 'DELETE',
      })

      const response = await DeleteServer(request, { params: { id: 'nginx-web-server' } })

      validateErrorResponse(response, 409, 'SERVER_STILL_RUNNING')
    })
  })
})