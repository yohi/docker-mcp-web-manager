import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/components/auth/auth-provider';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Docker MCP Web Manager',
  description: 'Web-based management tool for Docker MCP Gateway',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang='ja'>
      <body className={inter.className}>
        <AuthProvider>
          <div id='__next'>{children}</div>
        </AuthProvider>
      </body>
    </html>
  );
}