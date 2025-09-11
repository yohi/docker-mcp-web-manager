'use client';

import { ReactNode, useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NotificationPanel } from '@/components/notifications/NotificationPanel';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { LanguageToggle } from '@/components/i18n/LanguageToggle';
import {
  HomeIcon,
  ServerIcon,
  RectangleGroupIcon,
  DocumentTextIcon,
  Cog6ToothIcon,
  KeyIcon,
  BellIcon,
  UserIcon,
  Bars3Icon,
  XMarkIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { clsx } from 'clsx';

// =============================================================================
// メインレイアウトコンポーネント
// 認証済みユーザー向けの統一されたレイアウト
// =============================================================================

interface MainLayoutProps {
  children: ReactNode;
}

interface NavigationItem {
  name: string;
  href: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  badge?: number;
  children?: NavigationItem[];
}

const navigation: NavigationItem[] = [
  { 
    name: 'ダッシュボード', 
    href: '/dashboard', 
    icon: HomeIcon 
  },
  { 
    name: 'サーバー管理', 
    href: '/servers', 
    icon: ServerIcon,
    children: [
      { name: 'サーバー一覧', href: '/servers', icon: ServerIcon },
      { name: '新規作成', href: '/servers/new', icon: ServerIcon },
    ]
  },
  { 
    name: 'カタログ', 
    href: '/catalog', 
    icon: RectangleGroupIcon,
    children: [
      { name: 'カタログ一覧', href: '/catalog', icon: RectangleGroupIcon },
      { name: 'インストール履歴', href: '/catalog/history', icon: RectangleGroupIcon },
    ]
  },
  { 
    name: 'ログ・監視', 
    href: '/logs', 
    icon: DocumentTextIcon,
    children: [
      { name: 'ログ一覧', href: '/logs', icon: DocumentTextIcon },
      { name: 'リアルタイム監視', href: '/logs/realtime', icon: DocumentTextIcon },
    ]
  },
  { 
    name: 'シークレット管理', 
    href: '/secrets', 
    icon: KeyIcon,
    children: [
      { name: 'シークレット一覧', href: '/secrets', icon: KeyIcon },
      { name: 'Bitwarden同期', href: '/secrets/sync', icon: KeyIcon },
    ]
  },
  { 
    name: '設定', 
    href: '/settings', 
    icon: Cog6ToothIcon,
    children: [
      { name: 'システム設定', href: '/settings', icon: Cog6ToothIcon },
      { name: 'ユーザー管理', href: '/settings/users', icon: UserIcon },
      { name: 'セキュリティ設定', href: '/settings/security', icon: KeyIcon },
    ]
  },
];

export default function MainLayout({ children }: MainLayoutProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);

  // 認証チェック
  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  // サブメニューの初期表示設定
  useEffect(() => {
    const currentNav = navigation.find(nav => 
      pathname.startsWith(nav.href) || 
      nav.children?.some(child => pathname.startsWith(child.href))
    );
    if (currentNav && currentNav.children) {
      setOpenSubmenu(currentNav.name);
    }
  }, [pathname]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const toggleSubmenu = (name: string) => {
    setOpenSubmenu(openSubmenu === name ? null : name);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar */}
      <div className={clsx(
        'fixed inset-0 flex z-40 md:hidden',
        sidebarOpen ? 'block' : 'hidden'
      )}>
        <div 
          className="fixed inset-0 bg-gray-600 bg-opacity-75" 
          onClick={() => setSidebarOpen(false)}
        />
        <div className="relative flex-1 flex flex-col max-w-xs w-full pt-5 pb-4 bg-white">
          <div className="absolute top-0 right-0 -mr-12 pt-2">
            <button
              type="button"
              className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
              onClick={() => setSidebarOpen(false)}
            >
              <span className="sr-only">Close sidebar</span>
              <XMarkIcon className="h-6 w-6 text-white" />
            </button>
          </div>
          <div className="flex-shrink-0 flex items-center px-4">
            <h1 className="text-xl font-bold text-gray-900">
              Docker MCP Manager
            </h1>
          </div>
          <div className="mt-5 flex-1 h-0 overflow-y-auto">
            <NavigationList 
              navigation={navigation}
              pathname={pathname}
              openSubmenu={openSubmenu}
              toggleSubmenu={toggleSubmenu}
              mobile={true}
            />
          </div>
        </div>
      </div>

      {/* Static sidebar for desktop */}
      <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0">
        <div className="flex flex-col flex-grow pt-5 bg-white overflow-y-auto border-r border-gray-200">
          <div className="flex items-center flex-shrink-0 px-4">
            <h1 className="text-xl font-bold text-gray-900">
              Docker MCP Manager
            </h1>
          </div>
          <div className="mt-5 flex-grow flex flex-col">
            <NavigationList 
              navigation={navigation}
              pathname={pathname}
              openSubmenu={openSubmenu}
              toggleSubmenu={toggleSubmenu}
              mobile={false}
            />
          </div>
          <div className="flex-shrink-0 flex border-t border-gray-200 p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <img
                  className="h-8 w-8 rounded-full"
                  src={'/default-avatar.png'}
                  alt=""
                />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-700">
                  {session.user?.email}
                </p>
                <p className="text-xs text-gray-500">
                  {session.user?.email}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="md:pl-64 flex flex-col">
        {/* Top bar */}
        <div className="sticky top-0 z-10 flex-shrink-0 flex h-16 bg-white shadow">
          <button
            type="button"
            className="px-4 border-r border-gray-200 text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 md:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <span className="sr-only">Open sidebar</span>
            <Bars3Icon className="h-6 w-6" />
          </button>
          
          <div className="flex-1 px-4 flex justify-between items-center">
            <div className="flex-1" />
            
            <div className="ml-4 flex items-center md:ml-6">
              {/* Language Toggle */}
              <LanguageToggle variant="compact" />

              {/* Theme Toggle */}
              <div className="ml-2">
                <ThemeToggle variant="compact" />
              </div>

              {/* Notifications - リアルタイム通知パネル */}
              <div className="ml-3">
                <NotificationPanel />
              </div>

              {/* Profile dropdown */}
              <div className="ml-3 relative">
                <div className="flex items-center text-sm text-gray-700">
                  <span className="inline-block h-6 w-6 rounded-full overflow-hidden bg-gray-100 mr-2">
                    <img
                      src={'/default-avatar.png'}
                      alt=""
                      className="h-full w-full"
                    />
                  </span>
                  <span className="hidden md:block">
                    {session.user?.email}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main content */}
        <main className="flex-1">
          <div className="py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

// Navigation list component
interface NavigationListProps {
  navigation: NavigationItem[];
  pathname: string;
  openSubmenu: string | null;
  toggleSubmenu: (name: string) => void;
  mobile: boolean;
}

function NavigationList({ 
  navigation, 
  pathname, 
  openSubmenu, 
  toggleSubmenu, 
  mobile 
}: NavigationListProps) {
  return (
    <nav className="px-2 space-y-1">
      {navigation.map((item) => (
        <div key={item.name}>
          {item.children ? (
            <div>
              <button
                onClick={() => toggleSubmenu(item.name)}
                className={clsx(
                  'group w-full flex items-center justify-between px-2 py-2 text-sm font-medium rounded-md transition-colors duration-200',
                  pathname.startsWith(item.href)
                    ? 'bg-blue-100 text-blue-900'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                <div className="flex items-center">
                  <item.icon 
                    className={clsx(
                      'mr-3 flex-shrink-0 h-5 w-5 transition-colors duration-200',
                      pathname.startsWith(item.href)
                        ? 'text-blue-500'
                        : 'text-gray-400 group-hover:text-gray-500'
                    )}
                  />
                  {item.name}
                </div>
                <ChevronDownIcon
                  className={clsx(
                    'ml-3 h-4 w-4 transition-transform duration-200',
                    openSubmenu === item.name ? 'rotate-180' : ''
                  )}
                />
              </button>
              
              {openSubmenu === item.name && (
                <div className="mt-1 space-y-1">
                  {item.children.map((child) => (
                    <Link
                      key={child.name}
                      href={child.href}
                      className={clsx(
                        'group flex items-center pl-10 pr-2 py-2 text-sm font-medium rounded-md transition-colors duration-200',
                        pathname === child.href
                          ? 'bg-blue-100 text-blue-900'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      )}
                    >
                      <child.icon 
                        className={clsx(
                          'mr-3 flex-shrink-0 h-4 w-4 transition-colors duration-200',
                          pathname === child.href
                            ? 'text-blue-500'
                            : 'text-gray-400 group-hover:text-gray-500'
                        )}
                      />
                      {child.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <Link
              href={item.href}
              className={clsx(
                'group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors duration-200',
                pathname === item.href
                  ? 'bg-blue-100 text-blue-900'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <item.icon 
                className={clsx(
                  'mr-3 flex-shrink-0 h-5 w-5 transition-colors duration-200',
                  pathname === item.href
                    ? 'text-blue-500'
                    : 'text-gray-400 group-hover:text-gray-500'
                )}
              />
              {item.name}
              {item.badge && item.badge > 0 && (
                <span className="ml-auto inline-block py-0.5 px-2 text-xs bg-blue-100 text-blue-800 rounded-full">
                  {item.badge}
                </span>
              )}
            </Link>
          )}
        </div>
      ))}
    </nav>
  );
}