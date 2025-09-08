import { render, screen, waitFor } from '@testing-library/react';
import { useSession } from 'next-auth/react';
import { AuthProvider, usePermissions } from '../auth-provider';

// Next.js のルーターをモック
jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    pathname: '/test',
  }),
}));

// テスト用コンポーネント
const TestComponent = () => {
  const { hasPermission, user, isLoading } = usePermissions();
  
  if (isLoading) return <div>Loading...</div>;
  
  return (
    <div>
      <div data-testid="user-email">{user?.email || 'No user'}</div>
      <div data-testid="can-manage-servers">
        {hasPermission('SERVERS_MANAGE') ? 'Can manage' : 'Cannot manage'}
      </div>
      <div data-testid="can-read-system">
        {hasPermission('SYSTEM_INFO_READ') ? 'Can read system' : 'Cannot read system'}
      </div>
      <div data-testid="can-manage-settings">
        {hasPermission('SETTINGS_MANAGE') ? 'Can manage settings' : 'Cannot manage settings'}
      </div>
    </div>
  );
};

describe('AuthProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading state when session is loading', () => {
    jest.mocked(useSession).mockReturnValue({
      data: null,
      status: 'loading'
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('handles unauthenticated user', async () => {
    jest.mocked(useSession).mockReturnValue({
      data: null,
      status: 'unauthenticated'
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-email')).toHaveTextContent('No user');
      expect(screen.getByTestId('can-manage-servers')).toHaveTextContent('Cannot manage');
      expect(screen.getByTestId('can-read-system')).toHaveTextContent('Cannot read system');
      expect(screen.getByTestId('can-manage-settings')).toHaveTextContent('Cannot manage settings');
    });
  });

  it('handles authenticated admin user', async () => {
    jest.mocked(useSession).mockReturnValue({
      data: {
        user: {
          email: 'admin@example.com',
          name: 'Admin User',
          role: 'ADMIN'
        },
        expires: '2024-12-31T23:59:59.999Z'
      },
      status: 'authenticated'
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-email')).toHaveTextContent('admin@example.com');
      expect(screen.getByTestId('can-manage-servers')).toHaveTextContent('Can manage');
      expect(screen.getByTestId('can-read-system')).toHaveTextContent('Can read system');
      expect(screen.getByTestId('can-manage-settings')).toHaveTextContent('Can manage settings');
    });
  });

  it('handles authenticated user role', async () => {
    jest.mocked(useSession).mockReturnValue({
      data: {
        user: {
          email: 'user@example.com',
          name: 'Regular User',
          role: 'USER'
        },
        expires: '2024-12-31T23:59:59.999Z'
      },
      status: 'authenticated'
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-email')).toHaveTextContent('user@example.com');
      expect(screen.getByTestId('can-manage-servers')).toHaveTextContent('Can manage'); // USER can manage servers
      expect(screen.getByTestId('can-read-system')).toHaveTextContent('Cannot read system'); // USER cannot read system
      expect(screen.getByTestId('can-manage-settings')).toHaveTextContent('Cannot manage settings'); // USER cannot manage settings
    });
  });

  it('handles authenticated viewer role', async () => {
    jest.mocked(useSession).mockReturnValue({
      data: {
        user: {
          email: 'viewer@example.com',
          name: 'Viewer User',
          role: 'VIEWER'
        },
        expires: '2024-12-31T23:59:59.999Z'
      },
      status: 'authenticated'
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-email')).toHaveTextContent('viewer@example.com');
      expect(screen.getByTestId('can-manage-servers')).toHaveTextContent('Cannot manage');
      expect(screen.getByTestId('can-read-system')).toHaveTextContent('Cannot read system');
      expect(screen.getByTestId('can-manage-settings')).toHaveTextContent('Cannot manage settings');
    });
  });

  it('handles user without role (defaults to USER)', async () => {
    jest.mocked(useSession).mockReturnValue({
      data: {
        user: {
          email: 'norole@example.com',
          name: 'No Role User'
          // role プロパティなし
        },
        expires: '2024-12-31T23:59:59.999Z'
      },
      status: 'authenticated'
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user-email')).toHaveTextContent('norole@example.com');
      expect(screen.getByTestId('can-manage-servers')).toHaveTextContent('Can manage'); // デフォルトUSER権限
      expect(screen.getByTestId('can-read-system')).toHaveTextContent('Cannot read system');
      expect(screen.getByTestId('can-manage-settings')).toHaveTextContent('Cannot manage settings');
    });
  });

  it('throws error when usePermissions is used outside provider', () => {
    // エラーをキャッチするためのコンソールエラーを無効化
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    expect(() => {
      render(<TestComponent />);
    }).toThrow('usePermissions must be used within an AuthProvider');

    consoleError.mockRestore();
  });
});

// 権限マトリックステスト
describe('Permission Matrix', () => {
  const permissions = [
    'SERVERS_READ',
    'SERVERS_MANAGE', 
    'CATALOG_READ',
    'CATALOG_INSTALL',
    'MONITORING_READ',
    'SYSTEM_INFO_READ',
    'SETTINGS_MANAGE',
    'USERS_MANAGE'
  ];

  const roles = ['ADMIN', 'USER', 'VIEWER'];

  // 期待される権限マトリックス
  const expectedPermissions = {
    ADMIN: permissions, // 全権限
    USER: [
      'SERVERS_READ',
      'SERVERS_MANAGE',
      'CATALOG_READ', 
      'CATALOG_INSTALL',
      'MONITORING_READ'
    ],
    VIEWER: [
      'SERVERS_READ',
      'CATALOG_READ',
      'MONITORING_READ'
    ]
  };

  roles.forEach(role => {
    describe(`${role} role permissions`, () => {
      permissions.forEach(permission => {
        it(`should ${expectedPermissions[role].includes(permission) ? 'have' : 'not have'} ${permission} permission`, async () => {
          jest.mocked(useSession).mockReturnValue({
            data: {
              user: {
                email: `test@example.com`,
                name: 'Test User',
                role
              },
              expires: '2024-12-31T23:59:59.999Z'
            },
            status: 'authenticated'
          });

          const TestPermissionComponent = () => {
            const { hasPermission } = usePermissions();
            return (
              <div data-testid={`permission-${permission}`}>
                {hasPermission(permission) ? 'true' : 'false'}
              </div>
            );
          };

          render(
            <AuthProvider>
              <TestPermissionComponent />
            </AuthProvider>
          );

          await waitFor(() => {
            const expected = expectedPermissions[role].includes(permission) ? 'true' : 'false';
            expect(screen.getByTestId(`permission-${permission}`)).toHaveTextContent(expected);
          });
        });
      });
    });
  });
});