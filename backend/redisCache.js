const { Redis } = require('@upstash/redis');

let redisClient = null;
const memoryCache = new Map(); // In-Memory fallback cache
const DEFAULT_TTL_SEC = 30;

function getRedisClient() {
  if (redisClient) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    try {
      redisClient = new Redis({ url, token });
      console.log("Upstash Redis Client initialized successfully for global edge caching.");
    } catch (err) {
      console.warn("Failed to initialize Upstash Redis:", err.message);
    }
  }
  return redisClient;
}

async function getCache(key) {
  const client = getRedisClient();
  if (client) {
    try {
      const data = await client.get(key);
      if (data) return typeof data === 'string' ? JSON.parse(data) : data;
    } catch (err) {
      console.warn(`Upstash Redis get error (${key}):`, err.message);
    }
  }

  // Memory fallback
  const cached = memoryCache.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return cached.data;
}

async function setCache(key, value, ttlSeconds = DEFAULT_TTL_SEC) {
  const client = getRedisClient();
  if (client) {
    try {
      await client.set(key, JSON.stringify(value), { ex: ttlSeconds });
    } catch (err) {
      console.warn(`Upstash Redis set error (${key}):`, err.message);
    }
  }

  // Memory fallback
  memoryCache.set(key, { data: value, expiresAt: Date.now() + (ttlSeconds * 1000) });
}

async function invalidateCache(prefix = '') {
  const client = getRedisClient();
  if (client) {
    try {
      if (!prefix) {
        await client.flushdb();
      } else {
        const keys = await client.keys(`${prefix}*`);
        if (keys && keys.length > 0) {
          await client.del(...keys);
        }
      }
    } catch (err) {
      console.warn("Upstash Redis invalidate error:", err.message);
    }
  }

  // Memory fallback
  if (!prefix) {
    memoryCache.clear();
  } else {
    for (const k of memoryCache.keys()) {
      if (k.startsWith(prefix)) {
        memoryCache.delete(k);
      }
    }
  }
}

module.exports = {
  getCache,
  setCache,
  invalidateCache,
};
