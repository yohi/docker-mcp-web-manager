'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Globe, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LanguageToggleProps {
  variant?: 'button' | 'dropdown' | 'compact';
  showLabel?: boolean;
  className?: string;
}

const languages = [
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
] as const;

export function LanguageToggle({ 
  variant = 'dropdown',
  showLabel = false,
  className 
}: LanguageToggleProps) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('common');

  const currentLanguage = languages.find(lang => lang.code === locale) || languages[0];

  const switchLanguage = (newLocale: string) => {
    // パスから現在のロケールを取り除き、新しいロケールを追加
    const segments = pathname.split('/').filter(Boolean);
    const isLocaleInPath = languages.some(lang => lang.code === segments[0]);
    
    let newPath: string;
    if (isLocaleInPath) {
      // 既にロケールがパスに含まれている場合、置き換え
      segments[0] = newLocale;
      newPath = `/${segments.join('/')}`;
    } else {
      // ロケールがパスに含まれていない場合、追加
      newPath = `/${newLocale}${pathname}`;
    }

    router.push(newPath);
  };

  // シンプルなトグルボタン
  if (variant === 'button') {
    const nextLanguage = languages.find(lang => lang.code !== locale) || languages[1];
    
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => switchLanguage(nextLanguage.code)}
        className={cn('flex items-center gap-2', className)}
      >
        <span className="text-sm">{currentLanguage.flag}</span>
        {showLabel && currentLanguage.name}
      </Button>
    );
  }

  // コンパクトボタン
  if (variant === 'compact') {
    const nextLanguage = languages.find(lang => lang.code !== locale) || languages[1];
    
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => switchLanguage(nextLanguage.code)}
        className={cn('h-9 w-9 p-0', className)}
        title={`Switch to ${nextLanguage.name}`}
      >
        <span className="text-base">{currentLanguage.flag}</span>
        <span className="sr-only">言語切り替え</span>
      </Button>
    );
  }

  // ドロップダウンメニュー（デフォルト）
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('flex items-center gap-2', className)}
        >
          <Globe className="h-4 w-4" />
          {showLabel && (
            <>
              <span className="text-sm">{currentLanguage.flag}</span>
              <span>{currentLanguage.name}</span>
            </>
          )}
          {!showLabel && <span className="sr-only">言語切り替え</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[120px]">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Globe className="h-4 w-4" />
          言語 / Language
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {languages.map((language) => {
          const isActive = locale === language.code;
          
          return (
            <DropdownMenuItem
              key={language.code}
              onClick={() => switchLanguage(language.code)}
              className={cn(
                'flex items-center gap-3 cursor-pointer',
                isActive && 'bg-accent'
              )}
            >
              <span className="text-base">{language.flag}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span>{language.name}</span>
                  {isActive && <Check className="h-3 w-3 text-primary" />}
                </div>
              </div>
            </DropdownMenuItem>
          );
        })}
        
        <DropdownMenuSeparator />
        
        {/* 現在の言語情報 */}
        <div className="px-2 py-1.5">
          <p className="text-xs text-muted-foreground">
            現在: {currentLanguage.flag} {currentLanguage.name}
          </p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}