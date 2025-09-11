import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ServerList } from '../server-list';
import { AuthProvider } from '@/components/auth/auth-provider';

// Next.js のルーターをモック
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    refresh: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/servers',
}));

// モックデータ - ServerListコンポーネントが期待する型に合わせる
const mockServers = [
  {
    id: '1',
    name: 'Test Server 1',
    description: 'Test server description',
    status: 'running' as const,
    imageUrl: 'test/server:latest',
    version: '1.0.0',
    port: 3001,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    tags: ['development', 'docker'],
    healthStatus: 'healthy' as const,
    toolsCount: 5,
    configurationsCount: 3
  },
  {
    id: '2',
    name: 'Test Server 2',
    description: 'Another test server',
    status: 'stopped' as const,
    imageUrl: 'test/server2:latest',
    version: '2.0.0',
    port: 3002,
    createdAt: '2024-01-02T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
    tags: ['testing', 'api'],
    healthStatus: 'unknown' as const,
    toolsCount: 2,
    configurationsCount: 1
  }
];

const defaultProps = {
  servers: mockServers,
  isLoading: false,
  error: null,
  onRefresh: jest.fn(),
  onServerStart: jest.fn(),
  onServerStop: jest.fn()
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
    renderServerList({ isLoading: true, servers: [] });

    // ローディング状態の確認（サーバーが表示されていないこと）
    expect(screen.queryByText('Test Server 1')).not.toBeInTheDocument();
  });

  it('shows error state', () => {
    const errorMessage = 'Failed to load servers';
    renderServerList({ error: errorMessage, servers: [] });

    expect(screen.getByText(errorMessage)).toBeInTheDocument();
  });

  it('shows empty state when no servers', () => {
    renderServerList({ servers: [] });

    // 空の状態では統計が0になることを確認
    expect(screen.getByText(/総計.*0.*個のサーバー/)).toBeInTheDocument();
  });

  it('shows server statistics correctly', () => {
    renderServerList();

    // サーバー統計の確認
    expect(screen.getByText(/総計.*2.*個のサーバー/)).toBeInTheDocument();
    expect(screen.getByText(/実行中.*1/)).toBeInTheDocument();
    expect(screen.getByText(/停止中.*1/)).toBeInTheDocument();
  });

  it('has search functionality available', () => {
    renderServerList();

    // 検索入力フィールドが存在することを確認
    const searchInput = screen.getByRole('textbox');
    expect(searchInput).toBeInTheDocument();

    // 検索機能をテスト
    fireEvent.change(searchInput, { target: { value: 'Test Server 1' } });
    expect(searchInput).toHaveValue('Test Server 1');
  });

  it('shows correct server version information', () => {
    renderServerList();

    // バージョン情報の確認
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    expect(screen.getByText('v2.0.0')).toBeInTheDocument();
  });

  it('handles refresh action', () => {
    renderServerList();

    const refreshButton = screen.getByRole('button', { name: /更新/ });
    fireEvent.click(refreshButton);

    expect(defaultProps.onRefresh).toHaveBeenCalledTimes(1);
  });

  it('shows add server button when user has permission', () => {
    renderServerList();

    expect(screen.getByRole('button', { name: /サーバー追加/ })).toBeInTheDocument();
  });
});
