/**
 * React Query設定とユーティリティ
 * 
 * 機能要件：
 * - 効率的なデータフェッチング
 * - キャッシュ戦略の最適化
 * - オフライン対応
 * - エラーハンドリングとリトライ
 * - バックグラウンド更新
 */

import { 
  QueryClient, 
  QueryClientProvider, 
  useQuery, 
  useMutation, 
  useQueryClient,
  UseQueryOptions,
  UseMutationOptions,
  QueryKey,
  MutationKey,
} from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import React from 'react'

/**
 * Query Client設定
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // キャッシュ時間: 5分
      staleTime: 5 * 60 * 1000,
      
      // ガベージコレクション時間: 10分
      gcTime: 10 * 60 * 1000,
      
      // リトライ設定
      retry: (failureCount, error: any) => {
        // 400番台エラーはリトライしない
        if (error?.status >= 400 && error?.status < 500) {
          return false
        }
        // 最大3回までリトライ
        return failureCount < 3
      },
      
      // リトライディレイ: 指数バックオフ
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      
      // バックグラウンド更新
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: true,
      
      // ネットワーク状態による制御
      networkMode: 'online',
      
      // エラーハンドリング
      throwOnError: false,
    },
    mutations: {
      // ミューテーションのリトライ設定
      retry: (failureCount, error: any) => {
        // 400番台エラーはリトライしない
        if (error?.status >= 400 && error?.status < 500) {
          return false
        }
        // 最大1回までリトライ
        return failureCount < 1
      },
      
      // ネットワーク状態による制御
      networkMode: 'online',
    },
  },
})

/**
 * Query Keys定義
 */
export const queryKeys = {
  // サーバー関連
  servers: ['servers'] as const,
  server: (id: string) => ['servers', id] as const,
  serverLogs: (id: string, options?: { tail?: number; since?: string }) => 
    ['servers', id, 'logs', options] as const,
  serverStatus: (id: string) => ['servers', id, 'status'] as const,
  
  // 認証関連
  session: ['auth', 'session'] as const,
  user: (id: string) => ['auth', 'user', id] as const,
  
  // 設定関連
  config: ['config'] as const,
  secrets: ['secrets'] as const,
  
  // テスト関連
  tests: (serverId: string) => ['servers', serverId, 'tests'] as const,
  testResult: (serverId: string, testId: string) => 
    ['servers', serverId, 'tests', testId] as const,
  
  // カタログ関連
  catalog: ['catalog'] as const,
  catalogServer: (id: string) => ['catalog', 'servers', id] as const,
} as const

/**
 * API クライアント関数
 */
class ApiClient {
  private baseURL: string
  
  constructor(baseURL: string = '/api/v1') {
    this.baseURL = baseURL
  }

  async request<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`
    
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    }

    const response = await fetch(url, config)
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ 
        message: 'Unknown error' 
      }))
      throw new Error(error.message || `HTTP ${response.status}`)
    }

    return response.json()
  }

  // GET リクエスト
  get<T>(endpoint: string, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET', ...options })
  }

  // POST リクエスト
  post<T>(endpoint: string, data?: any, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    })
  }

  // PUT リクエスト
  put<T>(endpoint: string, data?: any, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    })
  }

  // DELETE リクエスト
  delete<T>(endpoint: string, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE', ...options })
  }
}

export const apiClient = new ApiClient()

/**
 * カスタムフック：サーバー一覧取得
 */
export function useServers(options?: UseQueryOptions<any[], Error>) {
  return useQuery({
    queryKey: queryKeys.servers,
    queryFn: () => apiClient.get<{ servers: any[] }>('/servers').then(res => res.servers),
    staleTime: 30 * 1000, // 30秒
    ...options,
  })
}

/**
 * カスタムフック：サーバー詳細取得
 */
export function useServer(id: string, options?: UseQueryOptions<any, Error>) {
  return useQuery({
    queryKey: queryKeys.server(id),
    queryFn: () => apiClient.get<{ server: any }>(`/servers/${id}`).then(res => res.server),
    enabled: !!id,
    staleTime: 60 * 1000, // 1分
    ...options,
  })
}

/**
 * カスタムフック：サーバーステータス取得（頻繁更新）
 */
export function useServerStatus(id: string, options?: UseQueryOptions<any, Error>) {
  return useQuery({
    queryKey: queryKeys.serverStatus(id),
    queryFn: () => apiClient.get<{ status: any }>(`/servers/${id}/status`).then(res => res.status),
    enabled: !!id,
    staleTime: 5 * 1000, // 5秒
    refetchInterval: 10 * 1000, // 10秒間隔で自動更新
    ...options,
  })
}

/**
 * カスタムフック：サーバー作成
 */
export function useCreateServer(options?: UseMutationOptions<any, Error, any>) {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (data: any) => apiClient.post<{ server: any }>('/servers', data),
    onSuccess: (data) => {
      // サーバー一覧を無効化してリフェッチ
      queryClient.invalidateQueries({ queryKey: queryKeys.servers })
      
      // 新しいサーバーをキャッシュに追加
      queryClient.setQueryData(queryKeys.server(data.server.id), data.server)
    },
    ...options,
  })
}

/**
 * カスタムフック：サーバー更新
 */
export function useUpdateServer(options?: UseMutationOptions<any, Error, { id: string; data: any }>) {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ id, data }) => apiClient.put<{ server: any }>(`/servers/${id}`, data),
    onSuccess: (data, variables) => {
      // 特定サーバーのキャッシュを更新
      queryClient.setQueryData(queryKeys.server(variables.id), data.server)
      
      // サーバー一覧を無効化
      queryClient.invalidateQueries({ queryKey: queryKeys.servers })
    },
    ...options,
  })
}

/**
 * カスタムフック：サーバー削除
 */
export function useDeleteServer(options?: UseMutationOptions<any, Error, string>) {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/servers/${id}`),
    onSuccess: (data, id) => {
      // サーバー関連のキャッシュを削除
      queryClient.removeQueries({ queryKey: queryKeys.server(id) })
      queryClient.removeQueries({ queryKey: queryKeys.serverStatus(id) })
      queryClient.removeQueries({ queryKey: queryKeys.serverLogs(id) })
      
      // サーバー一覧を無効化
      queryClient.invalidateQueries({ queryKey: queryKeys.servers })
    },
    ...options,
  })
}

/**
 * カスタムフック：サーバー開始
 */
export function useStartServer(options?: UseMutationOptions<any, Error, string>) {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/servers/${id}/start`),
    onSuccess: (data, id) => {
      // サーバーステータスを即座に更新
      queryClient.invalidateQueries({ queryKey: queryKeys.server(id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.serverStatus(id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.servers })
    },
    ...options,
  })
}

/**
 * カスタムフック：サーバー停止
 */
export function useStopServer(options?: UseMutationOptions<any, Error, string>) {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/servers/${id}/stop`),
    onSuccess: (data, id) => {
      // サーバーステータスを即座に更新
      queryClient.invalidateQueries({ queryKey: queryKeys.server(id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.serverStatus(id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.servers })
    },
    ...options,
  })
}

/**
 * カスタムフック：セッション情報取得
 */
export function useSession(options?: UseQueryOptions<any, Error>) {
  return useQuery({
    queryKey: queryKeys.session,
    queryFn: () => apiClient.get<{ session: any }>('/auth/session').then(res => res.session),
    staleTime: 60 * 1000, // 1分
    gcTime: 5 * 60 * 1000, // 5分
    ...options,
  })
}

/**
 * React Query Provider コンポーネント
 */
interface QueryProviderProps {
  children: React.ReactNode
}

export function QueryProvider({ children }: QueryProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} position="bottom-right" />
      )}
    </QueryClientProvider>
  )
}

/**
 * Prefetch ユーティリティ
 */
export const prefetchQueries = {
  servers: () => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.servers,
      queryFn: () => apiClient.get<{ servers: any[] }>('/servers').then(res => res.servers),
      staleTime: 30 * 1000,
    })
  },
  
  server: (id: string) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.server(id),
      queryFn: () => apiClient.get<{ server: any }>(`/servers/${id}`).then(res => res.server),
      staleTime: 60 * 1000,
    })
  },
}

/**
 * キャッシュ無効化ユーティリティ
 */
export const invalidateQueries = {
  servers: () => queryClient.invalidateQueries({ queryKey: queryKeys.servers }),
  server: (id: string) => queryClient.invalidateQueries({ queryKey: queryKeys.server(id) }),
  allServers: () => queryClient.invalidateQueries({ queryKey: ['servers'] }),
}

/**
 * オフライン対応ユーティリティ
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = React.useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

  React.useEffect(() => {
    function handleOnline() {
      setIsOnline(true)
      // オンライン復帰時にクエリを再実行
      queryClient.refetchQueries({ type: 'active' })
    }

    function handleOffline() {
      setIsOnline(false)
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)

      return () => {
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
      }
    }
  }, [])

  return isOnline
}