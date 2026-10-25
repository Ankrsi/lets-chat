import { kafka, TOPICS } from "./kafkaClient";
import { getMany, redisPublisher } from "../redis/redisClient";
import { sendChatFCMNotification } from "../services/chatFcm.service";
import { sendBasicFCMNotification } from "../services/chatBasicFcm.service";
import { groupKeysNotification } from "../services/groupKeysFcm.service";

const OFFLINE_TTL = 60 * 60 * 24 * 7; // queued events are kept for 7 days

// Delivery kind → the `type` the app gets when it fetches its offline queue
const OFFLINE_TYPES: Record<string, string> = {
  "offline-chat-messages": "chatMessage",
  "offline-delete-messages": "chatDeleteMessages",
  "offline-edit-message": "chatEditMessage",
  "offline-chat-messages-status": "chatMessageStatus",
  "offline-update-disappearing-messages": "updateDisappearingMessages",
  "offline-disappearing-messages": "disappearingMessages",
  "offline-destructing-messages": "destructingMessages",
  "offline-one-view": "chatOneView",
  "offline-audio-video-call-status": "audioVideoStatusUpdate",
  "offline-group-key-chat": "groupKeyChat",
  "offline-resend-request": "resendRequest",
  "offline-chat-msg-reaction": "chatMsgReaction",
};

const CALL_TYPES = ["audio_call", "video_call", "group_audio_call", "group_video_call"];

/** Adds an event to the member's offline queue (one round trip) */
const enqueue = (member: string, type: string, data: any) => {
  const key = `offline:messages:${member}`;
  return redisPublisher.multi()
    .lPush(key, JSON.stringify({ type, data }))
    .expire(key, OFFLINE_TTL)
    .exec();
};

export const consumeChatMessages = async () => {
  const consumer = kafka.consumer({
    groupId: "chat-group",
    retry: { retries: 10, initialRetryTime: 300 },
  });

  await consumer.connect();
  await consumer.subscribe({ topic: TOPICS.offline, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      let topic = "";
      try {
        if (!message.value) return;
        const payload = JSON.parse(message.value.toString());
        // Every delivery shares one topic; `kind` says which one it is
        topic = payload.kind;
        delete payload.kind;

        if (topic == "send-screenshot-notify") {
          await sendBasicFCMNotification(payload.otherPhone, {
            senderId: payload.myPhone,
            title: "Screenshot Detected",
            content: `Attention: ${payload.myPhone} saved your status using a screenshot.`,
            type: "chat_screenshot",
          });
          return;
        }

        const type = OFFLINE_TYPES[topic];
        const member = payload.member;
        delete payload.member;
        if (!type || !member) return;

        // Online state and open chat, fetched together
        const [online, activeRoom] = await getMany(redisPublisher, [`user:${member}:online`, `lastChatRoom:${member}`]);
        const offline = online === null || online == "0";
        if (offline) await enqueue(member, type, payload);

        if (topic == "offline-chat-messages") {
          // Push unless they're looking at this chat right now (calls have their own notifications)
          const inactive = offline || activeRoom !== payload.conversationId;
          if (inactive && !CALL_TYPES.includes(payload.messageType)) await sendChatFCMNotification(member, payload);
        } else if (topic == "offline-group-key-chat" && offline) {
          await groupKeysNotification(member, payload);
        } else if (topic == "offline-chat-msg-reaction") {
          await sendBasicFCMNotification(member, {
            senderId: payload.from,
            title: "Message Reaction",
            content: `${payload.from} reacted to your message with ${payload.emoji}`,
            type: "chat_msg_reaction",
            extraData: {
              messageId: payload.messageId,
              conversationId: payload.conversationId,
              emoji: payload.emoji,
              type: payload.type,
            },
          });
        }
      } catch (err) {
        console.error(`Error processing Kafka message (${topic}):`, err);
      }
    },
  });
};
