// Jest セットアップファイル
// テスト実行前に実行される設定とモック

// React Testing Library のカスタムマッチャーを追加
import '@testing-library/jest-dom';

// Node.js環境変数のモック
process.env.NODE_ENV = 'test';
process.env.NEXTAUTH_SECRET = 'test-secret-key-for-testing-only';
process.env.NEXTAUTH_URL = 'http://localhost:3000';
process.env.DATABASE_URL = ':memory:';
process.env.ENCRYPTION_MASTER_KEY = 'dGVzdC1lbmNyeXB0aW9uLWtleS1mb3ItdGVzdGluZw==';

// グローバルなモックの設定
global.fetch = jest.fn();

// Next.js Router のモック
jest.mock('next/router', () => ({
  useRouter() {
    return {
      route: '/',
      pathname: '/',
      query: {},
      asPath: '/',
      push: jest.fn(),
      pop: jest.fn(),
      reload: jest.fn(),
      back: jest.fn(),
      prefetch: jest.fn().mockResolvedValue(undefined),
      beforePopState: jest.fn(),
      events: {
        on: jest.fn(),
        off: jest.fn(),
        emit: jest.fn(),
      },
      isFallback: false,
      isLocaleDomain: false,
      isReady: true,
      defaultLocale: 'ja',
      domainLocales: [],
      isPreview: false,
    };
  },
}));

// Next.js Navigation のモック (App Router)
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
    };
  },
  useSearchParams() {
    return new URLSearchParams();
  },
  usePathname() {
    return '/';
  },
}));

// NextAuth のモック
jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({
    data: {
      user: {
        id: '1',
        email: 'test@example.com',
        name: 'Test User',
      },
      expires: '2025-01-01T00:00:00.000Z',
    },
    status: 'authenticated',
  })),
  signIn: jest.fn(),
  signOut: jest.fn(),
  getSession: jest.fn(),
}));

// ファイルアップロード関連のモック
Object.defineProperty(window, 'File', {
  value: class File {
    constructor(fileBits, fileName, options = {}) {
      this.name = fileName;
      this.size = fileBits.reduce((acc, bit) => acc + bit.length, 0);
      this.type = options.type || '';
      this.lastModified = Date.now();
    }
  },
});

Object.defineProperty(window, 'FileReader', {
  value: class FileReader {
    constructor() {
      this.readyState = 0;
      this.result = null;
    }

    readAsText(file) {
      setTimeout(() => {
        this.readyState = 2;
        this.result = 'mock file content';
        if (this.onload) this.onload();
      }, 0);
    }

    readAsDataURL(file) {
      setTimeout(() => {
        this.readyState = 2;
        this.result = 'data:text/plain;base64,bW9jayBmaWxlIGNvbnRlbnQ=';
        if (this.onload) this.onload();
      }, 0);
    }
  },
});

// ResizeObserver のモック
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// IntersectionObserver のモック
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

// Window.matchMedia のモック
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Next.js Server API モック - テスト環境でのみ有効
jest.mock('next/server', () => ({
  NextRequest: jest.fn().mockImplementation((url, init = {}) => {
    const urlObj = new URL(url);
    return {
      url,
      method: init.method || 'GET',
      headers: new Map(Object.entries(init.headers || {})),
      nextUrl: {
        searchParams: urlObj.searchParams,
        pathname: urlObj.pathname,
        href: url,
      },
      json: jest.fn().mockImplementation(() => {
        if (init.body) {
          return Promise.resolve(typeof init.body === 'string' ? JSON.parse(init.body) : init.body);
        }
        return Promise.resolve({});
      }),
      formData: jest.fn().mockResolvedValue(new FormData()),
      text: jest.fn().mockResolvedValue(init.body || ''),
      blob: jest.fn().mockResolvedValue(new Blob()),
      arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(0)),
      cookies: {
        get: jest.fn(),
        set: jest.fn(),
        delete: jest.fn(),
      },
      geo: {},
      ip: '127.0.0.1',
      signal: new AbortController().signal,
    };
  }),
  NextResponse: {
    json: jest.fn().mockImplementation((data, init = {}) => ({
      json: () => Promise.resolve(data),
      status: init.status || 200,
      ok: (init.status || 200) >= 200 && (init.status || 200) < 300,
      headers: new Map(Object.entries(init.headers || {})),
      text: () => Promise.resolve(JSON.stringify(data)),
    })),
    redirect: jest.fn().mockImplementation((url, status = 307) => ({
      status,
      headers: new Map([['Location', url]]),
    })),
    rewrite: jest.fn().mockImplementation((url) => ({
      headers: new Map([['x-middleware-rewrite', url]]),
    })),
    next: jest.fn().mockImplementation(() => ({})),
  },
}));

// 標準 Web API のモック（NextRequest との競合を避けるため条件付き）
if (!global.Headers) {
  global.Headers = class Headers {
    constructor(init) {
      this._headers = {};
      if (init) {
        for (const [key, value] of Object.entries(init)) {
          this._headers[key.toLowerCase()] = value;
        }
      }
    }

    get(name) {
      return this._headers[name.toLowerCase()] || null;
    }

    set(name, value) {
      this._headers[name.toLowerCase()] = value;
    }

    has(name) {
      return this._headers[name.toLowerCase()] !== undefined;
    }

    entries() {
      return Object.entries(this._headers);
    }
  };
}

// コンソール警告の抑制（テスト実行時）
const originalError = console.error;
const originalWarn = console.warn;

beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Warning: ReactDOM.render is deprecated') ||
        args[0].includes('Warning: validateDOMNesting') ||
        args[0].includes('Invalid prop `className` supplied to `React.Fragment`') ||
        args[0].includes('React.Fragment can only have `key` and `children` props'))
    ) {
      return;
    }
    originalError.call(console, ...args);
  };

  console.warn = (...args) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('componentWillReceiveProps has been renamed')
    ) {
      return;
    }
    originalWarn.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});

// 各テスト後のクリーンアップ
afterEach(() => {
  jest.clearAllMocks();
  if (global.fetch && global.fetch.mockClear) {
    global.fetch.mockClear();
  }
});
