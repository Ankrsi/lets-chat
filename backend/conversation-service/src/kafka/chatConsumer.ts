import { kafka } from "./kafkaClient";
import { redisPublisher } from "../redis/redisClient";
import { sendChatFCMNotification } from "../services/chatFcm.service";
import TaxiConversation from "../models/chatModal/taxiConversation.model";
import TaxiChatMessage from "../models/chatModal/taxiChats.model";
import { sendBasicFCMNotification } from "../services/chatBasicFcm.service";
import BotChatMessage from "../models/chatModal/botChats.model";
import { groupKeysNotification } from "../services/groupKeysFcm.service";

export const consumeChatMessages = async () => {
  const consumer = kafka.consumer({
    groupId: "chat-group",
    retry: { retries: 10, initialRetryTime: 300 },
  });

  await consumer.connect();
  await consumer.subscribe({ topic: "taxi-chat-messages", fromBeginning: false });
  await consumer.subscribe({ topic: "bot-chat-messages", fromBeginning: false });
  await consumer.subscribe({ topic: "send-screenshot-notify", fromBeginning: false });
  await consumer.subscribe({ topic: "offline-chat-msg-reaction", fromBeginning: false });
  await consumer.subscribe({ topic: "offline-chat-messages", fromBeginning: false });
  await consumer.subscribe({ topic: "offline-one-view", fromBeginning: false });
  await consumer.subscribe({ topic: "offline-delete-messages", fromBeginning: false });
  await consumer.subscribe({ topic: "offline-edit-message", fromBeginning: false });
  await consumer.subscribe({ topic: "offline-taxi-chat-messages", fromBeginning: false });
  await consumer.subscribe({ topic: "offline-chat-messages-status", fromBeginning: false });
  await consumer.subscribe({ topic: "offline-audio-video-call-status", fromBeginning: false });
  await consumer.subscribe({ topic: "offline-disappearing-messages", fromBeginning: false });
  await consumer.subscribe({ topic: "offline-destructing-messages", fromBeginning: false });
  await consumer.subscribe({ topic: "offline-update-disappearing-messages", fromBeginning: false });
  await consumer.subscribe({ topic: "offline-group-key-chat", fromBeginning: false });
  await consumer.subscribe({ topic: "offline-resend-request", fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      try {
        if (topic == "taxi-chat-messages") {
          try {
            if (!message.value) {
              throw new Error("Kafka message value is null");
            }
            const payload = JSON.parse(message.value.toString());
            const { messageId, bookingId, senderId, content, status, timestamp, messageType } =
              payload;

            // 1) Save to Mongo
            await TaxiChatMessage.create({
              messageId,
              bookingId,
              senderId,
              content,
              status,
              timestamp,
              messageType,
            });
            await TaxiConversation.findOneAndUpdate({ bookingId }, {
              $set: {
                updatedAt: new Date(),
                lastMessageId: messageId,
                lastMessage: messageType == "text" ? content?.msg?.slice(0, 100) : messageType,
                lastMessageStatus: status,
                lastMessageType: messageType,
                lastMessageSenderId: senderId,
              },
            });
          } catch (err) {
            console.error("Kafka consumer error:", err);
          }
        }
        else if (topic == "bot-chat-messages") {
          try {
            if (!message.value) {
              throw new Error("Kafka message value is null");
            }
            const payload = JSON.parse(message.value.toString());
            const { messageId, convId, senderId, content, status, timestamp, messageType } =
              payload;

            // 1) Save to Mongo
            await BotChatMessage.create({
              messageId,
              convId,
              senderId,
              content,
              status,
              timestamp,
              messageType,
            });
          } catch (err) {
            console.error("Kafka consumer error:", err);
          }
        }
        else if (topic == "offline-delete-messages") {
          try {
            if (!message.value) {
              throw new Error("Kafka message value is null");
            }
            const payload = JSON.parse(message.value.toString());

            const tempMember = payload.member;
            delete payload.member;
            if (tempMember) {
              let dat = await redisPublisher.get(`user:${tempMember}:online`);
              if (dat == '0' || dat == null) {
                redisPublisher.lPush(`offline:messages:${tempMember}`, JSON.stringify({ type: "chatDeleteMessages", data: payload }));
                await redisPublisher.expire(`offline:messages:${tempMember}`, 60 * 60 * 24 * 7); // 7 days
              }
            }
          } catch (err) {
            console.error("deleteMessages error:", err);
          }
        }
        else if (topic == "send-screenshot-notify") {
          try {
            if (!message.value) {
              throw new Error("Kafka message value is null");
            }
            const payload = JSON.parse(message.value.toString());
            //// otherPhone, myPhone
            sendBasicFCMNotification(payload.otherPhone, {
              senderId: payload.myPhone,
              title: `Screenshot Detected`,
              content: `Attention: ${payload.myPhone} saved your status using a screenshot.`,
              type: "chat_screenshot"
            });
          } catch (err) {
            console.error("deleteMessages error:", err);
          }
        }
        else if (topic == "offline-edit-message") {
          try {
            if (!message.value) {
              throw new Error("Kafka message value is null");
            }
            const payload = JSON.parse(message.value.toString());

            const tempMember = payload.member;
            delete payload.member;
            if (tempMember) {
              let dat = await redisPublisher.get(`user:${tempMember}:online`);
              if (dat == '0' || dat == null) {
                redisPublisher.lPush(`offline:messages:${tempMember}`, JSON.stringify({ type: "chatEditMessage", data: payload }));
                await redisPublisher.expire(`offline:messages:${tempMember}`, 60 * 60 * 24 * 7); // 7 days
              }
            }
          } catch (err) {
            console.error("editMessage error:", err);
          }
        }
        else if (topic == "offline-chat-messages-status") {
          try {
            if (!message.value) {
              throw new Error("Kafka message value is null");
            }
            const payload = JSON.parse(message.value.toString());

            const tempMember = payload.member;
            delete payload.member;

            if (tempMember) {
              let dat = await redisPublisher.get(`user:${tempMember}:online`);
              if (dat == '0' || dat == null) {
                redisPublisher.lPush(`offline:messages:${tempMember}`, JSON.stringify({ type: "chatMessageStatus", data: payload }));
                await redisPublisher.expire(`offline:messages:${tempMember}`, 60 * 60 * 24 * 7); // 7 days
              }
            }
          } catch (err) {
            console.error("markasdelivered error:", err);
          }
        }
        else if (topic == "offline-update-disappearing-messages") {
          try {
            if (!message.value) {
              throw new Error("Kafka message value is null");
            }
            const payload = JSON.parse(message.value.toString());
            const tempMember = payload.member;
            delete payload.member;

            if (tempMember) {
              let dat = await redisPublisher.get(`user:${tempMember}:online`);
              if (dat == '0' || dat == null) {
                redisPublisher.lPush(`offline:messages:${tempMember}`, JSON.stringify({ type: "updateDisappearingMessages", data: payload }));
                await redisPublisher.expire(`offline:messages:${tempMember}`, 60 * 60 * 24 * 7); // 7 days
              }
            }
          } catch (err) {
            console.error("disappearing messages error:", err);
          }
        }
        else if (topic == "offline-disappearing-messages") {
          try {
            if (!message.value) {
              throw new Error("Kafka message value is null");
            }

            let payload = JSON.parse(message.value.toString());

            const tempMember = payload.member;
            delete payload.member;

            if (tempMember) {
              let dat = await redisPublisher.get(`user:${tempMember}:online`);
              if (dat == '0' || dat == null) {
                redisPublisher.lPush(`offline:messages:${tempMember}`, JSON.stringify({ type: "disappearingMessages", data: payload }));
                await redisPublisher.expire(`offline:messages:${tempMember}`, 60 * 60 * 24 * 7); // 7 days
              }
            }
          }
          catch (err) {
            console.error("disappearing messages error:", err);
          }
        }
        else if (topic == "offline-destructing-messages") {
          try {
            if (!message.value) {
              throw new Error("Kafka message value is null");
            }

            let payload = JSON.parse(message.value.toString());

            const tempMember = payload.member;
            delete payload.member;

            if (tempMember) {
              let dat = await redisPublisher.get(`user:${tempMember}:online`);
              if (dat == '0' || dat == null) {
                redisPublisher.lPush(`offline:messages:${tempMember}`, JSON.stringify({ type: "destructingMessages", data: payload }));
                await redisPublisher.expire(`offline:messages:${tempMember}`, 60 * 60 * 24 * 7); // 7 days
              }
            }
          }
          catch (err) {
            console.error("destructing messages error:", err);
          }
        }
        else if (topic == "offline-chat-messages") {
          try {
            if (!message.value) {
              throw new Error("Kafka message value is null");
            }

            let payload = JSON.parse(message.value.toString());
            // payload = JSON.parse(payload);

            const tempMember = payload.member;
            delete payload.member;
            // const convRes = await Conversation.findById(payload.conversationId).select("members -_id").lean();
            if (tempMember) {
              let dat = await redisPublisher.get(`user:${tempMember}:online`);
              let activeRoom = await redisPublisher.get(`lastChatRoom:${tempMember}`);
              if (dat === null || dat == "0") {
                redisPublisher.lPush(`offline:messages:${tempMember}`, JSON.stringify({ type: "chatMessage", data: payload }));
                await redisPublisher.expire(`offline:messages:${tempMember}`, 60 * 60 * 24 * 7); // 7 days
              }

              const isInactive = dat == null || dat === '0' || activeRoom !== payload.conversationId;
              const isCallMessage = ["audio_call", "video_call", "group_audio_call", "group_video_call"].includes(payload.messageType);
              console.info("isOnline >", dat, "activeRoom >", activeRoom, "isInactive >", isInactive, "isCallMessage >", isCallMessage);
              if (isInactive && !isCallMessage && payload.messageType != "money") {
                await sendChatFCMNotification(tempMember, payload);
              }
              else if (isInactive && !isCallMessage && payload.messageType == "money" && payload.senderId != tempMember) {
                await sendChatFCMNotification(tempMember, payload);
              }
            }
          } catch (err) {
            console.error("markasdelivered error:", err);
          }
        }
        else if (topic == "offline-one-view") {
          try {
            if (!message.value) {
              throw new Error("Kafka message value is null");
            }

            let payload = JSON.parse(message.value.toString());
            // payload = JSON.parse(payload);

            const tempMember = payload.member;
            delete payload.member;
            // const convRes = await Conversation.findById(payload.conversationId).select("members -_id").lean();
            if (tempMember) {
              let dat = await redisPublisher.get(`user:${tempMember}:online`);
              if (dat === null || dat == "0") {
                redisPublisher.lPush(`offline:messages:${tempMember}`, JSON.stringify({ type: "chatOneView", data: payload }));
                await redisPublisher.expire(`offline:messages:${tempMember}`, 60 * 60 * 24 * 7); // 7 days
              }
            }
          } catch (err) {
            console.error("chatOneView error:", err);
          }
        }
        else if (topic == "offline-audio-video-call-status") {
          try {
            if (!message.value) {
              throw new Error("Kafka message value is null");
            }

            let payload = JSON.parse(message.value.toString());

            const tempMember = payload.member;
            delete payload.member;

            if (tempMember) {
              let dat = await redisPublisher.get(`user:${tempMember}:online`);
              if (dat === null || dat == "0") {
                redisPublisher.lPush(`offline:messages:${tempMember}`, JSON.stringify({ type: "audioVideoStatusUpdate", data: payload }));
                await redisPublisher.expire(`offline:messages:${tempMember}`, 60 * 60 * 24 * 7); // 7 days
              }
            }
          } catch (err) {
            console.error("markasdelivered error:", err);
          }
        }
        else if (topic == "offline-group-key-chat") {
          try {
            if (!message.value) {
              throw new Error("Kafka message value is null");
            }

            let payload = JSON.parse(message.value.toString());

            const tempMember = payload.member;
            delete payload.member;

            if (tempMember) {
              let dat = await redisPublisher.get(`user:${tempMember}:online`);
              if (dat == null || dat == "0") {
                redisPublisher.lPush(`offline:messages:${tempMember}`, JSON.stringify({ type: "groupKeyChat", data: payload }));
                await redisPublisher.expire(`offline:messages:${tempMember}`, 60 * 60 * 24 * 7); // 7 days
                await groupKeysNotification(tempMember, payload);
              }
              // await groupKeysNotification(tempMember, { data: payload, type: "group_key_chat" });
            }
          } catch (err) {
            console.error("markasdelivered error:", err);
          }
        }
        else if (topic == "offline-resend-request") {
          try {
            if (!message.value) {
              throw new Error("Kafka message value is null");
            }

            let payload = JSON.parse(message.value.toString());

            const tempMember = payload.member;
            delete payload.member;

            if (tempMember) {
              let dat = await redisPublisher.get(`user:${tempMember}:online`);
              if (dat == null || dat == "0") {
                redisPublisher.lPush(`offline:messages:${tempMember}`, JSON.stringify({ type: "resendRequest", data: payload }));
                await redisPublisher.expire(`offline:messages:${tempMember}`, 60 * 60 * 24 * 7); // 7 days
              }
            }
          } catch (err) {
            console.error("resend request error:", err);
          }
        }
        else if (topic == "offline-taxi-chat-messages") {
          try {
            if (!message.value) {
              throw new Error("Kafka message value is null");
            }

            let payload = JSON.parse(message.value.toString());
            payload = JSON.parse(payload);

            const convRes = await TaxiConversation.findOne({ bookingId: payload.bookingId }).select("members -_id").lean();

            if (convRes) {
              let uniqueMember = [...new Set(convRes.members)];
              for (let username of uniqueMember) {
                if (username == payload.senderId && payload.senderRole == payload.role) continue;
                // let dat = await redisPublisher.get(`taxiUser:${username}:online`);
                // if (dat == '0' || dat === null) {
                console.info(`User ${username} is offline, sending FCM notification for taxi chat message`);
                await sendChatFCMNotification(username, payload);
                // }
              }
            }
          } catch (err) {
            console.error("markasdelivered error:", err);
          }
        }
        else if (topic == "offline-chat-msg-reaction") {
          try {
            if (!message.value) {
              throw new Error("Kafka message value is null");
            }

            let payload = JSON.parse(message.value.toString());

            const tempMember = payload.member;
            delete payload.member;

            if (tempMember) {
              let dat = await redisPublisher.get(`user:${tempMember}:online`);
              if (dat === null || dat == "0") {
                redisPublisher.lPush(`offline:messages:${tempMember}`, JSON.stringify({ type: "chatMsgReaction", data: payload }));
                await redisPublisher.expire(`offline:messages:${tempMember}`, 60 * 60 * 24 * 7); // 7 days
              }
              let tempPayload = {
                senderId: payload.from,
                title: `Message Reaction`,
                content: `${payload.from} reacted to your message with ${payload.emoji}`,
                type: "chat_msg_reaction",
                extraData: {
                  messageId: payload.messageId,
                  conversationId: payload.conversationId,
                  emoji: payload.emoji,
                  type: payload.type,
                },
              }
              await sendBasicFCMNotification(tempMember, tempPayload);
            }
          } catch (err) {
            console.error("markasdelivered error:", err);
          }
        }
      } catch (err) {
        console.error("Error processing Kafka message:", err);
      }
    },
  });
};
