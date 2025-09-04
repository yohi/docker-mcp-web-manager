import NextAuth from 'next-auth';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from './src/lib/db/connection';
import { authConfig } from './auth.config';
import { 
  accounts, 
  sessions, 
  users, 
  verificationTokens 
} from './src/lib/db/schema/auth-schema';

export const { 
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30日
    updateAge: 24 * 60 * 60, // 24時間
  },
  jwt: {
    maxAge: 30 * 24 * 60 * 60, // 30日
  },
  secret: process.env.NEXTAUTH_SECRET,
});