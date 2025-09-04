import { eq } from 'drizzle-orm';
import { db } from '../connection';
import { users, type User, type NewUser } from '../schema/auth-schema';
import bcrypt from 'bcryptjs';

/**
 * ユーザーデータアクセスリポジトリ
 * 認証とユーザー管理機能を提供
 */
export class UserRepository {
  /**
   * ユーザー名でユーザーを検索
   */
  async findByUsername(username: string): Promise<User | null> {
    try {
      const result = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);
      
      return result[0] || null;
    } catch (error) {
      console.error('Error finding user by username:', error);
      throw new Error('Failed to find user by username');
    }
  }

  /**
   * IDでユーザーを検索
   */
  async findById(id: string): Promise<User | null> {
    try {
      const result = await db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
      
      return result[0] || null;
    } catch (error) {
      console.error('Error finding user by ID:', error);
      throw new Error('Failed to find user by ID');
    }
  }

  /**
   * すべてのアクティブユーザーを取得
   */
  async findAllActive(): Promise<User[]> {
    try {
      return await db
        .select()
        .from(users)
        .where(eq(users.isActive, true))
        .orderBy(users.createdAt);
    } catch (error) {
      console.error('Error finding active users:', error);
      throw new Error('Failed to find active users');
    }
  }

  /**
   * 新しいユーザーを作成
   */
  async create(userData: {
    username: string;
    password: string;
    email?: string;
    role?: 'admin' | 'user';
  }): Promise<User> {
    try {
      // パスワードのハッシュ化
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(userData.password, saltRounds);

      const newUser: NewUser = {
        username: userData.username,
        email: userData.email,
        passwordHash,
        role: userData.role || 'user',
        isActive: true,
      };

      const result = await db.insert(users).values(newUser).returning();
      return result[0];
    } catch (error) {
      console.error('Error creating user:', error);
      throw new Error('Failed to create user');
    }
  }

  /**
   * ユーザー情報を更新
   */
  async update(
    id: string,
    userData: Partial<{
      username: string;
      email: string;
      role: 'admin' | 'user';
      isActive: boolean;
    }>
  ): Promise<User | null> {
    try {
      const result = await db
        .update(users)
        .set({
          ...userData,
          updatedAt: new Date().getTime(),
        })
        .where(eq(users.id, id))
        .returning();
      
      return result[0] || null;
    } catch (error) {
      console.error('Error updating user:', error);
      throw new Error('Failed to update user');
    }
  }

  /**
   * パスワードを更新
   */
  async updatePassword(id: string, newPassword: string): Promise<boolean> {
    try {
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(newPassword, saltRounds);

      const result = await db
        .update(users)
        .set({
          passwordHash,
          updatedAt: new Date().getTime(),
        })
        .where(eq(users.id, id))
        .returning();
      
      return result.length > 0;
    } catch (error) {
      console.error('Error updating password:', error);
      throw new Error('Failed to update password');
    }
  }

  /**
   * 最終ログイン時刻を更新
   */
  async updateLastLogin(id: string): Promise<void> {
    try {
      await db
        .update(users)
        .set({
          lastLoginAt: new Date().getTime(),
          updatedAt: new Date().getTime(),
        })
        .where(eq(users.id, id));
    } catch (error) {
      console.error('Error updating last login:', error);
      // ログイン時刻の更新エラーは非致命的なので例外をスローしない
    }
  }

  /**
   * ユーザーを削除（ソフト削除：非アクティブ化）
   */
  async softDelete(id: string): Promise<boolean> {
    try {
      const result = await db
        .update(users)
        .set({
          isActive: false,
          updatedAt: new Date().getTime(),
        })
        .where(eq(users.id, id))
        .returning();
      
      return result.length > 0;
    } catch (error) {
      console.error('Error soft deleting user:', error);
      throw new Error('Failed to soft delete user');
    }
  }

  /**
   * パスワードを検証
   */
  async verifyPassword(username: string, password: string): Promise<User | null> {
    try {
      const user = await this.findByUsername(username);
      
      if (!user || !user.passwordHash || !user.isActive) {
        return null;
      }

      const isValid = await bcrypt.compare(password, user.passwordHash);
      
      if (!isValid) {
        return null;
      }

      // 最終ログイン時刻を更新
      await this.updateLastLogin(user.id);
      
      return user;
    } catch (error) {
      console.error('Error verifying password:', error);
      return null;
    }
  }

  /**
   * ユーザー名の重複チェック
   */
  async isUsernameAvailable(username: string, excludeId?: string): Promise<boolean> {
    try {
      const query = db
        .select({ count: users.username })
        .from(users)
        .where(eq(users.username, username));

      if (excludeId) {
        // 更新時は自分のIDを除外
        query.where(eq(users.id, excludeId));
      }

      const result = await query.limit(1);
      return result.length === 0;
    } catch (error) {
      console.error('Error checking username availability:', error);
      return false;
    }
  }
}