/**
 * 共通ユーティリティ型定義
 * アプリケーション全体で使用される汎用的な型
 */

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Make all properties optional recursively
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Make all properties required recursively
 */
export type DeepRequired<T> = {
  [P in keyof T]-?: T[P] extends object ? DeepRequired<T[P]> : T[P];
};

/**
 * Extract keys of T where value is of type U
 */
export type KeysOfType<T, U> = {
  [K in keyof T]: T[K] extends U ? K : never;
}[keyof T];

/**
 * Make specific properties optional
 */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Make specific properties required
 */
export type RequiredBy<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Nullable type
 */
export type Nullable<T> = T | null;

/**
 * Maybe type
 */
export type Maybe<T> = T | null | undefined;

/**
 * Non-nullable type
 */
export type NonNullable<T> = T extends null | undefined ? never : T;

/**
 * Function type
 */
export type Func<T extends readonly unknown[] = readonly unknown[], R = unknown> = (...args: T) => R;

/**
 * Async function type
 */
export type AsyncFunc<T extends readonly unknown[] = readonly unknown[], R = unknown> = (...args: T) => Promise<R>;

/**
 * Constructor type
 */
export type Constructor<T = object> = new (...args: unknown[]) => T;

/**
 * Abstract constructor type
 */
export type AbstractConstructor<T = object> = abstract new (...args: unknown[]) => T;

/**
 * Mixin type
 */
export type Mixin<T extends Constructor = Constructor> = <U extends Constructor>(Base: U) => T & U;

// ============================================================================
// State Management Types
// ============================================================================

/**
 * Loading state
 */
export type LoadingState = 'idle' | 'loading' | 'succeeded' | 'failed';

/**
 * Async state
 */
export interface AsyncState<T = unknown, E = Error> {
  data?: T;
  error?: E;
  loading: boolean;
  status: LoadingState;
}

/**
 * Action type for state management
 */
export interface Action<T = string, P = unknown> {
  type: T;
  payload?: P;
  meta?: Record<string, unknown>;
  error?: boolean;
}

/**
 * Reducer type
 */
export type Reducer<S, A> = (state: S, action: A) => S;

// ============================================================================
// Event Types
// ============================================================================

/**
 * Event listener function
 */
export type EventListener<T = unknown> = (event: T) => void;

/**
 * Event emitter interface
 */
export interface EventEmitter<T = Record<string, unknown>> {
  on<K extends keyof T>(event: K, listener: EventListener<T[K]>): void;
  off<K extends keyof T>(event: K, listener: EventListener<T[K]>): void;
  emit<K extends keyof T>(event: K, data: T[K]): void;
}

/**
 * Disposable interface
 */
export interface Disposable {
  dispose(): void;
}

// ============================================================================
// Time and Date Types
// ============================================================================

/**
 * Timestamp type (Unix timestamp in milliseconds)
 */
export type Timestamp = number;

/**
 * ISO Date string
 */
export type ISODate = string;

/**
 * Duration in milliseconds
 */
export type Duration = number;

/**
 * Time interval
 */
export interface TimeInterval {
  start: ISODate;
  end: ISODate;
}

/**
 * Time range
 */
export interface TimeRange {
  from?: ISODate;
  to?: ISODate;
}

// ============================================================================
// Collection Types
// ============================================================================

/**
 * Dictionary/Map type
 */
export type Dictionary<T = unknown> = Record<string, T>;

/**
 * Readonly dictionary
 */
export type ReadonlyDictionary<T = unknown> = Readonly<Dictionary<T>>;

/**
 * Tuple type
 */
export type Tuple<T, N extends number> = T[] & { length: N };

/**
 * Fixed length array
 */
export type FixedLengthArray<T, L extends number> = T[] & { length: L };

/**
 * Non-empty array
 */
export type NonEmptyArray<T> = [T, ...T[]];

// ============================================================================
// Result Types (for error handling)
// ============================================================================

/**
 * Success result
 */
export interface Success<T> {
  success: true;
  data: T;
}

/**
 * Failure result
 */
export interface Failure<E = Error> {
  success: false;
  error: E;
}

/**
 * Result type (union of Success and Failure)
 */
export type Result<T, E = Error> = Success<T> | Failure<E>;

/**
 * Option type
 */
export type Option<T> = T | null;

/**
 * Either type
 */
export type Either<L, R> = { left: L } | { right: R };

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Validation rule
 */
export interface ValidationRule<T = unknown> {
  validate: (value: T) => boolean;
  message: string;
}

/**
 * Validation schema
 */
export type ValidationSchema<T> = {
  [K in keyof T]?: ValidationRule<T[K]>[];
};

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validation error
 */
export interface ValidationError {
  field: string;
  message: string;
  code?: string;
  value?: unknown;
}

/**
 * Validator function
 */
export type Validator<T> = (value: T) => ValidationResult;

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration schema
 */
export interface ConfigSchema<T = unknown> {
  key: string;
  default_value: T;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  required?: boolean;
  validation?: ValidationRule<T>[];
}

/**
 * Configuration value
 */
export interface ConfigValue<T = unknown> {
  value: T;
  source: 'default' | 'env' | 'file' | 'runtime';
  override?: boolean;
}

/**
 * Configuration store
 */
export interface ConfigStore {
  get<T = unknown>(key: string): T | undefined;
  set<T = unknown>(key: string, value: T): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  keys(): string[];
  values(): unknown[];
  entries(): Array<[string, unknown]>;
}

// ============================================================================
// Plugin/Extension Types
// ============================================================================

/**
 * Plugin metadata
 */
export interface PluginMetadata {
  name: string;
  version: string;
  description: string;
  author: string;
  dependencies?: string[];
  permissions?: string[];
}

/**
 * Plugin interface
 */
export interface Plugin {
  metadata: PluginMetadata;
  initialize(): Promise<void>;
  activate(): Promise<void>;
  deactivate(): Promise<void>;
  dispose(): Promise<void>;
}

/**
 * Hook function
 */
export type Hook<T extends readonly unknown[] = readonly unknown[], R = unknown> = (...args: T) => R | Promise<R>;

/**
 * Hook registry
 */
export interface HookRegistry {
  register<T extends readonly unknown[], R>(name: string, hook: Hook<T, R>): void;
  unregister(name: string, hook: Hook): void;
  execute<T extends readonly unknown[], R>(name: string, ...args: T): Promise<R[]>;
}

// ============================================================================
// Cache Types
// ============================================================================

/**
 * Cache entry
 */
export interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  expires_at?: Timestamp;
  created_at: Timestamp;
  accessed_at: Timestamp;
  hit_count: number;
}

/**
 * Cache options
 */
export interface CacheOptions {
  ttl?: Duration;
  max_size?: number;
  max_age?: Duration;
}

/**
 * Cache interface
 */
export interface Cache<T = unknown> {
  get(key: string): T | undefined;
  set(key: string, value: T, options?: CacheOptions): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  size(): number;
  keys(): string[];
  values(): T[];
  entries(): Array<[string, T]>;
}

// ============================================================================
// Logger Types
// ============================================================================

/**
 * Log level
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Log entry
 */
export interface LogEntry {
  timestamp: ISODate;
  level: LogLevel;
  message: string;
  data?: Record<string, unknown>;
  error?: Error;
  context?: {
    service?: string;
    module?: string;
    function?: string;
    request_id?: string;
    user_id?: string;
  };
}

/**
 * Logger interface
 */
export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: Error, data?: Record<string, unknown>): void;
  fatal(message: string, error?: Error, data?: Record<string, unknown>): void;
}

// ============================================================================
// Type Helpers
// ============================================================================

/**
 * Create a type that represents the return type of a Promise
 */
export type Awaited<T> = T extends PromiseLike<infer U> ? U : T;

/**
 * Create a type from object values
 */
export type ValueOf<T> = T[keyof T];

/**
 * Create a union type from object keys
 */
export type KeyOf<T> = keyof T;

/**
 * Create a type that excludes never types
 */
export type ExcludeNever<T> = Pick<T, { [K in keyof T]: T[K] extends never ? never : K }[keyof T]>;

/**
 * Create a type that requires at least one property
 */
export type AtLeastOne<T> = {
  [K in keyof T]: Pick<T, K> & Partial<Pick<T, Exclude<keyof T, K>>>;
}[keyof T];

/**
 * Create a type that allows exactly one property
 */
export type ExactlyOne<T> = {
  [K in keyof T]: Pick<T, K> & Partial<Record<Exclude<keyof T, K>, never>>;
}[keyof T];

/**
 * Create a branded type for type safety
 */
export type Brand<T, B> = T & { __brand: B };

/**
 * Remove brand from branded type
 */
export type Unbrand<T> = T extends Brand<infer U, unknown> ? U : T;

/**
 * Create a type that represents nested object paths
 */
export type DeepKeyOf<T> = T extends object
  ? {
      [K in keyof T]: K extends string
        ? T[K] extends object
          ? `${K}` | `${K}.${DeepKeyOf<T[K]>}`
          : `${K}`
        : never;
    }[keyof T]
  : never;

/**
 * Get the type of a nested property
 */
export type DeepValue<T, K extends DeepKeyOf<T>> = K extends `${infer P}.${infer Rest}`
  ? P extends keyof T
    ? Rest extends DeepKeyOf<T[P]>
      ? DeepValue<T[P], Rest>
      : never
    : never
  : K extends keyof T
  ? T[K]
  : never;