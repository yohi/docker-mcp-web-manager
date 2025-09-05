/**
 * テストヘルパーユーティリティ
 * 
 * 機能要件：
 * - 共通テストユーティリティ関数
 * - モックデータ生成
 * - テスト環境セットアップ
 * - API レスポンスヘルパー
 */

import { NextRequest } from 'next/server'
import { ExtendedUser } from '@/components/auth/AuthProvider'
import { ServerInfo } from '@/types/docker'
import { CustomError } from '@/lib/errors/CustomError'

/**
 * テスト用ユーザーセッション作成
 */
export function createTestSession(overrides: Partial<ExtendedUser> = {}): ExtendedUser {
  return {
    id: 'test-user-id',
    name: 'Test User',
    email: 'test@example.com',
    role: 'user',
    permissions: ['servers:view'],
    isActive: true,
    ...overrides,
  }
}

/**
 * テスト用管理者セッション作成
 */
export function createTestAdminSession(overrides: Partial<ExtendedUser> = {}): ExtendedUser {
  return {
    id: 'test-admin-id',
    name: 'Test Admin',
    email: 'admin@example.com',
    role: 'admin',
    permissions: [
      'servers:view',
      'servers:create',
      'servers:update',
      'servers:delete',
      'servers:manage',
      'users:view',
      'users:manage',
    ],
    isActive: true,
    ...overrides,
  }
}

/**
 * テスト用サーバー情報作成
 */
export function createTestServer(overrides: Partial<ServerInfo> = {}): ServerInfo {
  return {
    id: 'test-server-' + Math.random().toString(36).substr(2, 9),
    name: 'Test Server',
    image: 'nginx:latest',
    imageId: 'sha256:test-image-id',
    status: 'running',
    state: 'running',
    ports: [
      {
        containerPort: 80,
        hostPort: 8080,
        protocol: 'tcp' as const,
      },
    ],
    environment: {
      NODE_ENV: 'production',
    },
    volumes: [],
    networks: ['bridge'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

/**
 * テスト用エラー作成
 */
export function createTestError(
  code: string = 'TEST_ERROR',
  message: string = 'Test error message',
  level: 'error' | 'warn' | 'info' = 'error'
): CustomError {
  return new CustomError(
    message,
    code,
    level,
    'system',
    {
      source: 'test',
      operation: 'test-operation',
      timestamp: new Date().toISOString(),
    }
  )
}

/**
 * Next.js リクエストモック作成
 */
export function createMockRequest(
  url: string,
  options: {
    method?: string
    headers?: Record<string, string>
    body?: any
  } = {}
): NextRequest {
  const { method = 'GET', headers = {}, body } = options

  const request = new NextRequest(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  return request
}

/**
 * APIレスポンスの検証
 */
export function validateApiResponse(response: any, expectedStatus: number) {
  expect(response.status).toBe(expectedStatus)
  expect(response.headers.get('content-type')).toContain('application/json')
  
  return response
}

/**
 * エラーレスポンスの検証
 */
export function validateErrorResponse(
  response: any,
  expectedStatus: number,
  expectedCode?: string
) {
  validateApiResponse(response, expectedStatus)
  
  const data = response.json()
  expect(data).toHaveProperty('error')
  expect(data.error).toHaveProperty('message')
  expect(data.error).toHaveProperty('code')
  
  if (expectedCode) {
    expect(data.error.code).toBe(expectedCode)
  }
  
  return data
}

/**
 * 非同期関数のタイムアウトテスト
 */
export async function expectTimeout(
  promise: Promise<any>,
  timeoutMs: number = 1000
): Promise<void> {
  await expect(
    Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeoutMs)
      ),
    ])
  ).rejects.toThrow('Timeout')
}

/**
 * DOM要素の可視性チェック
 */
export function expectElementVisible(element: HTMLElement | null): void {
  expect(element).toBeInTheDocument()
  expect(element).toBeVisible()
}

/**
 * DOM要素の非可視性チェック
 */
export function expectElementHidden(element: HTMLElement | null): void {
  if (element) {
    expect(element).not.toBeVisible()
  } else {
    expect(element).not.toBeInTheDocument()
  }
}

/**
 * フォーム送信テスト用ヘルパー
 */
export async function submitForm(
  form: HTMLFormElement,
  data: Record<string, string>
): Promise<void> {
  const { fireEvent } = await import('@testing-library/react')
  
  // フォーム要素に値を設定
  Object.entries(data).forEach(([name, value]) => {
    const input = form.querySelector(`[name="${name}"]`) as HTMLInputElement
    if (input) {
      fireEvent.change(input, { target: { value } })
    }
  })
  
  // フォーム送信
  fireEvent.submit(form)
}

/**
 * 非同期レンダリング待機
 */
export async function waitForAsyncRender(): Promise<void> {
  const { waitFor } = await import('@testing-library/react')
  await waitFor(() => {}, { timeout: 100 })
}

/**
 * LocalStorage モック設定
 */
export function setupLocalStorageMock(initialData: Record<string, string> = {}): void {
  const localStorageMock = {
    ...initialData,
    getItem: jest.fn((key: string) => localStorageMock[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      localStorageMock[key] = value
    }),
    removeItem: jest.fn((key: string) => {
      delete localStorageMock[key]
    }),
    clear: jest.fn(() => {
      Object.keys(localStorageMock).forEach(key => {
        if (typeof localStorageMock[key] !== 'function') {
          delete localStorageMock[key]
        }
      })
    }),
  }
  
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
  })
}

/**
 * Fetch モック設定
 */
export function setupFetchMock(responses: Array<{
  url?: string
  status?: number
  data?: any
  error?: boolean
}>): void {
  global.fetch = jest.fn((url: string) => {
    const response = responses.find(r => !r.url || url.includes(r.url)) || responses[0]
    
    if (response?.error) {
      return Promise.reject(new Error('Network error'))
    }
    
    return Promise.resolve({
      ok: (response?.status || 200) >= 200 && (response?.status || 200) < 300,
      status: response?.status || 200,
      json: () => Promise.resolve(response?.data || {}),
      text: () => Promise.resolve(JSON.stringify(response?.data || {})),
      headers: new Headers(),
    } as Response)
  })
}

/**
 * テスト用タイマー操作
 */
export class TestTimers {
  static useFakeTimers(): void {
    jest.useFakeTimers()
  }
  
  static useRealTimers(): void {
    jest.useRealTimers()
  }
  
  static advanceTimersByTime(ms: number): void {
    jest.advanceTimersByTime(ms)
  }
  
  static runAllTimers(): void {
    jest.runAllTimers()
  }
}