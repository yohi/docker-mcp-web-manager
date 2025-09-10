// Server Repository (Simple Implementation)
import { db } from '@/db';
import { servers } from '@/db/schema';
import { eq } from 'drizzle-orm';

export class ServerRepository {
  async findAll(limit = 20) {
    return await db.select().from(servers).limit(limit);
  }

  async findById(id: string) {
    const results = await db.select().from(servers).where(eq(servers.id, id));
    return results[0] || null;
  }

  async createServer(data: any) {
    const result = await db.insert(servers).values(data).returning();
    return result[0];
  }

  async updateServer(id: string, data: any) {
    const result = await db.update(servers).set(data).where(eq(servers.id, id)).returning();
    return result[0];
  }

  async deleteServer(id: string) {
    await db.delete(servers).where(eq(servers.id, id));
  }
}

export function getServerRepository() {
  return new ServerRepository();
}
