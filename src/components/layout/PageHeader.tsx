'use client';

import { ReactNode } from 'react';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

// =============================================================================
// ページヘッダーコンポーネント
// ページタイトル、パンくずリスト、アクションボタンの統一レイアウト
// =============================================================================

interface BreadcrumbItem {
  name: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
  children?: ReactNode;
}

export default function PageHeader({
  title,
  description,
  breadcrumbs = [],
  actions,
  children,
}: PageHeaderProps) {
  return (
    <div className="bg-white shadow-sm">
      <div className="px-4 sm:px-6 lg:px-8">
        {/* Breadcrumbs */}
        {breadcrumbs.length > 0 && (
          <nav className="flex pt-6 pb-2" aria-label="Breadcrumb">
            <ol className="flex items-center space-x-2">
              {breadcrumbs.map((item, index) => (
                <li key={item.name} className="flex items-center">
                  {index > 0 && (
                    <ChevronRightIcon
                      className="flex-shrink-0 h-4 w-4 text-gray-400 mx-2"
                      aria-hidden="true"
                    />
                  )}
                  {item.href && index < breadcrumbs.length - 1 ? (
                    <Link
                      href={item.href}
                      className="text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors duration-200"
                    >
                      {item.name}
                    </Link>
                  ) : (
                    <span
                      className={`text-sm font-medium ${
                        index === breadcrumbs.length - 1
                          ? 'text-gray-900'
                          : 'text-gray-500'
                      }`}
                    >
                      {item.name}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}

        {/* Main header */}
        <div className={`${breadcrumbs.length > 0 ? 'pb-6' : 'py-6'}`}>
          <div className="md:flex md:items-center md:justify-between">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
                {title}
              </h1>
              {description && (
                <p className="mt-1 text-sm text-gray-500 max-w-2xl">
                  {description}
                </p>
              )}
            </div>
            {actions && (
              <div className="mt-4 flex md:mt-0 md:ml-4 space-x-3">
                {actions}
              </div>
            )}
          </div>
          {children && (
            <div className="mt-4">
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}