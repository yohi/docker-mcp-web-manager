import { getServerSession } from 'next-auth';
import {
  requirePermissions,
  hasRole,
  checkPermission,
  combinePermissions,
  PermissionRequirement
} from '@/lib/auth/permissions';
import { Role, Permission } from '@/types/auth';

// =============================================================================
// 認可システムのテスト
// 権限チェックとアクセス制御の包括的なテスト
// =============================================================================

// Mock next-auth
jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;

describe('Auth Permissions', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('hasRole', () => {
    it('should return true when user has the required role', () => {
      const user = {
        id: '1',
        email: 'admin@example.com',
        role: 'admin' as Role,
        permissions: ['read:servers', 'write:servers']
      };

      expect(hasRole(user, 'admin')).toBe(true);
    });

    it('should return false when user does not have the required role', () => {
      const user = {
        id: '1',
        email: 'user@example.com',
        role: 'user' as Role,
        permissions: ['read:servers']
      };

      expect(hasRole(user, 'admin')).toBe(false);
    });

    it('should return false when user is null', () => {
      expect(hasRole(null, 'admin')).toBe(false);
    });
  });

  describe('checkPermission', () => {
    it('should return true when user has the required permission', () => {
      const user = {
        id: '1',
        email: 'user@example.com',
        role: 'user' as Role,
        permissions: ['read:servers', 'write:servers']
      };

      expect(checkPermission(user, 'read:servers' as Permission)).toBe(true);
    });

    it('should return false when user does not have the required permission', () => {
      const user = {
        id: '1',
        email: 'user@example.com',
        role: 'user' as Role,
        permissions: ['read:servers']
      };

      expect(checkPermission(user, 'write:servers' as Permission)).toBe(false);
    });

    it('should return false when user is null', () => {
      expect(checkPermission(null, 'read:servers' as Permission)).toBe(false);
    });
  });

  describe('combinePermissions', () => {
    it('should correctly combine AND permissions', () => {
      const user = {
        id: '1',
        email: 'user@example.com',
        role: 'user' as Role,
        permissions: ['read:servers', 'write:servers']
      };

      const requirements: PermissionRequirement[] = [
        { permission: 'read:servers' as Permission },
        { permission: 'write:servers' as Permission }
      ];

      expect(combinePermissions(user, requirements, 'AND')).toBe(true);
    });

    it('should correctly combine OR permissions', () => {
      const user = {
        id: '1',
        email: 'user@example.com',
        role: 'user' as Role,
        permissions: ['read:servers']
      };

      const requirements: PermissionRequirement[] = [
        { permission: 'read:servers' as Permission },
        { permission: 'write:servers' as Permission }
      ];

      expect(combinePermissions(user, requirements, 'OR')).toBe(true);
    });
  });

  describe('requirePermissions middleware', () => {
    it('should allow access when user has required permissions', async () => {
      const mockUser = {
        id: '1',
        email: 'admin@example.com',
        role: 'admin' as Role,
        permissions: ['read:servers', 'write:servers']
      };

      mockGetServerSession.mockResolvedValue({
        user: mockUser,
        expires: '2024-12-31'
      });

      const mockRequest = new Request('http://localhost/api/test');
      const mockContext = { params: {} };

      const handler = requirePermissions(['read:servers' as Permission])(
        async () => {
          return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
      );

      const response = await handler(mockRequest, mockContext);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should deny access when user lacks required permissions', async () => {
      const mockUser = {
        id: '1',
        email: 'user@example.com',
        role: 'user' as Role,
        permissions: ['read:servers']
      };

      mockGetServerSession.mockResolvedValue({
        user: mockUser,
        expires: '2024-12-31'
      });

      const mockRequest = new Request('http://localhost/api/test');
      const mockContext = { params: {} };

      const handler = requirePermissions(['write:servers' as Permission])(
        async () => {
          return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
      );

      const response = await handler(mockRequest, mockContext);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBeDefined();
    });

    it('should deny access when user is not authenticated', async () => {
      mockGetServerSession.mockResolvedValue(null);

      const mockRequest = new Request('http://localhost/api/test');
      const mockContext = { params: {} };

      const handler = requirePermissions(['read:servers' as Permission])(
        async () => {
          return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
      );

      const response = await handler(mockRequest, mockContext);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBeDefined();
    });

    it('should handle complex permission requirements', async () => {
      const mockUser = {
        id: '1',
        email: 'admin@example.com',
        role: 'admin' as Role,
        permissions: ['read:servers', 'write:configs']
      };

      mockGetServerSession.mockResolvedValue({
        user: mockUser,
        expires: '2024-12-31'
      });

      const mockRequest = new Request('http://localhost/api/test');
      const mockContext = { params: {} };

      const requirements: PermissionRequirement[] = [
        { permission: 'read:servers' as Permission },
        { permission: 'write:configs' as Permission }
      ];

      const handler = requirePermissions(requirements, 'AND')(
        async () => {
          return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
      );

      const response = await handler(mockRequest, mockContext);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });
});
