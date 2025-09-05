/**
 * 認証API 結合テスト
 * 
 * 機能要件：
 * - NextAuth.js v5 統合テスト
 * - 認証プロバイダーのテスト
 * - セッション管理のテスト
 * - エラーハンドリングの検証
 */

import { NextRequest } from 'next/server'
import { POST as SignIn } from '@/app/api/auth/signin/route'
import { POST as SignOut } from '@/app/api/auth/signout/route'
import { GET as Session } from '@/app/api/auth/session/route'
import {
  createMockRequest,
  createTestSession,
  validateApiResponse,
  validateErrorResponse,
  setupFetchMock,
} from '../../utils/test-helpers'

// NextAuth のモック
jest.mock('next-auth/next', () => ({
  getServerSession: jest.fn(),
}))

// NextAuth React のモック
jest.mock('next-auth/react', () => ({
  signIn: jest.fn(),
  signOut: jest.fn(),
  getSession: jest.fn(),
  useSession: () => ({
    data: null,
    status: 'unauthenticated',
  }),
}))

const mockGetServerSession = require('next-auth/next').getServerSession
const { signIn, signOut, getSession } = require('next-auth/react')

describe('Auth API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('POST /api/auth/signin', () => {
    it('有効な認証情報でサインインできる', async () => {
      const validCredentials = {
        email: 'admin@test.com',
        password: 'test-password-123',
        provider: 'credentials',
      }

      signIn.mockResolvedValue({
        ok: true,
        status: 200,
        error: null,
        url: '/dashboard',
      })

      const request = createMockRequest('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        body: validCredentials,
      })

      const response = await SignIn(request)

      const responseData = validateApiResponse(response, 200)
      const data = await response.json()

      expect(data.success).toBe(true)
      expect(data.redirectUrl).toBe('/dashboard')
      expect(signIn).toHaveBeenCalledWith('credentials', {
        email: validCredentials.email,
        password: validCredentials.password,
        redirect: false,
      })
    })

    it('無効な認証情報で401エラーを返す', async () => {
      const invalidCredentials = {
        email: 'invalid@test.com',
        password: 'wrong-password',
        provider: 'credentials',
      }

      signIn.mockResolvedValue({
        ok: false,
        status: 401,
        error: 'CredentialsSignin',
        url: null,
      })

      const request = createMockRequest('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        body: invalidCredentials,
      })

      const response = await SignIn(request)

      validateErrorResponse(response, 401, 'INVALID_CREDENTIALS')
    })

    it('バリデーションエラーで400エラーを返す', async () => {
      const invalidData = {
        email: 'invalid-email', // 無効なメール形式
        password: '123', // 短すぎるパスワード
        provider: 'credentials',
      }

      const request = createMockRequest('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        body: invalidData,
      })

      const response = await SignIn(request)

      validateErrorResponse(response, 400, 'VALIDATION_ERROR')
    })

    it('Bitwardenプロバイダーでサインインできる', async () => {
      const bitwardenAuth = {
        email: 'admin@test.com',
        password: 'bitwarden-password',
        provider: 'bitwarden',
      }

      signIn.mockResolvedValue({
        ok: true,
        status: 200,
        error: null,
        url: '/dashboard',
      })

      // Bitwarden API レスポンスをモック
      setupFetchMock([
        {
          url: '/api/auth/bitwarden',
          status: 200,
          data: {
            access_token: 'bitwarden-token',
            user: {
              id: 'bitwarden-user-id',
              email: 'admin@test.com',
              name: 'Admin User',
            },
          },
        },
      ])

      const request = createMockRequest('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        body: bitwardenAuth,
      })

      const response = await SignIn(request)

      const responseData = validateApiResponse(response, 200)
      const data = await response.json()

      expect(data.success).toBe(true)
      expect(data.provider).toBe('bitwarden')
    })

    it('無効なプロバイダーで400エラーを返す', async () => {
      const invalidProvider = {
        email: 'admin@test.com',
        password: 'test-password',
        provider: 'invalid-provider',
      }

      const request = createMockRequest('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        body: invalidProvider,
      })

      const response = await SignIn(request)

      validateErrorResponse(response, 400, 'VALIDATION_ERROR')
    })
  })

  describe('POST /api/auth/signout', () => {
    it('認証されたユーザーがサインアウトできる', async () => {
      mockGetServerSession.mockResolvedValue({
        user: createTestSession(),
      })

      signOut.mockResolvedValue({
        ok: true,
      })

      const request = createMockRequest('http://localhost:3000/api/auth/signout', {
        method: 'POST',
      })

      const response = await SignOut(request)

      const responseData = validateApiResponse(response, 200)
      const data = await response.json()

      expect(data.success).toBe(true)
      expect(data.message).toContain('サインアウト')
      expect(signOut).toHaveBeenCalledWith({ redirect: false })
    })

    it('未認証ユーザーでも正常にサインアウト処理を行う', async () => {
      mockGetServerSession.mockResolvedValue(null)

      signOut.mockResolvedValue({
        ok: true,
      })

      const request = createMockRequest('http://localhost:3000/api/auth/signout', {
        method: 'POST',
      })

      const response = await SignOut(request)

      const responseData = validateApiResponse(response, 200)
      const data = await response.json()

      expect(data.success).toBe(true)
      expect(signOut).toHaveBeenCalled()
    })
  })

  describe('GET /api/auth/session', () => {
    it('認証されたユーザーのセッション情報を取得できる', async () => {
      const testUser = createTestSession()
      mockGetServerSession.mockResolvedValue({
        user: testUser,
        expires: '2030-01-01T00:00:00.000Z',
      })

      const request = createMockRequest('http://localhost:3000/api/auth/session')
      const response = await Session(request)

      const responseData = validateApiResponse(response, 200)
      const data = await response.json()

      expect(data.session).toBeDefined()
      expect(data.session.user).toMatchObject({
        id: testUser.id,
        email: testUser.email,
        name: testUser.name,
        role: testUser.role,
        permissions: testUser.permissions,
      })
      expect(data.session.expires).toBeDefined()
    })

    it('未認証ユーザーはnullセッションを受ける', async () => {
      mockGetServerSession.mockResolvedValue(null)

      const request = createMockRequest('http://localhost:3000/api/auth/session')
      const response = await Session(request)

      const responseData = validateApiResponse(response, 200)
      const data = await response.json()

      expect(data.session).toBe(null)
      expect(data.authenticated).toBe(false)
    })
  })

  describe('セッション管理統合テスト', () => {
    it('完全な認証フロー（サインイン → セッション確認 → サインアウト）', async () => {
      // 1. サインイン
      const credentials = {
        email: 'admin@test.com',
        password: 'test-password-123',
        provider: 'credentials',
      }

      signIn.mockResolvedValue({
        ok: true,
        status: 200,
        error: null,
        url: '/dashboard',
      })

      const signinRequest = createMockRequest('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        body: credentials,
      })

      const signinResponse = await SignIn(signinRequest)
      expect(signinResponse.status).toBe(200)

      // 2. セッション確認
      const testUser = createTestSession()
      mockGetServerSession.mockResolvedValue({
        user: testUser,
        expires: '2030-01-01T00:00:00.000Z',
      })

      const sessionRequest = createMockRequest('http://localhost:3000/api/auth/session')
      const sessionResponse = await Session(sessionRequest)
      
      const sessionData = await sessionResponse.json()
      expect(sessionData.session).toBeDefined()
      expect(sessionData.session.user.email).toBe(testUser.email)

      // 3. サインアウト
      signOut.mockResolvedValue({
        ok: true,
      })

      const signoutRequest = createMockRequest('http://localhost:3000/api/auth/signout', {
        method: 'POST',
      })

      const signoutResponse = await SignOut(signoutRequest)
      expect(signoutResponse.status).toBe(200)

      // 4. セッション無効化確認
      mockGetServerSession.mockResolvedValue(null)

      const finalSessionRequest = createMockRequest('http://localhost:3000/api/auth/session')
      const finalSessionResponse = await Session(finalSessionRequest)
      
      const finalSessionData = await finalSessionResponse.json()
      expect(finalSessionData.session).toBe(null)
      expect(finalSessionData.authenticated).toBe(false)
    })

    it('並行セッション処理の整合性', async () => {
      const testUser = createTestSession()
      mockGetServerSession.mockResolvedValue({
        user: testUser,
        expires: '2030-01-01T00:00:00.000Z',
      })

      // 複数の並行セッションリクエスト
      const promises = Array.from({ length: 5 }, () => {
        const request = createMockRequest('http://localhost:3000/api/auth/session')
        return Session(request)
      })

      const responses = await Promise.all(promises)

      // すべてのレスポンスが一貫していることを確認
      for (const response of responses) {
        expect(response.status).toBe(200)
        const data = await response.json()
        expect(data.session.user.id).toBe(testUser.id)
      }
    })
  })
})