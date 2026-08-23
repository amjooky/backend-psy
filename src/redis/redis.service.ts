import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = process.env.REDIS_URL || this.configService.get<string>('redis.url');
    const host = this.configService.get<string>('redis.host') || 'localhost';
    const port = this.configService.get<number>('redis.port') || 6379;
    const password = this.configService.get<string>('redis.password');
    const db = this.configService.get<number>('redis.db') || 0;
    const tls = this.configService.get<boolean>('redis.tls') || false;

    let hasLoggedError = false;

    if (redisUrl) {
      this.client = new Redis(redisUrl, {
        lazyConnect: true,
        enableReadyCheck: true,
        maxRetriesPerRequest: 1,
        retryStrategy(times) {
          if (times > 3) return null;
          return Math.min(times * 200, 2000);
        },
      });
    } else {
      this.client = new Redis({
        host,
        port,
        password: password || undefined,
        db,
        tls: tls ? {} : undefined,
        lazyConnect: true,
        enableReadyCheck: true,
        maxRetriesPerRequest: 1,
        retryStrategy(times) {
          if (times > 3) return null;
          return Math.min(times * 200, 2000);
        },
      });
    }

    this.client.on('connect', () => {
      this.isConnected = true;
      hasLoggedError = false;
      this.logger.log('Redis connected');
    });
    this.client.on('ready', () => {
      this.isConnected = true;
      this.logger.log('Redis ready');
    });
    this.client.on('error', (err) => {
      this.isConnected = false;
      if (!hasLoggedError) {
        this.logger.warn(`Redis unavailable (${err.message}). Application running with in-memory fallback.`);
        hasLoggedError = true;
      }
    });
    this.client.on('close', () => {
      this.isConnected = false;
    });

    // Attempt gentle connect without blocking startup
    this.client.connect().catch(() => {});
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
    } catch {}
  }

  getClient(): Redis {
    return this.client;
  }

  // ─── Key-Value Operations ───────────────────────────

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (err) {
      // Safe fallback when Redis is offline
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (err) {
      return null;
    }
  }

  async del(key: string | string[]): Promise<number> {
    try {
      if (Array.isArray(key)) {
        if (key.length === 0) return 0;
        return await this.client.del(...key);
      }
      return await this.client.del(key);
    } catch (err) {
      return 0;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (err) {
      return false;
    }
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    try {
      await this.client.expire(key, ttlSeconds);
    } catch (err) {}
  }

  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch (err) {
      return -1;
    }
  }

  // ─── JSON Operations ─────────────────────────────────

  async setJson<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlSeconds);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  // ─── Hash Operations ─────────────────────────────────

  async hset(key: string, field: string, value: string): Promise<void> {
    try {
      await this.client.hset(key, field, value);
    } catch (err) {}
  }

  async hget(key: string, field: string): Promise<string | null> {
    try {
      return await this.client.hget(key, field);
    } catch (err) {
      return null;
    }
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    try {
      return await this.client.hgetall(key);
    } catch (err) {
      return {};
    }
  }

  async hdel(key: string, field: string): Promise<number> {
    try {
      return await this.client.hdel(key, field);
    } catch (err) {
      return 0;
    }
  }

  // ─── Set Operations ──────────────────────────────────

  async sadd(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.client.sadd(key, ...members);
    } catch (err) {
      return 0;
    }
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.client.srem(key, ...members);
    } catch (err) {
      return 0;
    }
  }

  async sismember(key: string, member: string): Promise<boolean> {
    try {
      return (await this.client.sismember(key, member)) === 1;
    } catch (err) {
      return false;
    }
  }

  async smembers(key: string): Promise<string[]> {
    try {
      return await this.client.smembers(key);
    } catch (err) {
      return [];
    }
  }

  // ─── Increment ───────────────────────────────────────

  async incr(key: string): Promise<number> {
    try {
      return await this.client.incr(key);
    } catch (err) {
      return 1;
    }
  }

  async incrby(key: string, increment: number): Promise<number> {
    try {
      return await this.client.incrby(key, increment);
    } catch (err) {
      return increment;
    }
  }

  // ─── Pattern Operations ──────────────────────────────

  async keys(pattern: string): Promise<string[]> {
    try {
      return await this.client.keys(pattern);
    } catch (err) {
      return [];
    }
  }

  async deletePattern(pattern: string): Promise<void> {
    try {
      const keys = await this.keys(pattern);
      if (keys.length > 0) {
        await this.del(keys);
      }
    } catch (err) {
      // Safe pass when Redis is offline
    }
  }

  // ─── Health ──────────────────────────────────────────

  async isHealthy(): Promise<boolean> {
    try {
      const pong = await this.client.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }
}
