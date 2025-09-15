// =============================================================================
// WebAuthn Provider
// パスキー認証のサーバーサイド実装
// =============================================================================

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  GenerateRegistrationOptionsOpts,
  GenerateAuthenticationOptionsOpts,
  VerifyRegistrationResponseOpts,
  VerifyAuthenticationResponseOpts,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import { db } from '@/db/connection';
import { users, passkeys, webauthnChallenges } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type {
  User,
  Passkey,
  WebAuthnChallenge,
  RegistrationOptions,
  AuthenticationOptions,
  RegistrationResult,
  AuthenticationResult,
  WebAuthnConfig,
  WEBAUTHN_ERROR_CODES,
} from '@/types/webauthn';

// =============================================================================
// Configuration
// =============================================================================

const WEBAUTHN_CONFIG: WebAuthnConfig = {
  rpName: process.env.WEBAUTHN_RP_NAME || 'Docker MCP Manager',
  rpId: process.env.WEBAUTHN_RP_ID || 'localhost',
  origin: process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000',
  allowedOrigins: process.env.WEBAUTHN_ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  challengeTimeout: 5 * 60 * 1000, // 5 minutes
  userVerification: 'preferred',
  requireResidentKey: false,
  residentKey: 'preferred',
};

// =============================================================================
// WebAuthn Provider Class
// =============================================================================

export class WebAuthnProvider {
  private config: WebAuthnConfig;

  constructor(config?: Partial<WebAuthnConfig>) {
    this.config = { ...WEBAUTHN_CONFIG, ...config };
  }

  // ===========================================================================
  // User Management
  // ===========================================================================

  /**
   * ユーザーを作成
   */
  async createUser(
    email: string,
    username: string,
    role: 'admin' | 'user' | 'viewer' = 'user',
    permissions: string[] = []
  ): Promise<User> {
    const userId = randomUUID();
    const now = new Date().toISOString();

    const [newUser] = await db
      .insert(users)
      .values({
        id: userId,
        email,
        username,
        role,
        permissions: JSON.stringify(permissions),
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return this.mapUserFromDb(newUser);
  }

  /**
   * ユーザーを取得
   */
  async getUserById(userId: string): Promise<User | null> {
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return user.length > 0 ? this.mapUserFromDb(user[0]) : null;
  }

  /**
   * メールアドレスでユーザーを取得
   */
  async getUserByEmail(email: string): Promise<User | null> {
    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    return user.length > 0 ? this.mapUserFromDb(user[0]) : null;
  }

  // ===========================================================================
  // Registration Flow
  // ===========================================================================

  /**
   * パスキー登録用のオプションを生成
   */
  async generateRegistrationOptions(userId: string): Promise<RegistrationOptions> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // 既存のパスキーを取得
    const existingPasskeys = await this.getUserPasskeys(userId);

    const options = await generateRegistrationOptions({
      rpName: this.config.rpName,
      rpID: this.config.rpId,
      userID: new TextEncoder().encode(user.id),
      userName: user.email,
      userDisplayName: user.username,
      timeout: this.config.challengeTimeout,
      attestationType: 'none',
      excludeCredentials: existingPasskeys.map((passkey) => ({
        id: new TextEncoder().encode(passkey.credentialId),
        type: 'public-key',
        transports: passkey.transports,
      })),
      authenticatorSelection: {
        residentKey: this.config.residentKey,
        userVerification: this.config.userVerification,
        requireResidentKey: this.config.requireResidentKey,
      },
      supportedAlgorithmIDs: [-7, -257], // ES256, RS256
    });

    // チャレンジを保存
    const challengeId = await this.saveChallenge(
      options.challenge,
      userId,
      'registration'
    );

    return {
      options,
      challenge: challengeId,
    };
  }

  /**
   * パスキー登録を検証・完了
   */
  async verifyRegistration(
    userId: string,
    credential: RegistrationResponseJSON,
    challengeId: string,
    name?: string
  ): Promise<RegistrationResult> {
    try {
      // チャレンジを取得・検証
      const challenge = await this.getAndVerifyChallenge(challengeId, 'registration');
      if (!challenge) {
        return { success: false, error: 'Invalid or expired challenge' };
      }

      const user = await this.getUserById(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // 登録レスポンスを検証
      const verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: challenge.challenge,
        expectedOrigin: this.config.allowedOrigins,
        expectedRPID: this.config.rpId,
        requireUserVerification: this.config.userVerification === 'required',
      });

      if (!verification.verified || !verification.registrationInfo) {
        await this.deleteChallenge(challengeId);
        return { success: false, error: 'Registration verification failed' };
      }

      // パスキーを保存
      const passkey = await this.savePasskey(
        userId,
        verification.registrationInfo,
        name
      );

      // チャレンジを削除
      await this.deleteChallenge(challengeId);

      return { success: true, passkey };
    } catch (error) {
      console.error('Registration verification error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed',
      };
    }
  }

  // ===========================================================================
  // Authentication Flow
  // ===========================================================================

  /**
   * パスキー認証用のオプションを生成
   */
  async generateAuthenticationOptions(userId?: string): Promise<AuthenticationOptions> {
    let allowCredentials: any[] = [];

    if (userId) {
      // 特定ユーザーのパスキーのみを許可
      const userPasskeys = await this.getUserPasskeys(userId);
      allowCredentials = userPasskeys.map((passkey) => ({
        id: new TextEncoder().encode(passkey.credentialId),
        type: 'public-key',
        transports: passkey.transports,
      }));
    }

    const options = await generateAuthenticationOptions({
      rpID: this.config.rpId,
      timeout: this.config.challengeTimeout,
      allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
      userVerification: this.config.userVerification,
    });

    // チャレンジを保存
    const challengeId = await this.saveChallenge(
      options.challenge,
      userId,
      'authentication'
    );

    return {
      options,
      challenge: challengeId,
    };
  }

  /**
   * パスキー認証を検証・完了
   */
  async verifyAuthentication(
    credential: AuthenticationResponseJSON,
    challengeId: string
  ): Promise<AuthenticationResult> {
    try {
      // チャレンジを取得・検証
      const challenge = await this.getAndVerifyChallenge(challengeId, 'authentication');
      if (!challenge) {
        return { success: false, error: 'Invalid or expired challenge' };
      }

      // 認証に使用されたパスキーを取得
      const credentialId = credential.id;
      const passkey = await this.getPasskeyByCredentialId(credentialId);
      if (!passkey) {
        await this.deleteChallenge(challengeId);
        return { success: false, error: 'Passkey not found' };
      }

      const user = await this.getUserById(passkey.userId);
      if (!user || !user.isActive) {
        await this.deleteChallenge(challengeId);
        return { success: false, error: 'User not found or inactive' };
      }

      // 認証レスポンスを検証
      const verification = await verifyAuthenticationResponse({
        response: credential,
        expectedChallenge: challenge.challenge,
        expectedOrigin: this.config.allowedOrigins,
        expectedRPID: this.config.rpId,
        authenticator: {
          credentialID: new TextEncoder().encode(passkey.credentialId),
          credentialPublicKey: passkey.credentialPublicKey,
          counter: passkey.counter,
          transports: passkey.transports,
        },
        requireUserVerification: this.config.userVerification === 'required',
      });

      if (!verification.verified) {
        await this.deleteChallenge(challengeId);
        return { success: false, error: 'Authentication verification failed' };
      }

      // カウンターを更新
      await this.updatePasskeyCounter(passkey.id, verification.authenticationInfo.newCounter);

      // 最終ログイン時刻を更新
      await this.updateUserLastLogin(user.id);

      // チャレンジを削除
      await this.deleteChallenge(challengeId);

      return { success: true, user, passkey };
    } catch (error) {
      console.error('Authentication verification error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
      };
    }
  }

  // ===========================================================================
  // Passkey Management
  // ===========================================================================

  /**
   * ユーザーのパスキー一覧を取得
   */
  async getUserPasskeys(userId: string): Promise<Passkey[]> {
    const results = await db
      .select()
      .from(passkeys)
      .where(eq(passkeys.userId, userId))
      .orderBy(passkeys.createdAt);

    return results.map(this.mapPasskeyFromDb);
  }

  /**
   * パスキーを削除
   */
  async deletePasskey(passkeyId: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(passkeys)
      .where(and(eq(passkeys.id, passkeyId), eq(passkeys.userId, userId)));

    return result.rowsAffected > 0;
  }

  /**
   * パスキーの名前を更新
   */
  async updatePasskeyName(passkeyId: string, userId: string, name: string): Promise<boolean> {
    const result = await db
      .update(passkeys)
      .set({
        name,
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(passkeys.id, passkeyId), eq(passkeys.userId, userId)));

    return result.rowsAffected > 0;
  }

  // ===========================================================================
  // Private Helper Methods
  // ===========================================================================

  private async saveChallenge(
    challenge: string,
    userId?: string,
    type: 'registration' | 'authentication' = 'authentication'
  ): Promise<string> {
    const challengeId = randomUUID();
    const expiresAt = new Date(Date.now() + this.config.challengeTimeout).toISOString();

    await db.insert(webauthnChallenges).values({
      id: challengeId,
      challenge,
      userId,
      type,
      expiresAt,
      createdAt: new Date().toISOString(),
    });

    return challengeId;
  }

  private async getAndVerifyChallenge(
    challengeId: string,
    type: 'registration' | 'authentication'
  ): Promise<WebAuthnChallenge | null> {
    const results = await db
      .select()
      .from(webauthnChallenges)
      .where(
        and(
          eq(webauthnChallenges.id, challengeId),
          eq(webauthnChallenges.type, type)
        )
      )
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    const challenge = results[0];
    const now = new Date();
    const expiresAt = new Date(challenge.expiresAt);

    if (now > expiresAt) {
      // 期限切れのチャレンジを削除
      await this.deleteChallenge(challengeId);
      return null;
    }

    return this.mapChallengeFromDb(challenge);
  }

  private async deleteChallenge(challengeId: string): Promise<void> {
    await db.delete(webauthnChallenges).where(eq(webauthnChallenges.id, challengeId));
  }

  private async savePasskey(
    userId: string,
    registrationInfo: any,
    name?: string
  ): Promise<Passkey> {
    const passkeyId = randomUUID();
    const now = new Date().toISOString();

    const [newPasskey] = await db
      .insert(passkeys)
      .values({
        id: passkeyId,
        userId,
        credentialId: registrationInfo.credentialID.toString(),
        credentialPublicKey: registrationInfo.credentialPublicKey,
        counter: registrationInfo.counter,
        credentialDeviceType: registrationInfo.credentialDeviceType,
        credentialBackedUp: registrationInfo.credentialBackedUp,
        transports: JSON.stringify(registrationInfo.transports || []),
        aaguid: registrationInfo.aaguid,
        name,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return this.mapPasskeyFromDb(newPasskey);
  }

  private async getPasskeyByCredentialId(credentialId: string): Promise<Passkey | null> {
    const results = await db
      .select()
      .from(passkeys)
      .where(eq(passkeys.credentialId, credentialId))
      .limit(1);

    return results.length > 0 ? this.mapPasskeyFromDb(results[0]) : null;
  }

  private async updatePasskeyCounter(passkeyId: string, counter: number): Promise<void> {
    await db
      .update(passkeys)
      .set({
        counter,
        lastUsedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(passkeys.id, passkeyId));
  }

  private async updateUserLastLogin(userId: string): Promise<void> {
    await db
      .update(users)
      .set({
        lastLoginAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, userId));
  }

  // ===========================================================================
  // Data Mapping Helpers
  // ===========================================================================

  private mapUserFromDb(dbUser: any): User {
    return {
      id: dbUser.id,
      email: dbUser.email,
      username: dbUser.username,
      role: dbUser.role,
      permissions: dbUser.permissions ? JSON.parse(dbUser.permissions) : [],
      isActive: Boolean(dbUser.isActive),
      lastLoginAt: dbUser.lastLoginAt ? new Date(dbUser.lastLoginAt) : undefined,
      createdAt: new Date(dbUser.createdAt),
      updatedAt: new Date(dbUser.updatedAt),
    };
  }

  private mapPasskeyFromDb(dbPasskey: any): Passkey {
    return {
      id: dbPasskey.id,
      userId: dbPasskey.userId,
      credentialId: dbPasskey.credentialId,
      credentialPublicKey: dbPasskey.credentialPublicKey,
      counter: dbPasskey.counter,
      credentialDeviceType: dbPasskey.credentialDeviceType,
      credentialBackedUp: Boolean(dbPasskey.credentialBackedUp),
      transports: dbPasskey.transports ? JSON.parse(dbPasskey.transports) : undefined,
      aaguid: dbPasskey.aaguid,
      name: dbPasskey.name,
      lastUsedAt: dbPasskey.lastUsedAt ? new Date(dbPasskey.lastUsedAt) : undefined,
      createdAt: new Date(dbPasskey.createdAt),
      updatedAt: new Date(dbPasskey.updatedAt),
    };
  }

  private mapChallengeFromDb(dbChallenge: any): WebAuthnChallenge {
    return {
      id: dbChallenge.id,
      challenge: dbChallenge.challenge,
      userId: dbChallenge.userId,
      type: dbChallenge.type,
      userAgent: dbChallenge.userAgent,
      ipAddress: dbChallenge.ipAddress,
      expiresAt: new Date(dbChallenge.expiresAt),
      createdAt: new Date(dbChallenge.createdAt),
    };
  }
}

// =============================================================================
// Global Instance
// =============================================================================

export const webauthnProvider = new WebAuthnProvider();