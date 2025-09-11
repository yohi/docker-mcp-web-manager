'use client';

import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  actualTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// システムのダークモード設定を取得
function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// 保存されたテーマ設定を取得
function getSavedTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
  } catch (error) {
    console.warn('テーマ設定の読み込みに失敗しました:', error);
  }
  
  return 'system';
}

// 実際に適用するテーマを決定
function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    return getSystemTheme();
  }
  return theme;
}

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
}

export function ThemeProvider({ 
  children, 
  defaultTheme = 'system' 
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    // SSR対応: 初回はdefaultThemeを使用
    return defaultTheme;
  });
  
  const [actualTheme, setActualTheme] = useState<'light' | 'dark'>(() => {
    return resolveTheme(defaultTheme);
  });

  // クライアントサイドでのテーマ初期化
  useEffect(() => {
    const savedTheme = getSavedTheme();
    setThemeState(savedTheme);
    setActualTheme(resolveTheme(savedTheme));
  }, []);

  // テーマ変更時の処理
  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    setActualTheme(resolveTheme(newTheme));
    
    try {
      localStorage.setItem('theme', newTheme);
    } catch (error) {
      console.warn('テーマ設定の保存に失敗しました:', error);
    }
  };

  // ライト/ダークの切り替え
  const toggleTheme = () => {
    if (theme === 'system') {
      const systemTheme = getSystemTheme();
      setTheme(systemTheme === 'dark' ? 'light' : 'dark');
    } else {
      setTheme(theme === 'dark' ? 'light' : 'dark');
    }
  };

  // システムテーマの変更を監視
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (e: MediaQueryListEvent) => {
      setActualTheme(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  // HTMLクラス名の適用
  useEffect(() => {
    const root = window.document.documentElement;
    
    // 既存のテーマクラスを削除
    root.classList.remove('light', 'dark');
    
    // 新しいテーマクラスを追加
    root.classList.add(actualTheme);
    
    // メタテーマカラーの更新
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', 
        actualTheme === 'dark' ? '#0f172a' : '#ffffff'
      );
    }
  }, [actualTheme]);

  return (
    <ThemeContext.Provider value={{ 
      theme, 
      actualTheme, 
      setTheme, 
      toggleTheme 
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

// テーマコンテキストフック
export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

// プリセットテーマ設定
export const THEME_PRESETS = {
  light: {
    name: 'ライトモード',
    icon: '☀️',
    description: '明るい背景色のテーマ',
  },
  dark: {
    name: 'ダークモード', 
    icon: '🌙',
    description: '暗い背景色のテーマ',
  },
  system: {
    name: 'システム設定',
    icon: '💻',
    description: 'システムの設定に従って自動切り替え',
  },
} as const;