declare module 'ioredis' {
  export interface RedisOptions {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
    retryDelayOnFailover?: number;
    enableOfflineQueue?: boolean;
    lazyConnect?: boolean;
    maxRetriesPerRequest?: number;
    retryDelayOnClusterDown?: number;
    enableReadyCheck?: boolean;
    maxRetriesPerRequest?: number;
    connectTimeout?: number;
    commandTimeout?: number;
    family?: number;
    keepAlive?: number;
    noDelay?: boolean;
  }

  export default class Redis {
    constructor(options?: RedisOptions);
    constructor(port?: number, host?: string, options?: RedisOptions);
    constructor(url?: string, options?: RedisOptions);

    get(key: string): Promise<string | null>;
    set(key: string, value: string, ...args: any[]): Promise<string>;
    setex(key: string, seconds: number, value: string): Promise<string>;
    del(...keys: string[]): Promise<number>;
    exists(...keys: string[]): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
    ttl(key: string): Promise<number>;
    keys(pattern: string): Promise<string[]>;
    scan(cursor: number, ...args: any[]): Promise<[string, string[]]>;

    hget(key: string, field: string): Promise<string | null>;
    hset(key: string, field: string, value: string): Promise<number>;
    hgetall(key: string): Promise<Record<string, string>>;
    hdel(key: string, ...fields: string[]): Promise<number>;

    lpush(key: string, ...values: string[]): Promise<number>;
    rpush(key: string, ...values: string[]): Promise<number>;
    lpop(key: string): Promise<string | null>;
    rpop(key: string): Promise<string | null>;
    llen(key: string): Promise<number>;
    lrange(key: string, start: number, stop: number): Promise<string[]>;

    sadd(key: string, ...members: string[]): Promise<number>;
    smembers(key: string): Promise<string[]>;
    srem(key: string, ...members: string[]): Promise<number>;
    scard(key: string): Promise<number>;

    zadd(key: string, ...args: any[]): Promise<number>;
    zrange(key: string, start: number, stop: number, ...args: any[]): Promise<string[]>;
    zrem(key: string, ...members: string[]): Promise<number>;
    zcard(key: string): Promise<number>;

    incr(key: string): Promise<number>;
    decr(key: string): Promise<number>;
    incrby(key: string, increment: number): Promise<number>;
    decrby(key: string, decrement: number): Promise<number>;

    ping(): Promise<string>;
    flushall(): Promise<string>;
    flushdb(): Promise<string>;

    multi(): any;
    pipeline(): any;

    disconnect(): void;
    quit(): Promise<string>;

    on(event: string, listener: (...args: any[]) => void): this;
    once(event: string, listener: (...args: any[]) => void): this;
    off(event: string, listener: (...args: any[]) => void): this;
    removeListener(event: string, listener: (...args: any[]) => void): this;
    removeAllListeners(event?: string): this;
  }
}