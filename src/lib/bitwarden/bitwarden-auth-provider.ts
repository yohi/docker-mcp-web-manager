import type { CredentialsConfig } from 'next-auth/providers/credentials';
import { BitwardenClient } from './bitwarden-client';
import { getUserRepository } from '../db/repositories';
import { z } from 'zod';

/**
 * Bitwarden認証プロバイダーのスキーマ
 */
const bitwardenLoginSchema = z.object({
  email: z.string().email('Invalid email format').max(255),
  password: z.string().min(1, 'Password is required').max(500),
  masterPassword: z.string().min(1, 'Master password is required').max(500),
  serverUrl: z.string().url().optional(),
  createLocalUser: z.boolean().default(false),
});

/**
 * Bitwarden認証プロバイダー設定
 * BitwardenでのログインとローカルDBでのユーザー管理を統合
 */
export const bitwardenProvider: CredentialsConfig = {
  id: 'bitwarden',
  name: 'Bitwarden',
  credentials: {
    email: { 
      label: 'Email', 
      type: 'email',
      placeholder: 'your@email.com',
    },
    password: { 
      label: 'Bitwarden Password', 
      type: 'password',
      placeholder: 'Your Bitwarden account password',
    },
    masterPassword: { 
      label: 'Master Password', 
      type: 'password',
      placeholder: 'Your Bitwarden master password',
    },
    serverUrl: { 
      label: 'Server URL (Optional)', 
      type: 'url',
      placeholder: 'https://your-bitwarden-server.com',
    },
    createLocalUser: {
      label: 'Create local user if not exists',
      type: 'checkbox',
    },
  },
  
  async authorize(credentials) {
    try {
      const parsedCredentials = bitwardenLoginSchema.safeParse(credentials);
      
      if (!parsedCredentials.success) {
        console.error('Invalid Bitwarden credentials:', parsedCredentials.error.errors);
        return null;
      }

      const { 
        email, 
        password, 
        masterPassword, 
        serverUrl, 
        createLocalUser 
      } = parsedCredentials.data;

      const bitwardenClient = BitwardenClient.getInstance();
      const userRepository = getUserRepository();

      try {
        // 1. Bitwardenにログイン
        const loginSuccess = await bitwardenClient.login(email, password, serverUrl);
        
        if (!loginSuccess) {
          console.error('Bitwarden login failed for user:', email);
          return null;
        }

        // 2. Vaultをアンロック
        const sessionToken = await bitwardenClient.unlock(masterPassword);
        
        if (!sessionToken) {
          console.error('Failed to unlock Bitwarden vault for user:', email);
          return null;
        }

        // 3. ローカルユーザーの確認/作成
        let localUser = await userRepository.findByUsername(email);

        if (!localUser) {
          if (!createLocalUser) {
            console.error('Local user not found and creation not permitted:', email);
            return null;
          }

          // ローカルユーザーを作成
          try {
            localUser = await userRepository.create({
              username: email,
              email: email,
              password: 'bitwarden-managed', // ダミーパスワード
              role: 'user',
            });
            console.log('Created local user from Bitwarden authentication:', email);
          } catch (error) {
            console.error('Failed to create local user:', error);
            return null;
          }
        }

        if (!localUser.isActive) {
          console.error('Local user is deactivated:', email);
          return null;
        }

        // 4. 最終ログイン時刻を更新
        await userRepository.updateLastLogin(localUser.id);

        return {
          id: localUser.id,
          name: localUser.username,
          email: localUser.email || email,
          role: localUser.role,
        };

      } catch (bitwardenError) {
        console.error('Bitwarden authentication error:', bitwardenError);
        return null;
      } finally {
        // セキュリティのためセッションをクリア
        bitwardenClient.clearSession();
      }

    } catch (error) {
      console.error('Bitwarden provider error:', error);
      return null;
    }
  },
};

/**
 * Bitwarden環境変数取得のヘルパー関数
 */
export class BitwardenSecretProvider {
  private bitwardenClient: BitwardenClient;

  constructor() {
    this.bitwardenClient = BitwardenClient.getInstance();
  }

  /**
   * 認証してセッションを確立
   */
  async authenticate(email: string, password: string, masterPassword: string, serverUrl?: string): Promise<boolean> {
    try {
      const loginSuccess = await this.bitwardenClient.login(email, password, serverUrl);
      
      if (!loginSuccess) {
        return false;
      }

      const sessionToken = await this.bitwardenClient.unlock(masterPassword);
      return !!sessionToken;
    } catch (error) {
      console.error('Bitwarden authentication error:', error);
      return false;
    }
  }

  /**
   * アイテムから環境変数値を取得
   */
  async getEnvironmentVariable(itemId: string, fieldName?: string): Promise<string | null> {
    try {
      if (!this.bitwardenClient.isUnlocked()) {
        throw new Error('Bitwarden vault is not unlocked');
      }

      return await this.bitwardenClient.getEnvironmentValue(itemId, fieldName);
    } catch (error) {
      console.error('Failed to get environment variable from Bitwarden:', error);
      return null;
    }
  }

  /**
   * 名前でアイテムを検索して環境変数値を取得
   */
  async getEnvironmentVariableByName(itemName: string, fieldName?: string): Promise<string | null> {
    try {
      if (!this.bitwardenClient.isUnlocked()) {
        throw new Error('Bitwarden vault is not unlocked');
      }

      const items = await this.bitwardenClient.listItems(itemName);
      
      if (items.length === 0) {
        console.warn(`No Bitwarden item found with name: ${itemName}`);
        return null;
      }

      // 最初にマッチしたアイテムを使用
      const item = items[0];
      
      // カスタムフィールドから検索
      if (fieldName && item.fields) {
        const field = item.fields.find(f => f.name === fieldName);
        if (field) {
          return field.value;
        }
      }

      // フィールドが見つからない場合はパスワードを返す
      return item.login?.password || null;

    } catch (error) {
      console.error('Failed to get environment variable by name from Bitwarden:', error);
      return null;
    }
  }

  /**
   * セッションを終了
   */
  async cleanup(): Promise<void> {
    try {
      await this.bitwardenClient.logout();
    } catch (error) {
      console.warn('Bitwarden cleanup warning:', error);
    }
  }
}