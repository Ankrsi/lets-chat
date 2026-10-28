import { Socket } from "socket.io";
import { getConversationMembers } from "../controllers/chats/chats.controller";

// Field that holds the sender's phone in each event: always overwritten with the verified user
const SENDER_FIELD: Record<string, string> = {
  registerUser: "senderId",
  "chat:join": "username",
  "chat:send-message": "senderId",
  "chat:markAsDelivered": "username",
  "chat:markAsRead": "username",
  "chat:typing": "username",
  "chat:deleteMessages": "username",
  "chat:editMessage": "username",
  "chat:status": "username",
  "chat:updateLastChatRoom": "username",
  "chat:send-group-key": "senderId",
  "chat:resend-request": "senderId",
  "chat:one-view": "username",
  "chat:msgReaction": "from",
  "chat:screenshot": "myPhone",
  "video:start-call": "from",
  "video:accept-call": "to",
  "video:reject-call": "from",
  "video:end-call": "from",
  "video:add-user": "from",
  "video:add-user-accept": "username",
  "video:offer": "from",
  "video:answer": "from",
  "video:ice-candidate": "from",
  "video:remove-user": "username",
  "video:call-type-changed": "from",
  "video:mutedCall": "username",
  "video:holdCall": "username",
  "group:video-start-call": "from",
  "video:joinRoom": "userId",
  "video:leaveRoom": "userId",
  "video:userMuteState": "userId",
  "video:switch-call-type": "userId",
};

// Events about one conversation: only its members may send them
const MEMBERS_ONLY = new Set([
  "chat:join",
  "chat:markAsDelivered",
  "chat:markAsRead",
  "chat:typing",
  "chat:deleteMessages",
  "chat:editMessage",
  "chat:status",
  "chat:send-group-key",
  "chat:resend-request",
  "chat:one-view",
  "chat:msgReaction",
  "video:start-call",
  "video:add-user",
  "group:video-start-call",
  "video:joinRoom",
  "video:leaveRoom",
  "video:userMuteState",
  "video:switch-call-type",
]);

// Events sent to one person ("to"): that person must be in the same conversation
const TARGET_IN_CONVERSATION = new Set(["video:start-call", "chat:send-group-key", "chat:resend-request"]);

// Per-socket token bucket. Call set-up sends bursts of ICE candidates, so the bucket is roomy;
// a client flooding events past it gets them dropped.
const BUCKET_SIZE = 120;
const REFILL_PER_SECOND = 40;

export const guardSocket = (socket: Socket) => {
  let tokens = BUCKET_SIZE;
  let last = Date.now();
  let warned = false;

  socket.use(async (packet, next) => {
    const event = packet[0];
    const now = Date.now();
    tokens = Math.min(BUCKET_SIZE, tokens + ((now - last) / 1000) * REFILL_PER_SECOND);
    last = now;
    if (tokens < 1) {
      if (!warned) {
        warned = true;
        console.warn(`Rate limited socket ${socket.id} (${socket.user?.phone}) on ${event}`);
      }
      return next(new Error("Too many requests"));
    }
    tokens -= 1;
    warned = false;

    // Handlers read fields straight from the payload and call the ack: a bad client must not crash them
    if (!packet[1] || typeof packet[1] !== "object") packet[1] = {};
    if (typeof packet[packet.length - 1] !== "function") packet.push(() => undefined);
    const payload = packet[1];

    const me = socket.user?.phone?.toString();
    if (!me) return next(new Error("Not authenticated"));

    const field = SENDER_FIELD[event];
    if (field) payload[field] = me;

    if (MEMBERS_ONLY.has(event)) {
      try {
        const members = (await getConversationMembers(payload.conversationId)).map(String);
        if (!members.includes(me)) return next(new Error("Not a member of this conversation"));
        if (TARGET_IN_CONVERSATION.has(event) && payload.to != null && !members.includes(String(payload.to)))
          return next(new Error("Not a member of this conversation"));
        // Online status: only for this conversation's members, not any phones the client lists
        if (event === "chat:status") payload.members = members;
      } catch {
        return next(new Error("Not a member of this conversation"));
      }
    }
    next();
  });
};
