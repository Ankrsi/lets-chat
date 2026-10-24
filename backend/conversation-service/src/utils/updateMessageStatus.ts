import { redisClient } from "../redis/redisClient";

export const updateSingleMessageInRedis = async (
  messageId: string,
  chatId: string,
  status: string,
) => {
  const redisKey = `chat:${chatId}`;
  const messages = await redisClient.lRange(redisKey, 0, -1);
  for (let i = 0; i < messages.length; i++) {
    const msg = JSON.parse(messages[i]);
    if (msg.messageId === messageId) {
      if (msg.status !== "read") {
        msg.status = status;
        await redisClient.lSet(redisKey, i, JSON.stringify(msg));
      }
      break;
    }
  }
};

export async function updateBulkMessagesInRedis(chatId: string, status: string) {
  const redisKey = `chat:${chatId}`;
  const messagesJson = await redisClient.lRange(redisKey, 0, -1);
  if (!messagesJson.length) return;

  const updatedMessages = messagesJson.map((msgStr) => {
    const msg = JSON.parse(msgStr);
    if (msg.status !== "read") {
      msg.status = status;
    }
    return msg;
  });

  const pipeline = redisClient.multi();
  pipeline.del(redisKey);
  pipeline.rPush(
    redisKey,
    updatedMessages.map((m) => JSON.stringify(m)),
  );
  await pipeline.exec();
}
