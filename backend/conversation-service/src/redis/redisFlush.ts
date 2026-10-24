import { redisClient } from "./redisClient";

const flush = async () => {
  await redisClient.connect();

  const dbSizeBefore = await redisClient.dbSize();
  console.info("🔢 Keys before flush:", dbSizeBefore);

  await redisClient.flushDb(); // or flushAll()

  const dbSizeAfter = await redisClient.dbSize();
  console.info("✅ Redis DB flushed.");
  console.info("🔢 Keys after flush:", dbSizeAfter);

  await redisClient.disconnect();
};

flush().catch((err) => {
  console.error("❌ Error flushing Redis:", err);
  process.exit(1);
});
