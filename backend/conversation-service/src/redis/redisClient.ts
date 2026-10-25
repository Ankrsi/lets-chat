import { createClient } from "redis";

const reconnectStrategyFun = (retries: any) => {
  if (retries >= 20) {
    return new Error(`Redis: stopped reconnecting after ${retries} retries`);
  }
  return Math.min(retries * 50, 2000);
}

export const redisSubscriber = createClient({
  url: process.env.REDIS_URL,
  socket: {
    reconnectStrategy: reconnectStrategyFun,
  },
});

redisSubscriber.on("ready", () => {
  console.info("Redis Subscriber is ready");
});

redisSubscriber.on("error", (err) => {
  console.info("Redis Subscriber error:", err.message);
});

export const redisPublisher = createClient({
  url: process.env.REDIS_URL,
  socket: {
    reconnectStrategy: reconnectStrategyFun,
  },
});

redisPublisher.on("ready", () => {
  console.info("Redis Publisher is ready");
});

redisPublisher.on("error", (err) => {
  console.info("Redis Publisher error:", err.message);
});

export const redisClient = createClient({
  url: process.env.REDIS_URL,
  socket: {
    reconnectStrategy: reconnectStrategyFun,
  },
});

redisClient.on("ready", () => {
  console.info("Redis Client is ready");
});

redisClient.on("error", (err) => {
  console.info("Redis Client error:", err.message);
});

// Handle connection errors
[redisSubscriber, redisPublisher, redisClient].forEach((client, index) => {
  client.on("error", (err: unknown) => console.error(`Redis Client ${index + 1} Error:`, err));
});

export const connectRedis = async () => {
  await Promise.all([redisSubscriber.connect(), redisPublisher.connect(), redisClient.connect()]);

  console.info("Redis clients connected");
};

/** GET for several keys, pipelined. Unlike MGET it also works when the keys live on different Redis Cluster nodes. */
export const getMany = (client: { get: (key: string) => Promise<string | null> }, keys: string[]): Promise<(string | null)[]> =>
  Promise.all(keys.map((k) => client.get(k)));
