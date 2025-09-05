/**
 * ユーザーリポジトリ
 * ユーザー関連のデータベース操作を提供
 */

import { BaseRepository } from './base';
import { User, CreateUserInput, UpdateUserInput, ValidationError, ValidationResult, UserSession } from '@/types/database';
import { Result } from '@/types/common';
import bcrypt from 'bcryptjs';

export class UserRepository extends BaseRepository<User, CreateUserInput, UpdateUserInput> {
  constructor() {
    super('users');
  }

  /**
   * メールアドレスでユーザーを検索
   */
  async findByEmail(email: string): Promise<Result<User | null, Error>> {
    try {
      const stmt = this.db.prepare('SELECT * FROM users WHERE email = ?');
      const row = stmt.get(email);
      
      if (!row) {
        return { success: true, data: null };
      }

      const user = this.mapRowToEntity(row as Record<string, unknown>);
      return { success: true, data: user };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * アクティブユーザーの取得
   */
  async findActiveUsers(): Promise<Result<User[], Error>> {
    return this.findWhere({ is_active: true });
  }

  /**
   * パスワード認証
   */
  async authenticateUser(email: string, password: string): Promise<Result<User | null, Error>> {
    try {
      const userResult = await this.findByEmail(email);
      if (!userResult.success) {
        return userResult;
      }

      const user = userResult.data;
      if (!user || !user.is_active || !user.password_hash) {
        return { success: true, data: null };
      }

      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      if (!isPasswordValid) {
        return { success: true, data: null };
      }

      // 最終ログイン時刻を更新
      await this.updateLastLogin(user.id);

      return { success: true, data: user };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * パスワード変更
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<Result<boolean, Error>> {
    try {
      const userResult = await this.findById(userId);
      if (!userResult.success) {
        return { success: false, error: userResult.error };
      }

      const user = userResult.data;
      if (!user || !user.password_hash) {
        return { success: false, error: new Error('User not found or invalid') };
      }

      // 現在のパスワードを確認
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isCurrentPasswordValid) {
        return { success: false, error: new Error('Current password is incorrect') };
      }

      // 新しいパスワードをハッシュ化
      const hashedNewPassword = await bcrypt.hash(newPassword, 12);

      // パスワードを更新
      const updateResult = await this.update(userId, {
        password_hash: hashedNewPassword
      } as UpdateUserInput);

      return { success: updateResult.success, data: updateResult.success };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * 最終ログイン時刻の更新
   */
  private async updateLastLogin(userId: string): Promise<Result<boolean, Error>> {
    try {
      const stmt = this.db.prepare('UPDATE users SET last_login_at = datetime(\'now\') WHERE id = ?');
      const result = stmt.run(userId);
      return { success: true, data: result.changes > 0 };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * ユーザーセッションの管理
   */
  async createSession(userId: string, tokenHash: string, expiresAt: string, ipAddress?: string, userAgent?: string): Promise<Result<UserSession, Error>> {
    try {
      const session: UserSession = {
        id: this.generateId(),
        user_id: userId,
        token_hash: tokenHash,
        expires_at: expiresAt,
        ip_address: ipAddress,
        user_agent: userAgent,
        created_at: this.getCurrentTimestamp(),
        updated_at: this.getCurrentTimestamp()
      };

      const stmt = this.db.prepare(`
        INSERT INTO user_sessions (id, user_id, token_hash, expires_at, ip_address, user_agent, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run([
        session.id,
        session.user_id,
        session.token_hash,
        session.expires_at,
        session.ip_address,
        session.user_agent,
        session.created_at,
        session.updated_at
      ]);

      return { success: true, data: session };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * セッション取得
   */
  async findSessionByToken(tokenHash: string): Promise<Result<UserSession | null, Error>> {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM user_sessions 
        WHERE token_hash = ? AND expires_at > datetime('now')
      `);
      const row = stmt.get(tokenHash);
      
      if (!row) {
        return { success: true, data: null };
      }

      const session = row as UserSession;
      return { success: true, data: session };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * セッション削除
   */
  async deleteSession(tokenHash: string): Promise<Result<boolean, Error>> {
    try {
      const stmt = this.db.prepare('DELETE FROM user_sessions WHERE token_hash = ?');
      const result = stmt.run(tokenHash);
      return { success: true, data: result.changes > 0 };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * 期限切れセッションのクリーンアップ
   */
  async cleanupExpiredSessions(): Promise<Result<number, Error>> {
    try {
      const stmt = this.db.prepare('DELETE FROM user_sessions WHERE expires_at <= datetime(\'now\')');
      const result = stmt.run();
      return { success: true, data: result.changes };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  // 基底クラスの抽象メソッドの実装
  protected mapRowToEntity(row: Record<string, unknown>): User {
    return {
      id: row.id as string,
      email: row.email as string,
      name: row.name as string,
      password_hash: row.password_hash as string | undefined,
      role: row.role as 'admin' | 'user',
      provider: row.provider as 'credentials' | 'bitwarden',
      provider_id: row.provider_id as string | undefined,
      avatar_url: row.avatar_url as string | undefined,
      is_active: Boolean(row.is_active),
      last_login_at: row.last_login_at as string | undefined,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string
    };
  }

  protected createEntityFromInput(input: CreateUserInput): User {
    const timestamp = this.getCurrentTimestamp();
    return {
      id: this.generateId(),
      email: input.email,
      name: input.name,
      password_hash: undefined, // パスワードは別途ハッシュ化
      role: input.role || 'user',
      provider: input.provider || 'credentials',
      provider_id: input.provider_id,
      avatar_url: undefined,
      is_active: true,
      last_login_at: undefined,
      created_at: timestamp,
      updated_at: timestamp
    };
  }

  protected validateCreate(input: CreateUserInput): ValidationResult {
    const errors: ValidationError[] = [];

    // メールアドレス検証
    if (!input.email) {
      errors.push({ field: 'email', message: 'Email is required' });
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
      errors.push({ field: 'email', message: 'Invalid email format' });
    }

    // 名前検証
    if (!input.name) {
      errors.push({ field: 'name', message: 'Name is required' });
    } else if (input.name.length < 2 || input.name.length > 100) {
      errors.push({ field: 'name', message: 'Name must be between 2 and 100 characters' });
    }

    // パスワード検証（credentials認証の場合）
    if (input.provider === 'credentials' && input.password) {
      if (input.password.length < 8) {
        errors.push({ field: 'password', message: 'Password must be at least 8 characters' });
      }
    }

    // ロール検証
    if (input.role && !['admin', 'user'].includes(input.role)) {
      errors.push({ field: 'role', message: 'Invalid role' });
    }

    // プロバイダー検証
    if (input.provider && !['credentials', 'bitwarden'].includes(input.provider)) {
      errors.push({ field: 'provider', message: 'Invalid provider' });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  protected validateUpdate(input: UpdateUserInput): ValidationResult {
    const errors: ValidationError[] = [];

    // メールアドレス検証（更新する場合）
    if (input.email !== undefined) {
      if (!input.email) {
        errors.push({ field: 'email', message: 'Email cannot be empty' });
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
        errors.push({ field: 'email', message: 'Invalid email format' });
      }
    }

    // 名前検証（更新する場合）
    if (input.name !== undefined) {
      if (!input.name) {
        errors.push({ field: 'name', message: 'Name cannot be empty' });
      } else if (input.name.length < 2 || input.name.length > 100) {
        errors.push({ field: 'name', message: 'Name must be between 2 and 100 characters' });
      }
    }

    // パスワード検証（更新する場合）
    if (input.password !== undefined && input.password) {
      if (input.password.length < 8) {
        errors.push({ field: 'password', message: 'Password must be at least 8 characters' });
      }
    }

    // ロール検証（更新する場合）
    if (input.role !== undefined && !['admin', 'user'].includes(input.role)) {
      errors.push({ field: 'role', message: 'Invalid role' });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * パスワードハッシュ化付きでユーザーを作成
   */
  async createWithPassword(input: CreateUserInput): Promise<Result<User, Error>> {
    try {
      const validationResult = this.validateCreate(input);
      if (!validationResult.valid) {
        return {
          success: false,
          error: new Error(`Validation failed: ${validationResult.errors.map(e => e.message).join(', ')}`)
        };
      }

      // パスワードをハッシュ化
      let passwordHash: string | undefined;
      if (input.password) {
        passwordHash = await bcrypt.hash(input.password, 12);
      }

      const entity = this.createEntityFromInput(input);
      entity.password_hash = passwordHash;

      const { sql, params } = this.buildInsertQuery(entity);
      const stmt = this.db.prepare(sql);
      stmt.run(params);

      const createdResult = await this.findById(entity.id);
      if (!createdResult.success || !createdResult.data) {
        return {
          success: false,
          error: new Error('Failed to retrieve created user')
        };
      }

      return { success: true, data: createdResult.data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  private buildInsertQuery(entity: User): { sql: string; params: unknown[] } {
    const fields = Object.keys(entity);
    const placeholders = fields.map(() => '?').join(', ');
    const sql = `INSERT INTO ${this.tableName} (${fields.join(', ')}) VALUES (${placeholders})`;
    const params = Object.values(entity);
    return { sql, params };
  }
}