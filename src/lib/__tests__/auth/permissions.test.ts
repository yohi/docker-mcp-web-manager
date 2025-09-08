import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import {
  requirePermissions,
  checkPermissions,
  PERMISSIONS,
  getUserPermissions,
} from '@/lib/auth/permissions';

// Mock dependencies
jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

// =============================================================================
// 認可システムのテスト
// 権限チェックとアクセス制御の包括的なテスト
// =============================================================================

describe('Auth Permissions', () => {
  const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>;
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserPermissions', () => {
    test('should return admin permissions for admin role', () => {
      const permissions = getUserPermissions('admin');
      
      expect(permissions).toContain(PERMISSIONS.SERVERS_MANAGE);
      expect(permissions).toContain(PERMISSIONS.SECRETS_READ_VALUE);
      expect(permissions).toContain(PERMISSIONS.CONFIG_WRITE);
      expect(permissions.length).toBeGreaterThan(10);
    });

    test('should return user permissions for user role', () => {
      const permissions = getUserPermissions('user');
      
      expect(permissions).toContain(PERMISSIONS.SERVERS_READ);
      expect(permissions).toContain(PERMISSIONS.LOGS_READ);
      expect(permissions).not.toContain(PERMISSIONS.SECRETS_READ_VALUE);
      expect(permissions).not.toContain(PERMISSIONS.CONFIG_WRITE);
    });

    test('should return viewer permissions for viewer role', () => {
      const permissions = getUserPermissions('viewer');
      
      expect(permissions).toContain(PERMISSIONS.SERVERS_READ);
      expect(permissions).toContain(PERMISSIONS.CATALOG_READ);
      expect(permissions).not.toContain(PERMISSIONS.SERVERS_MANAGE);
      expect(permissions).not.toContain(PERMISSIONS.SECRETS_READ);
    });

    test('should return empty array for unknown role', () => {
      const permissions = getUserPermissions('unknown' as any);
      expect(permissions).toEqual([]);
    });
  });

  describe('checkPermissions', () => {
    const mockSession = {
      user: {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user' as const,
      },
      expires: new Date().toISOString(),
    };

    test('should return true for user with required permission', () => {
      const result = checkPermissions([PERMISSIONS.SERVERS_READ], mockSession);
      expect(result).toBe(true);
    });

    test('should return false for user without required permission', () => {
      const result = checkPermissions([PERMISSIONS.SECRETS_READ_VALUE], mockSession);
      expect(result).toBe(false);
    });

    test('should return true when user has all required permissions', () => {
      const result = checkPermissions([
        PERMISSIONS.SERVERS_READ,
        PERMISSIONS.LOGS_READ,
      ], mockSession);
      expect(result).toBe(true);
    });

    test('should return false when user lacks any required permission', () => {
      const result = checkPermissions([
        PERMISSIONS.SERVERS_READ,
        PERMISSIONS.SERVERS_MANAGE, // user doesn't have this
      ], mockSession);
      expect(result).toBe(false);
    });

    test('should return false for no session', () => {
      const result = checkPermissions([PERMISSIONS.SERVERS_READ], null);
      expect(result).toBe(false);
    });

    test('should return false for empty required permissions', () => {
      const result = checkPermissions([], mockSession);
      expect(result).toBe(false);
    });
  });

  describe('requirePermissions', () => {
    const mockRequest = new NextRequest('https://example.com/api/test');

    test('should return valid result for authenticated user with permissions', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'user' as const,
        },
        expires: new Date().toISOString(),
      };

      mockGetServerSession.mockResolvedValue(mockSession);

      const result = await requirePermissions([PERMISSIONS.SERVERS_READ], mockRequest);

      expect(result.valid).toBe(true);
      expect(result.session).toEqual(mockSession);
      expect(result.error).toBeUndefined();
    });

    test('should return invalid result for unauthenticated user', async () => {
      mockGetServerSession.mockResolvedValue(null);

      const result = await requirePermissions([PERMISSIONS.SERVERS_READ], mockRequest);

      expect(result.valid).toBe(false);
      expect(result.session).toBeNull();
      expect(result.error).toBe('Authentication required');
    });

    test('should return invalid result for user without permissions', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'viewer' as const,
        },
        expires: new Date().toISOString(),
      };

      mockGetServerSession.mockResolvedValue(mockSession);

      const result = await requirePermissions([PERMISSIONS.SERVERS_MANAGE], mockRequest);

      expect(result.valid).toBe(false);
      expect(result.session).toEqual(mockSession);
      expect(result.error).toBe('Insufficient permissions');
    });

    test('should handle multiple permission requirements', async () => {
      const adminSession = {
        user: {
          id: 'admin-123',
          email: 'admin@example.com',
          name: 'Admin User',
          role: 'admin' as const,
        },
        expires: new Date().toISOString(),
      };

      mockGetServerSession.mockResolvedValue(adminSession);

      const result = await requirePermissions([
        PERMISSIONS.SERVERS_MANAGE,
        PERMISSIONS.SECRETS_WRITE,
      ], mockRequest);

      expect(result.valid).toBe(true);
      expect(result.session).toEqual(adminSession);
    });

    test('should handle session retrieval errors', async () => {
      mockGetServerSession.mockRejectedValue(new Error('Session error'));

      const result = await requirePermissions([PERMISSIONS.SERVERS_READ], mockRequest);

      expect(result.valid).toBe(false);
      expect(result.session).toBeNull();
      expect(result.error).toBe('Authentication error');
    });
  });

  describe('Permission Constants', () => {
    test('should have all required permission constants', () => {
      // Server permissions
      expect(PERMISSIONS).toHaveProperty('SERVERS_READ');
      expect(PERMISSIONS).toHaveProperty('SERVERS_WRITE');
      expect(PERMISSIONS).toHaveProperty('SERVERS_MANAGE');

      // Secret permissions
      expect(PERMISSIONS).toHaveProperty('SECRETS_READ');
      expect(PERMISSIONS).toHaveProperty('SECRETS_WRITE');
      expect(PERMISSIONS).toHaveProperty('SECRETS_READ_VALUE');

      // Config permissions
      expect(PERMISSIONS).toHaveProperty('CONFIG_READ');
      expect(PERMISSIONS).toHaveProperty('CONFIG_WRITE');

      // Other permissions
      expect(PERMISSIONS).toHaveProperty('LOGS_READ');
      expect(PERMISSIONS).toHaveProperty('CATALOG_READ');
      expect(PERMISSIONS).toHaveProperty('JOBS_READ');
    });

    test('should have unique permission values', () => {
      const permissionValues = Object.values(PERMISSIONS);
      const uniqueValues = new Set(permissionValues);
      
      expect(uniqueValues.size).toBe(permissionValues.length);
    });

    test('should use consistent naming convention', () => {
      const permissionKeys = Object.keys(PERMISSIONS);
      
      for (const key of permissionKeys) {
        expect(key).toMatch(/^[A-Z_]+$/);
        expect(key).toContain('_');
      }
    });
  });

  describe('Role Hierarchy', () => {
    test('admin should have more permissions than user', () => {
      const adminPerms = getUserPermissions('admin');
      const userPerms = getUserPermissions('user');
      
      expect(adminPerms.length).toBeGreaterThan(userPerms.length);
      
      // Admin should have all user permissions
      for (const perm of userPerms) {
        expect(adminPerms).toContain(perm);
      }
    });

    test('user should have more permissions than viewer', () => {
      const userPerms = getUserPermissions('user');
      const viewerPerms = getUserPermissions('viewer');
      
      expect(userPerms.length).toBeGreaterThan(viewerPerms.length);
      
      // User should have all viewer permissions
      for (const perm of viewerPerms) {
        expect(userPerms).toContain(perm);
      }
    });

    test('should maintain permission hierarchy consistency', () => {
      const adminPerms = new Set(getUserPermissions('admin'));
      const userPerms = new Set(getUserPermissions('user'));
      const viewerPerms = new Set(getUserPermissions('viewer'));

      // Admin ⊇ User ⊇ Viewer
      for (const perm of viewerPerms) {
        expect(userPerms.has(perm)).toBe(true);
        expect(adminPerms.has(perm)).toBe(true);
      }

      for (const perm of userPerms) {
        expect(adminPerms.has(perm)).toBe(true);
      }
    });
  });

  describe('Security Tests', () => {
    test('should not allow privilege escalation', () => {
      const viewerSession = {
        user: {
          id: 'viewer-123',
          email: 'viewer@example.com',
          name: 'Viewer User',
          role: 'viewer' as const,
        },
        expires: new Date().toISOString(),
      };

      // Viewer should not have admin permissions
      expect(checkPermissions([PERMISSIONS.CONFIG_WRITE], viewerSession)).toBe(false);
      expect(checkPermissions([PERMISSIONS.SECRETS_READ_VALUE], viewerSession)).toBe(false);
      expect(checkPermissions([PERMISSIONS.SERVERS_MANAGE], viewerSession)).toBe(false);
    });

    test('should handle malformed session objects', async () => {
      mockGetServerSession.mockResolvedValue({
        user: {
          id: 'user-123',
          // Missing required fields
        },
      } as any);

      const result = await requirePermissions([PERMISSIONS.SERVERS_READ], mockRequest);
      expect(result.valid).toBe(false);
    });

    test('should validate role values strictly', () => {
      const invalidRoleSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'super-admin' as any, // Invalid role
        },
        expires: new Date().toISOString(),
      };

      const result = checkPermissions([PERMISSIONS.SERVERS_READ], invalidRoleSession);
      expect(result).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty permission arrays', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'user' as const,
        },
        expires: new Date().toISOString(),
      };

      mockGetServerSession.mockResolvedValue(mockSession);

      const result = await requirePermissions([], mockRequest);
      expect(result.valid).toBe(false);
    });

    test('should handle null/undefined inputs gracefully', async () => {
      expect(() => checkPermissions(null as any, null)).not.toThrow();
      expect(() => getUserPermissions(null as any)).not.toThrow();
      
      const result = await requirePermissions([PERMISSIONS.SERVERS_READ], null as any);
      expect(result.valid).toBe(false);
    });

    test('should handle concurrent permission checks', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'user' as const,
        },
        expires: new Date().toISOString(),
      };

      mockGetServerSession.mockResolvedValue(mockSession);

      const promises = Array.from({ length: 10 }, () =>
        requirePermissions([PERMISSIONS.SERVERS_READ], mockRequest)
      );

      const results = await Promise.all(promises);
      
      for (const result of results) {
        expect(result.valid).toBe(true);
      }
    });
  });
});