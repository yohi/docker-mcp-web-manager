import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { getUserRepository } from './src/lib/db/repositories';
import { bitwardenProvider } from './src/lib/bitwarden';

// 認証設定スキーマ
const loginSchema = z.object({
  username: z.string().min(1, 'Username is required').max(100),
  password: z.string().min(1, 'Password is required').max(500),
});

export const authConfig = {
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnProtected = nextUrl.pathname.startsWith('/dashboard');
      
      if (isOnProtected) {
        if (isLoggedIn) return true;
        return false; // リダイレクト先を/auth/signinに
      } else if (isLoggedIn) {
        return Response.redirect(new URL('/dashboard', nextUrl));
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.username = user.name;
      }
      return token;
    },
    session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.username = token.username as string;
      }
      return session;
    },
  },
  providers: [
    // ローカル認証プロバイダー
    Credentials({
      id: 'credentials',
      name: 'Local Login',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        try {
          const parsedCredentials = loginSchema.safeParse(credentials);
          
          if (!parsedCredentials.success) {
            return null;
          }

          const { username, password } = parsedCredentials.data;
          
          // データベースからユーザーを取得
          const userRepository = getUserRepository();
          const user = await userRepository.findByUsername(username);
          
          if (!user) {
            return null;
          }

          // パスワードの検証
          const passwordsMatch = await bcrypt.compare(password, user.passwordHash || '');
          
          if (!passwordsMatch) {
            return null;
          }

          return {
            id: user.id,
            name: user.username,
            email: user.email || undefined,
          };
        } catch (error) {
          console.error('Authentication error:', error);
          return null;
        }
      },
    }),
    // Bitwarden認証プロバイダー
    bitwardenProvider,
  ],
} satisfies NextAuthConfig;