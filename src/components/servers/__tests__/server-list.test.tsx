import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useSession } from 'next-auth/react';
import { ServerList } from '../server-list';
import { AuthProvider } from '@/components/auth/auth-provider';
import type { MCPServer } from '@/types/mcp';

// Next.js のルーターをモック
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    refresh: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/servers',
}));

// useSession のモック
jest.mocked(useSession).mockReturnValue({
  data: {
    user: { email: 'test@example.com', name: 'Test User' },
    expires: '2024-12-31T23:59:59.999Z'
  },
  status: 'authenticated'
});

// モックデータ
const mockServers: MCPServer[] = [
  {
    id: '1',
    name: 'test-server-1',
    displayName: 'Test Server 1',
    description: 'Test server description',
    image: 'test/server:latest',
    status: 'running',
    category: 'development',
    version: '1.0.0',
    port: 3001,
    config: {},
    env: {},
    healthCheck: {
      enabled: true,
      path: '/health',
      interval: 30,
      timeout: 5,
      retries: 3
    },
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    userId: 'user1'
  },
  {
    id: '2',
    name: 'test-server-2',
    displayName: 'Test Server 2',
    description: 'Another test server',
    image: 'test/server2:latest',
    status: 'stopped',
    category: 'testing',
    version: '2.0.0',
    port: 3002,
    config: {},
    env: {},
    healthCheck: {
      enabled: false,
      path: '/health',
      interval: 30,
      timeout: 5,
      retries: 3
    },
    createdAt: '2024-01-02T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
    userId: 'user1'
  }
];

const defaultProps = {
  servers: mockServers,
  isLoading: false,
  error: null,
  onStart: jest.fn(),
  onStop: jest.fn(),
  onRestart: jest.fn(),
  onDelete: jest.fn(),
  onUpdate: jest.fn(),
  filters: {
    search: '',
    status: 'all' as const,
    category: 'all'
  },
  onFiltersChange: jest.fn()
};

// テスト用ヘルパー
const renderServerList = (props = {}) => {
  return render(
    <AuthProvider>
      <ServerList {...defaultProps} {...props} />
    </AuthProvider>
  );
};

describe('ServerList Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders server list correctly', () => {
    renderServerList();

    expect(screen.getByText('Test Server 1')).toBeInTheDocument();
    expect(screen.getByText('Test Server 2')).toBeInTheDocument();
    expect(screen.getByText('Test server description')).toBeInTheDocument();
    expect(screen.getByText('Another test server')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    renderServerList({ isLoading: true });
    
    // ローディング状態の確認（スケルトンローダーなど）
    expect(screen.getByText('サーバーを読み込み中...')).toBeInTheDocument();
  });

  it('shows error message', () => {
    const errorMessage = 'Failed to load servers';
    renderServerList({ error: errorMessage });
    
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });

  it('shows empty state when no servers', () => {
    renderServerList({ servers: [] });
    
    expect(screen.getByText('サーバーがありません')).toBeInTheDocument();
  });

  it('displays server status correctly', () => {
    renderServerList();

    // ステータスバッジの確認
    const runningBadge = screen.getByText('実行中');
    const stoppedBadge = screen.getByText('停止中');
    
    expect(runningBadge).toBeInTheDocument();
    expect(stoppedBadge).toBeInTheDocument();
    
    expect(runningBadge.closest('.bg-green-100')).toBeTruthy();
    expect(stoppedBadge.closest('.bg-gray-100')).toBeTruthy();
  });

  it('handles server actions', async () => {
    renderServerList();

    // サーバー操作ボタンを探す
    const actionButtons = screen.getAllByRole('button');
    const startButton = actionButtons.find(btn => btn.textContent?.includes('開始'));
    const stopButton = actionButtons.find(btn => btn.textContent?.includes('停止'));

    if (startButton) {
      fireEvent.click(startButton);
      await waitFor(() => {
        expect(defaultProps.onStart).toHaveBeenCalledWith('2'); // 停止中のサーバー
      });
    }

    if (stopButton) {
      fireEvent.click(stopButton);
      await waitFor(() => {
        expect(defaultProps.onStop).toHaveBeenCalledWith('1'); // 実行中のサーバー
      });
    }
  });

  it('filters servers by search term', () => {
    const { rerender } = renderServerList();

    // 検索フィルターを適用
    rerender(
      <AuthProvider>
        <ServerList
          {...defaultProps}
          filters={{
            ...defaultProps.filters,
            search: 'Test Server 1'
          }}
        />
      </AuthProvider>
    );

    expect(screen.getByText('Test Server 1')).toBeInTheDocument();
    expect(screen.queryByText('Test Server 2')).not.toBeInTheDocument();
  });

  it('filters servers by status', () => {
    const { rerender } = renderServerList();

    // ステータスフィルターを適用
    rerender(
      <AuthProvider>
        <ServerList
          {...defaultProps}
          filters={{
            ...defaultProps.filters,
            status: 'running'
          }}
        />
      </AuthProvider>
    );

    expect(screen.getByText('Test Server 1')).toBeInTheDocument();
    expect(screen.queryByText('Test Server 2')).not.toBeInTheDocument();
  });

  it('filters servers by category', () => {
    const { rerender } = renderServerList();

    // カテゴリフィルターを適用
    rerender(
      <AuthProvider>
        <ServerList
          {...defaultProps}
          filters={{
            ...defaultProps.filters,
            category: 'development'
          }}
        />
      </AuthProvider>
    );

    expect(screen.getByText('Test Server 1')).toBeInTheDocument();
    expect(screen.queryByText('Test Server 2')).not.toBeInTheDocument();
  });

  it('handles delete action with confirmation', async () => {
    renderServerList();

    // 削除ボタンを探してクリック
    const deleteButtons = screen.getAllByRole('button');
    const deleteButton = deleteButtons.find(btn => 
      btn.textContent?.includes('削除') || btn.querySelector('[data-testid="delete-icon"]')
    );

    if (deleteButton) {
      fireEvent.click(deleteButton);

      // 確認ダイアログが表示されることを確認
      await waitFor(() => {
        expect(screen.getByText(/削除しますか/)).toBeInTheDocument();
      });

      // 確認ボタンをクリック
      const confirmButton = screen.getByRole('button', { name: /削除/ });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(defaultProps.onDelete).toHaveBeenCalled();
      });
    }
  });

  it('shows server details on expand', async () => {
    renderServerList();

    // 詳細表示ボタンを探してクリック
    const expandButtons = screen.getAllByRole('button');
    const expandButton = expandButtons.find(btn => 
      btn.querySelector('[data-testid="expand-icon"]')
    );

    if (expandButton) {
      fireEvent.click(expandButton);

      await waitFor(() => {
        expect(screen.getByText('test/server:latest')).toBeInTheDocument();
        expect(screen.getByText('ポート: 3001')).toBeInTheDocument();
      });
    }
  });

  it('handles refresh action', async () => {
    const onRefresh = jest.fn();
    renderServerList({ onRefresh });

    const refreshButton = screen.getByRole('button', { name: /更新/ });
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it('supports keyboard navigation', () => {
    renderServerList();

    const firstServer = screen.getByText('Test Server 1').closest('[tabindex]');
    const secondServer = screen.getByText('Test Server 2').closest('[tabindex]');

    expect(firstServer).toHaveAttribute('tabindex', '0');
    expect(secondServer).toHaveAttribute('tabindex', '0');

    // キーボードでフォーカス移動をテスト
    if (firstServer) {
      firstServer.focus();
      expect(document.activeElement).toBe(firstServer);
    }
  });

  it('shows correct server metrics', () => {
    renderServerList();

    // メトリクス情報の確認
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    expect(screen.getByText('v2.0.0')).toBeInTheDocument();
    expect(screen.getByText('development')).toBeInTheDocument();
    expect(screen.getByText('testing')).toBeInTheDocument();
  });
});