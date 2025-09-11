// Auth Configuration
// NextAuth.js configuration with permissions and session management

import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { validateCredentials } from './credentials-validator';
import { Permission, hasPermission } from './permissions';

export const authConfig: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        const user = await validateCredentials(
          credentials.username,
          credentials.password
        );

        if (user) {
          return {
            id: user.id,
            name: user.username,
            email: user.email,
            role: user.role,
            permissions: user.permissions
          };
        }

        return null;
      }
    })
  ],
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },
  jwt: {
    maxAge: 24 * 60 * 60, // 24 hours
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.permissions = user.permissions;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.sub;
        session.user.role = token.role as string;
        session.user.permissions = token.permissions as Permission[];
      }
      return session;
    }
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error'
  },
  secret: process.env.NEXTAUTH_SECRET
};

// Helper function to check if user has required permission
export function checkPermission(
  userPermissions: Permission[],
  requiredPermission: Permission
): boolean {
  return hasPermission(userPermissions, requiredPermission);
}

// Helper function to check multiple permissions
export function checkPermissions(
  userPermissions: Permission[],
  requiredPermissions: Permission[]
): boolean {
  return requiredPermissions.every(permission =>
    hasPermission(userPermissions, permission)
  );
}

export default authConfig;