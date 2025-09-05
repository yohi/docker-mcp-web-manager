/**
 * 認証フロー 結合テスト
 * 
 * 機能要件：
 * - ログインフォームからダッシュボードまでの統合テスト
 * - 認証コンテキストの統合
 * - ページ遷移の検証
 * - エラーハンドリングの検証
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import { useSession, signIn } from 'next-auth/react'
import LoginForm from '@/components/auth/LoginForm'
import AuthProvider from '@/components/auth/AuthProvider'
import ProtectedRoute from '@/components/auth/ProtectedRoute'
import DashboardPage from '@/components/dashboard/DashboardPage'
import ToastNotification from '@/components/ui/ToastNotification'
import {
  createTestSession,
  createTestAdminSession,
  setupFetchMock,
  expectElementVisible,
  expectElementHidden,
} from '../../utils/test-helpers'

// Next.js router モック
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: () => ({
    get: jest.fn(),
  }),
  usePathname: () => '/dashboard',
}))

// NextAuth モック
jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}))

const mockPush = jest.fn()
const mockUseSession = useSession as jest.MockedFunction<typeof useSession>
const mockSignIn = signIn as jest.MockedFunction<typeof signIn>
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>

// テストコンポーネント: 完全な認証フロー
const AuthFlowTestApp = ({ 
  initialSession = null,
  showProtectedContent = true 
}: { 
  initialSession?: any
  showProtectedContent?: boolean 
}) => {
  return (
    <AuthProvider>
      <ToastNotification />
      {showProtectedContent ? (
        <ProtectedRoute>
          <DashboardPage />
        </ProtectedRoute>
      ) : (
        <LoginForm />
      )}
    </AuthProvider>
  )
}

describe('Auth Flow Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    mockUseRouter.mockReturnValue({
      push: mockPush,
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
    } as any)

    // デフォルトのAPI レスポンスモック
    setupFetchMock([
      {
        url: '/api/servers',
        status: 200,
        data: { servers: [] },
      },
    ])
  })

  describe('未認証ユーザーのフロー', () => {
    it('未認証ユーザーはログインフォームが表示される', () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: jest.fn(),
      })

      render(<AuthFlowTestApp showProtectedContent={false} />)

      expectElementVisible(screen.getByRole('form', { name: /ログイン/i }))
      expect(screen.getByLabelText(/メールアドレス/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/パスワード/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /ログイン/i })).toBeInTheDocument()
    })

    it('有効な認証情報でログインできる', async () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: jest.fn(),
      })

      mockSignIn.mockResolvedValue({
        ok: true,
        status: 200,
        error: null,
        url: '/dashboard',
      } as any)

      render(<AuthFlowTestApp showProtectedContent={false} />)

      // フォーム入力
      const emailInput = screen.getByLabelText(/メールアドレス/i)
      const passwordInput = screen.getByLabelText(/パスワード/i)
      const submitButton = screen.getByRole('button', { name: /ログイン/i })

      fireEvent.change(emailInput, { target: { value: 'admin@test.com' } })
      fireEvent.change(passwordInput, { target: { value: 'test-password-123' } })
      fireEvent.click(submitButton)

      await waitFor(() => {
        expect(mockSignIn).toHaveBeenCalledWith('credentials', {
          email: 'admin@test.com',
          password: 'test-password-123',
          redirect: false,
        })
      })

      // ダッシュボードにリダイレクト
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/dashboard')
      })
    })

    it('無効な認証情報でエラーメッセージが表示される', async () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: jest.fn(),
      })

      mockSignIn.mockResolvedValue({
        ok: false,
        status: 401,
        error: 'CredentialsSignin',
        url: null,
      } as any)

      render(<AuthFlowTestApp showProtectedContent={false} />)

      // フォーム入力と送信
      const emailInput = screen.getByLabelText(/メールアドレス/i)
      const passwordInput = screen.getByLabelText(/パスワード/i)
      const submitButton = screen.getByRole('button', { name: /ログイン/i })

      fireEvent.change(emailInput, { target: { value: 'invalid@test.com' } })
      fireEvent.change(passwordInput, { target: { value: 'wrong-password' } })
      fireEvent.click(submitButton)

      // エラーメッセージの表示確認
      await waitFor(() => {
        expect(screen.getByText(/認証に失敗しました/i)).toBeInTheDocument()
      })

      // ログインフォームが継続表示されることを確認
      expect(screen.getByRole('form', { name: /ログイン/i })).toBeInTheDocument()
      expect(mockPush).not.toHaveBeenCalled()
    })
  })

  describe('認証済みユーザーのフロー', () => {
    it('認証済みユーザーはダッシュボードが表示される', async () => {
      const testSession = createTestSession()
      mockUseSession.mockReturnValue({
        data: { user: testSession, expires: '2030-01-01T00:00:00.000Z' },
        status: 'authenticated',
        update: jest.fn(),
      })

      render(<AuthFlowTestApp />)

      await waitFor(() => {
        expectElementVisible(screen.getByRole('main'))
      })

      // ダッシュボードのコンテンツ確認
      expect(screen.getByText(/ダッシュボード/i)).toBeInTheDocument()
      expect(screen.getByText(/サーバー管理/i)).toBeInTheDocument()
    })

    it('管理者ユーザーは管理者機能が利用できる', async () => {
      const adminSession = createTestAdminSession()
      mockUseSession.mockReturnValue({
        data: { user: adminSession, expires: '2030-01-01T00:00:00.000Z' },
        status: 'authenticated',
        update: jest.fn(),
      })

      render(<AuthFlowTestApp />)

      await waitFor(() => {
        expect(screen.getByText(/サーバーを作成/i)).toBeInTheDocument()
      })

      // 管理者専用ボタンの存在確認
      expect(screen.getByRole('button', { name: /新規サーバー/i })).toBeInTheDocument()
    })

    it('一般ユーザーは管理者機能が非表示になる', async () => {
      const userSession = createTestSession() // 一般ユーザー
      mockUseSession.mockReturnValue({
        data: { user: userSession, expires: '2030-01-01T00:00:00.000Z' },
        status: 'authenticated',
        update: jest.fn(),
      })

      render(<AuthFlowTestApp />)

      await waitFor(() => {
        expect(screen.getByText(/ダッシュボード/i)).toBeInTheDocument()
      })

      // 管理者専用機能が非表示であることを確認
      expect(screen.queryByRole('button', { name: /新規サーバー/i })).not.toBeInTheDocument()
      expect(screen.queryByText(/サーバーを作成/i)).not.toBeInTheDocument()
    })
  })

  describe('セッション状態変更の処理', () => {
    it('ログイン後にセッションが更新される', async () => {
      // 初期状態：未認証
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: jest.fn(),
      })

      const { rerender } = render(<AuthFlowTestApp showProtectedContent={false} />)

      // ログインフォームが表示されていることを確認
      expect(screen.getByRole('form', { name: /ログイン/i })).toBeInTheDocument()

      // セッション状態を認証済みに変更
      const testSession = createTestSession()
      mockUseSession.mockReturnValue({
        data: { user: testSession, expires: '2030-01-01T00:00:00.000Z' },
        status: 'authenticated',
        update: jest.fn(),
      })

      rerender(<AuthFlowTestApp />)

      // ダッシュボードが表示されることを確認
      await waitFor(() => {
        expect(screen.getByText(/ダッシュボード/i)).toBeInTheDocument()
      })
    })

    it('ログアウト後にログインフォームにリダイレクトされる', async () => {
      // 初期状態：認証済み
      const testSession = createTestSession()
      mockUseSession.mockReturnValue({
        data: { user: testSession, expires: '2030-01-01T00:00:00.000Z' },
        status: 'authenticated',
        update: jest.fn(),
      })

      const { rerender } = render(<AuthFlowTestApp />)

      // ダッシュボードが表示されていることを確認
      await waitFor(() => {
        expect(screen.getByText(/ダッシュボード/i)).toBeInTheDocument()
      })

      // セッション状態を未認証に変更
      mockUseSession.mockReturnValue({
        data: null,
        status: 'unauthenticated',
        update: jest.fn(),
      })

      rerender(<AuthFlowTestApp showProtectedContent={false} />)

      // ログインフォームが表示されることを確認
      expect(screen.getByRole('form', { name: /ログイン/i })).toBeInTheDocument()
    })
  })

  describe('権限に基づくアクセス制御', () => {
    it('servers:view権限がないユーザーはアクセス拒否される', async () => {
      const restrictedSession = createTestSession({
        permissions: [], // 権限なし
      })

      mockUseSession.mockReturnValue({
        data: { user: restrictedSession, expires: '2030-01-01T00:00:00.000Z' },
        status: 'authenticated',
        update: jest.fn(),
      })

      render(<AuthFlowTestApp />)

      await waitFor(() => {
        expect(screen.getByText(/アクセス権限がありません/i)).toBeInTheDocument()
      })

      // ダッシュボードコンテンツが表示されないことを確認
      expect(screen.queryByText(/サーバー管理/i)).not.toBeInTheDocument()
    })

    it('必要な権限があるユーザーは正常にアクセスできる', async () => {
      const authorizedSession = createTestSession({
        permissions: ['servers:view', 'servers:manage'],
      })

      mockUseSession.mockReturnValue({
        data: { user: authorizedSession, expires: '2030-01-01T00:00:00.000Z' },
        status: 'authenticated',
        update: jest.fn(),
      })

      render(<AuthFlowTestApp />)

      await waitFor(() => {
        expect(screen.getByText(/ダッシュボード/i)).toBeInTheDocument()
        expect(screen.getByText(/サーバー管理/i)).toBeInTheDocument()
      })
    })
  })

  describe('エラーハンドリング統合', () => {
    it('API エラー時にトースト通知が表示される', async () => {
      const testSession = createTestAdminSession()
      mockUseSession.mockReturnValue({
        data: { user: testSession, expires: '2030-01-01T00:00:00.000Z' },
        status: 'authenticated',
        update: jest.fn(),
      })

      // API エラーレスポンスをセットアップ
      setupFetchMock([
        {
          url: '/api/servers',
          status: 500,
          error: true,
        },
      ])

      render(<AuthFlowTestApp />)

      // エラートースト通知の表示確認
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
        expect(screen.getByText(/エラーが発生しました/i)).toBeInTheDocument()
      })
    })

    it('ネットワークエラー時に適切なエラーメッセージが表示される', async () => {
      const testSession = createTestSession()
      mockUseSession.mockReturnValue({
        data: { user: testSession, expires: '2030-01-01T00:00:00.000Z' },
        status: 'authenticated',
        update: jest.fn(),
      })

      // ネットワークエラーをシミュレート
      global.fetch = jest.fn().mockRejectedValue(new Error('Network Error'))

      render(<AuthFlowTestApp />)

      await waitFor(() => {
        expect(screen.getByText(/ネットワークエラー/i)).toBeInTheDocument()
      })
    })
  })
})