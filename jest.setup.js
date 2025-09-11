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

// Next.js Navigation のモック
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      refresh: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      prefetch: jest.fn(),
    };
  },
  useSearchParams() {
    return new URLSearchParams();
  },
  usePathname() {
    return '/';
  },
}));

// TanStack Query のモック設定
jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
  useMutation: jest.fn(),
  useQueryClient: jest.fn(),
  QueryClient: jest.fn().mockImplementation(() => ({
    invalidateQueries: jest.fn(),
    setQueryData: jest.fn(),
    getQueryData: jest.fn(),
  })),
  QueryClientProvider: ({ children }) => children,
}));

// NextAuth.js のモック
jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({
    data: null,
    status: 'unauthenticated',
  })),
  signIn: jest.fn(),
  signOut: jest.fn(),
  getSession: jest.fn(() => Promise.resolve(null)),
  SessionProvider: ({ children }) => children,
}));

// Next.js Server API モック
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
    };
  }),
  NextResponse: {
    json: jest.fn().mockImplementation((data, init = {}) => ({
      status: init.status || 200,
      headers: new Map(Object.entries(init.headers || {})),
      json: jest.fn().mockResolvedValue(data),
    })),
  },
}));

// Console エラーメッセージのフィルタリング
const originalError = console.error;

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
});

afterAll(() => {
  console.error = originalError;
});

// 各テスト実行前のクリーンアップ
beforeEach(() => {
  jest.clearAllMocks();

  // fetch のデフォルト実装をリセット
  global.fetch.mockClear();

  // localStorage のモック (jsdom環境でのみ)
  if (typeof window !== 'undefined') {
    const localStorageMock = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn(),
    };
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });

    // sessionStorage のモック
    const sessionStorageMock = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn(),
    };
    Object.defineProperty(window, 'sessionStorage', {
      value: sessionStorageMock,
      writable: true,
    });
  }
});

// 各テスト実行後のクリーンアップ
afterEach(() => {
  jest.restoreAllMocks();
});

// テスト用のユーティリティ関数
global.testUtils = {
  // モックサーバーデータ
  mockServer: {
    id: 'test-server-1',
    name: 'test-server',
    image: 'node:latest',
    port: 3000,
    status: 'stopped',
    createdAt: '2024-01-01T00:00:00Z',
  },

  // モックユーザーデータ
  mockUser: {
    id: 'test-user-1',
    email: 'test@example.com',
    name: 'Test User',
    role: 'admin',
  },

  // API レスポンスのモック生成
  createMockApiResponse: (data, success = true) => ({
    success,
    data: success ? data : undefined,
    error: success ? undefined : data,
    meta: {
      version: 'v1',
      requestId: 'test-request-id',
      timestamp: '2024-01-01T00:00:00Z',
    },
  }),
};

// Intersection Observer のモック
global.IntersectionObserver = class IntersectionObserver {
  constructor() { }
  observe() {
    return null;
  }
  disconnect() {
    return null;
  }
  unobserve() {
    return null;
  }
};

// ResizeObserver のモック
global.ResizeObserver = class ResizeObserver {
  constructor() { }
  observe() {
    return null;
  }
  disconnect() {
    return null;
  }
  unobserve() {
    return null;
  }
};

// Web Crypto API のモック (jsdom環境でのみ)
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'crypto', {
    value: {
      getRandomValues: jest.fn((arr) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.floor(Math.random() * 256);
        }
        return arr;
      }),
      subtle: {
        encrypt: jest.fn(),
        decrypt: jest.fn(),
        generateKey: jest.fn(),
        importKey: jest.fn(),
        exportKey: jest.fn(),
      },
    },
    writable: true,
  });
}

// Web Workers のモック
class MockWorker {
  constructor(stringUrl) {
    this.url = stringUrl;
    this.onmessage = () => { };
    this.onerror = () => { };
  }

  postMessage(msg) {
    // モック実装
  }

  terminate() {
    // モック実装
  }
}

if (typeof global !== 'undefined') {
  global.Worker = MockWorker;
}

// WebSocket のモック
if (typeof global !== 'undefined') {
  global.WebSocket = class WebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = WebSocket.CONNECTING;
      setTimeout(() => {
        this.readyState = WebSocket.OPEN;
        if (this.onopen) this.onopen();
      }, 100);
    }

    send(data) {
      // モック実装
    }

    close() {
      this.readyState = WebSocket.CLOSED;
      if (this.onclose) this.onclose();
    }

    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
  };
}

// HTMLCanvasElement のモック (jsdom環境でのみ)
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
    fillRect: jest.fn(),
    clearRect: jest.fn(),
    getImageData: jest.fn(() => ({
      data: new Array(4),
    })),
    putImageData: jest.fn(),
    createImageData: jest.fn(() => []),
    setTransform: jest.fn(),
    drawImage: jest.fn(),
    save: jest.fn(),
    fillText: jest.fn(),
    restore: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    closePath: jest.fn(),
    stroke: jest.fn(),
    translate: jest.fn(),
    scale: jest.fn(),
    rotate: jest.fn(),
    arc: jest.fn(),
    fill: jest.fn(),
    measureText: jest.fn(() => ({ width: 10 })),
    transform: jest.fn(),
    rect: jest.fn(),
    clip: jest.fn(),
  }));

  // HTMLCanvasElement.prototype.toDataURL のモック
  HTMLCanvasElement.prototype.toDataURL = jest.fn(() => 'data:image/png;base64,test');
}

// テスト実行時のタイムゾーン設定
process.env.TZ = 'Asia/Tokyo';

// 未処理のPromise拒否の警告を抑制
process.on('unhandledRejection', (reason, promise) => {
  console.warn('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Jest の拡張設定
expect.extend({
  toBeValidDate(received) {
    const pass = received instanceof Date && !isNaN(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid date`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid date`,
        pass: false,
      };
    }
  },
});
