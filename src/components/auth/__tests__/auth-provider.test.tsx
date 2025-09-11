import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, usePermissions, useAuth } from '../auth-provider';

// Next.js のルーターをモック
jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    pathname: '/test',
  }),
}));

// SessionProviderをモック
jest.mock('next-auth/react', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
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

  it('provides mock authenticated admin user', async () => {
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

  it('throws error when usePermissions is used outside provider', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => { });

    expect(() => {
      render(<TestComponent />);
    }).toThrow('useAuth must be used within an AuthProvider');

    consoleError.mockRestore();
  });

  it('useAuth hook returns expected values', () => {
    let authValues: any;

    const AuthTestComponent = () => {
      authValues = useAuth();
      return <div>Test</div>;
    };

    render(
      <AuthProvider>
        <AuthTestComponent />
      </AuthProvider>
    );

    expect(authValues.isAuthenticated).toBe(true);
    expect(authValues.isLoading).toBe(false);
    expect(authValues.user).toEqual({
      id: 'mock-admin-id',
      email: 'admin@example.com',
      name: 'Administrator',
      role: 'admin',
      permissions: ['*'],
    });
    expect(authValues.isAdmin).toBe(true);
    expect(authValues.hasPermission('ANY_PERMISSION')).toBe(true);
    expect(authValues.hasRole('ANY_ROLE')).toBe(true);
  });
});

// Permission Matrix Tests (現在のモック実装用に簡略化)
describe('Permission Matrix', () => {
  it('mock provider grants all permissions', async () => {
    const permissions = [
      'SERVERS_MANAGE',
      'CATALOG_INSTALL',
      'SYSTEM_INFO_READ',
      'SETTINGS_MANAGE',
      'USERS_MANAGE'
    ];

    const PermissionTestComponent = ({ permission }: { permission: string }) => {
      const { hasPermission } = usePermissions();
      return (
        <div data-testid={`permission-${permission}`}>
          {hasPermission(permission) ? 'true' : 'false'}
        </div>
      );
    };

    for (const permission of permissions) {
      render(
        <AuthProvider>
          <PermissionTestComponent permission={permission} />
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId(`permission-${permission}`)).toHaveTextContent('true');
      });
    }
  });
});
