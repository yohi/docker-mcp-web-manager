'use client';

import { useTheme, THEME_PRESETS } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Monitor, Moon, Sun, Palette, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  variant?: 'button' | 'dropdown' | 'compact';
  showLabel?: boolean;
  className?: string;
}

export function ThemeToggle({ 
  variant = 'dropdown',
  showLabel = false,
  className 
}: ThemeToggleProps) {
  const { theme, actualTheme, setTheme, toggleTheme } = useTheme();

  // アイコンマッピング
  const ThemeIcon = {
    light: Sun,
    dark: Moon,
    system: Monitor,
  };

  const CurrentIcon = ThemeIcon[theme];
  const currentPreset = THEME_PRESETS[theme];

  // シンプルなトグルボタン
  if (variant === 'button') {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={toggleTheme}
        className={cn('flex items-center gap-2', className)}
      >
        <CurrentIcon className="h-4 w-4" />
        {showLabel && currentPreset.name}
      </Button>
    );
  }

  // コンパクトボタン
  if (variant === 'compact') {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleTheme}
        className={cn('h-9 w-9 p-0', className)}
      >
        <CurrentIcon className="h-4 w-4" />
        <span className="sr-only">テーマ切り替え</span>
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
          <CurrentIcon className="h-4 w-4" />
          {showLabel && (
            <>
              <span>{currentPreset.name}</span>
              <Palette className="h-3 w-3 opacity-50" />
            </>
          )}
          {!showLabel && <span className="sr-only">テーマ切り替え</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Palette className="h-4 w-4" />
          テーマ設定
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {(Object.entries(THEME_PRESETS) as Array<[keyof typeof THEME_PRESETS, typeof THEME_PRESETS[keyof typeof THEME_PRESETS]]>).map(([themeKey, preset]) => {
          const Icon = ThemeIcon[themeKey];
          const isActive = theme === themeKey;
          
          return (
            <DropdownMenuItem
              key={themeKey}
              onClick={() => setTheme(themeKey)}
              className={cn(
                'flex items-center gap-3 cursor-pointer',
                isActive && 'bg-accent'
              )}
            >
              <Icon className="h-4 w-4" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span>{preset.name}</span>
                  {isActive && <Check className="h-3 w-3 text-primary" />}
                </div>
                <p className="text-xs text-muted-foreground">
                  {preset.description}
                </p>
              </div>
            </DropdownMenuItem>
          );
        })}
        
        <DropdownMenuSeparator />
        
        {/* 現在のテーマ情報 */}
        <div className="px-2 py-1.5">
          <p className="text-xs text-muted-foreground">
            現在: {actualTheme === 'dark' ? '🌙 ダーク' : '☀️ ライト'}モード
          </p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// テーマプレビューコンポーネント
interface ThemePreviewProps {
  theme: 'light' | 'dark';
  isActive?: boolean;
  onClick?: () => void;
}

export function ThemePreview({ theme, isActive, onClick }: ThemePreviewProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex h-20 w-32 items-center justify-center rounded-lg border-2 transition-all',
        'hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary/20',
        isActive 
          ? 'border-primary shadow-lg' 
          : 'border-border hover:border-primary/50',
        theme === 'dark' ? 'bg-slate-900' : 'bg-white'
      )}
    >
      {/* プレビュー内容 */}
      <div className={cn(
        'space-y-1',
        theme === 'dark' ? 'text-white' : 'text-slate-900'
      )}>
        <div className="text-xs font-medium">
          {theme === 'dark' ? 'ダーク' : 'ライト'}
        </div>
        <div className="flex gap-1">
          <div className={cn(
            'h-1 w-4 rounded',
            theme === 'dark' ? 'bg-slate-600' : 'bg-slate-300'
          )} />
          <div className={cn(
            'h-1 w-2 rounded',
            theme === 'dark' ? 'bg-slate-700' : 'bg-slate-200'
          )} />
        </div>
      </div>
      
      {/* アクティブインジケーター */}
      {isActive && (
        <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-primary">
          <Check className="h-3 w-3 text-primary-foreground" />
        </div>
      )}
    </button>
  );
}