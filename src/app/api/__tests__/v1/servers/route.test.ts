import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/v1/servers/route';
import { ServerRepository } from '@/db/repositories/server-repository';
import { requirePermissions, PERMISSIONS } from '@/lib/auth/permissions';
import { DockerMCPClient } from '@/lib/docker-mcp/client';

// Mock dependencies
jest.mock('@/db/repositories/server-repository');
jest.mock('@/lib/auth/permissions');
jest.mock('@/lib/docker-mcp/client');

// =============================================================================
// サーバーAPI統合テスト
// APIエンドポイントの包括的なテスト
// =============================================================================

describe('/api/v1/servers', () => {
  const MockServerRepository = ServerRepository as jest.MockedClass<typeof ServerRepository>;
  const mockRequirePermissions = requirePermissions as jest.MockedFunction<typeof requirePermissions>;
  const MockDockerMCPClient = DockerMCPClient as jest.MockedClass<typeof DockerMCPClient>;

  let mockServerRepo: jest.Mocked<ServerRepository>;
  let mockDockerClient: jest.Mocked<DockerMCPClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockServerRepo = {
      findWithFilters: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findByName: jest.fn(),
      findAll: jest.fn(),
    } as any;

    mockDockerClient = {
      createServer: jest.fn(),
      getServerStatus: jest.fn(),
      listServers: jest.fn(),
    } as any;

    MockServerRepository.mockImplementation(() => mockServerRepo);
    MockDockerMCPClient.mockImplementation(() => mockDockerClient);
  });

  describe('GET /api/v1/servers', () => {
    const mockServers = [
      {
        id: 'server-1',
        name: 'test-server-1',
        image: 'test/image:latest',
        status: 'running',
        description: 'Test server 1',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'server-2',
        name: 'test-server-2',
        image: 'test/image2:latest',
        status: 'stopped',
        description: 'Test server 2',
        createdAt: '2024-01-02T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      },
    ];

    test('should return servers list for authenticated user', async () => {
      // Mock authentication
      mockRequirePermissions.mockResolvedValue({
        valid: true,
        session: {
          user: { id: 'user-1', email: 'test@example.com', name: 'Test User', role: 'user' },
          expires: '2024-12-31T23:59:59Z',
        },
        error: undefined,
      });

      // Mock server repository
      mockServerRepo.findWithFilters.mockResolvedValue({
        servers: mockServers,
        total: 2,
      });

      const request = new NextRequest('http://localhost:3000/api/v1/servers');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual(mockServers);
      expect(data.pagination).toEqual({
        page: 1,
        limit: 50,
        total: 2,
        totalPages: 1,
        hasNext: false,
        hasPrev: false,
      });

      // Verify authentication was checked
      expect(mockRequirePermissions).toHaveBeenCalledWith(
        [PERMISSIONS.SERVERS_READ],
        request
      );

      // Verify repository was called with correct parameters
      expect(mockServerRepo.findWithFilters).toHaveBeenCalledWith(
        {
          name: undefined,
          status: undefined,
          image: undefined,
        },
        {
          page: 1,
          limit: 50,
          sortBy: 'name',
          sortOrder: 'asc',
        }
      );
    });

    test('should return 401 for unauthenticated user', async () => {
      mockRequirePermissions.mockResolvedValue({
        valid: false,
        session: null,
        error: 'Authentication required',
      });

      const request = new NextRequest('http://localhost:3000/api/v1/servers');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });

    test('should handle query parameters correctly', async () => {
      mockRequirePermissions.mockResolvedValue({
        valid: true,
        session: {
          user: { id: 'user-1', email: 'test@example.com', name: 'Test User', role: 'user' },
          expires: '2024-12-31T23:59:59Z',
        },
        error: undefined,
      });

      mockServerRepo.findWithFilters.mockResolvedValue({
        servers: [mockServers[0]],
        total: 1,
      });

      const url = 'http://localhost:3000/api/v1/servers?page=2&limit=10&status=running&sortBy=createdAt&sortOrder=desc';
      const request = new NextRequest(url);
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(mockServerRepo.findWithFilters).toHaveBeenCalledWith(
        {
          name: undefined,
          status: 'running',
          image: undefined,
        },
        {
          page: 2,
          limit: 10,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        }
      );
    });

    test('should handle repository errors', async () => {
      mockRequirePermissions.mockResolvedValue({
        valid: true,
        session: {
          user: { id: 'user-1', email: 'test@example.com', name: 'Test User', role: 'user' },
          expires: '2024-12-31T23:59:59Z',
        },
        error: undefined,
      });

      mockServerRepo.findWithFilters.mockRejectedValue(new Error('Database connection failed'));

      const request = new NextRequest('http://localhost:3000/api/v1/servers');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('SERVER_001');
    });
  });

  describe('POST /api/v1/servers', () => {
    const validServerData = {
      name: 'new-test-server',
      image: 'test/new-image:latest',
      description: 'New test server',
      environment: {
        NODE_ENV: 'development',
      },
      resourceLimits: {
        memory: '512m',
        cpu: '0.5',
      },
    };

    test('should create server for authenticated user with permissions', async () => {
      // Mock authentication
      mockRequirePermissions.mockResolvedValue({
        valid: true,
        session: {
          user: { id: 'user-1', email: 'test@example.com', name: 'Test User', role: 'admin' },
          expires: '2024-12-31T23:59:59Z',
        },
        error: undefined,
      });

      // Mock repository methods
      mockServerRepo.findByName.mockResolvedValue(null); // No existing server
      
      const createdServer = {
        id: 'server-new',
        ...validServerData,
        status: 'stopped',
        createdAt: '2024-01-03T00:00:00Z',
        updatedAt: '2024-01-03T00:00:00Z',
      };
      
      mockServerRepo.create.mockResolvedValue(createdServer);

      // Mock Docker client
      mockDockerClient.createServer.mockResolvedValue({
        id: 'job-123',
        status: 'pending',
        message: 'Server creation started',
      });

      const request = new NextRequest('http://localhost:3000/api/v1/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validServerData),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('server-new');
      expect(data.data.name).toBe(validServerData.name);

      // Verify authentication was checked
      expect(mockRequirePermissions).toHaveBeenCalledWith(
        [PERMISSIONS.SERVERS_WRITE],
        request
      );

      // Verify duplicate check
      expect(mockServerRepo.findByName).toHaveBeenCalledWith(validServerData.name);

      // Verify server creation
      expect(mockServerRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: validServerData.name,
          image: validServerData.image,
          description: validServerData.description,
        })
      );

      // Verify Docker client was called
      expect(mockDockerClient.createServer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: validServerData.name,
          image: validServerData.image,
        })
      );
    });

    test('should return 401 for unauthenticated user', async () => {
      mockRequirePermissions.mockResolvedValue({
        valid: false,
        session: null,
        error: 'Authentication required',
      });

      const request = new NextRequest('http://localhost:3000/api/v1/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validServerData),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });

    test('should return 400 for invalid request data', async () => {
      mockRequirePermissions.mockResolvedValue({
        valid: true,
        session: {
          user: { id: 'user-1', email: 'test@example.com', name: 'Test User', role: 'admin' },
          expires: '2024-12-31T23:59:59Z',
        },
        error: undefined,
      });

      const invalidData = {
        // Missing required name field
        image: 'test/image:latest',
      };

      const request = new NextRequest('http://localhost:3000/api/v1/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    test('should return 409 for duplicate server name', async () => {
      mockRequirePermissions.mockResolvedValue({
        valid: true,
        session: {
          user: { id: 'user-1', email: 'test@example.com', name: 'Test User', role: 'admin' },
          expires: '2024-12-31T23:59:59Z',
        },
        error: undefined,
      });

      // Mock existing server
      mockServerRepo.findByName.mockResolvedValue({
        id: 'existing-server',
        name: validServerData.name,
        image: 'existing/image:latest',
        status: 'running',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      } as any);

      const request = new NextRequest('http://localhost:3000/api/v1/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validServerData),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('SERVER_002');
      expect(data.error.message).toContain(validServerData.name);
    });

    test('should handle Docker client errors', async () => {
      mockRequirePermissions.mockResolvedValue({
        valid: true,
        session: {
          user: { id: 'user-1', email: 'test@example.com', name: 'Test User', role: 'admin' },
          expires: '2024-12-31T23:59:59Z',
        },
        error: undefined,
      });

      mockServerRepo.findByName.mockResolvedValue(null);
      mockServerRepo.create.mockResolvedValue({
        id: 'server-new',
        ...validServerData,
        status: 'stopped',
        createdAt: '2024-01-03T00:00:00Z',
        updatedAt: '2024-01-03T00:00:00Z',
      } as any);

      // Mock Docker client error
      mockDockerClient.createServer.mockRejectedValue(new Error('Docker daemon not available'));

      const request = new NextRequest('http://localhost:3000/api/v1/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validServerData),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('SERVER_003');
    });

    test('should handle repository errors during creation', async () => {
      mockRequirePermissions.mockResolvedValue({
        valid: true,
        session: {
          user: { id: 'user-1', email: 'test@example.com', name: 'Test User', role: 'admin' },
          expires: '2024-12-31T23:59:59Z',
        },
        error: undefined,
      });

      mockServerRepo.findByName.mockResolvedValue(null);
      mockServerRepo.create.mockRejectedValue(new Error('Database constraint violation'));

      const request = new NextRequest('http://localhost:3000/api/v1/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validServerData),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('SERVER_001');
    });
  });

  describe('Edge Cases and Security', () => {
    test('should handle malformed JSON in POST requests', async () => {
      mockRequirePermissions.mockResolvedValue({
        valid: true,
        session: {
          user: { id: 'user-1', email: 'test@example.com', name: 'Test User', role: 'admin' },
          expires: '2024-12-31T23:59:59Z',
        },
        error: undefined,
      });

      const request = new NextRequest('http://localhost:3000/api/v1/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"invalid": json}',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('should validate server name length and format', async () => {
      mockRequirePermissions.mockResolvedValue({
        valid: true,
        session: {
          user: { id: 'user-1', email: 'test@example.com', name: 'Test User', role: 'admin' },
          expires: '2024-12-31T23:59:59Z',
        },
        error: undefined,
      });

      const invalidNameData = {
        name: 'a', // Too short
        image: 'test/image:latest',
      };

      const request = new NextRequest('http://localhost:3000/api/v1/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidNameData),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    test('should handle concurrent server creation attempts', async () => {
      mockRequirePermissions.mockResolvedValue({
        valid: true,
        session: {
          user: { id: 'user-1', email: 'test@example.com', name: 'Test User', role: 'admin' },
          expires: '2024-12-31T23:59:59Z',
        },
        error: undefined,
      });

      // First call returns null (no existing server)
      // Second call might return existing server due to race condition
      mockServerRepo.findByName
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'concurrent-server',
          name: validServerData.name,
        } as any);

      mockServerRepo.create.mockRejectedValue(new Error('UNIQUE constraint failed'));

      const request = new NextRequest('http://localhost:3000/api/v1/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validServerData),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
    });
  });
});