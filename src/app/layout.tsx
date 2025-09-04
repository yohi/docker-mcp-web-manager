import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Docker MCP Web Manager',
  description: 'A web-based management tool for Docker MCP Gateway',
  keywords: ['Docker', 'MCP', 'Gateway', 'Management', 'Web Interface'],
  authors: [{ name: 'Docker MCP Web Manager Team' }],
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased min-h-screen bg-background text-foreground">
        <div id="root">{children}</div>
      </body>
    </html>
  );
}
