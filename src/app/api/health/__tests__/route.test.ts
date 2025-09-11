/**
 * ヘルスチェックAPI統合テスト
 * /api/health エンドポイントのテスト
 */

import { NextRequest } from 'next/server';
import { GET } from '../route';

describe('/api/health', () => {
  it('should return healthy status', async () => {
    const request = new NextRequest('http://localhost:3000/api/health');
    const response = await GET(request);
    const responseData = await response.json();

    expect(response.status).toBe(200);
    expect(responseData).toEqual({
      status: 'healthy',
      timestamp: expect.any(String),
      version: expect.any(String),
      uptime: expect.any(Number),
      environment: 'test',
    });
  });

  it('should have valid timestamp format', async () => {
    const request = new NextRequest('http://localhost:3000/api/health');
    const response = await GET(request);
    const responseData = await response.json();

    const timestamp = new Date(responseData.timestamp);
    expect(timestamp.toString()).not.toBe('Invalid Date');
  });

  it('should have expected response properties', async () => {
    const request = new NextRequest('http://localhost:3000/api/health');
    const response = await GET(request);
    const responseData = await response.json();

    expect(responseData).toHaveProperty('status');
    expect(responseData).toHaveProperty('timestamp');
    expect(responseData).toHaveProperty('version');
    expect(responseData).toHaveProperty('uptime');
    expect(responseData).toHaveProperty('environment');
  });
});
