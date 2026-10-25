import { Socket } from "socket.io";

/**
 * The payload field that names the sender of each event. The server overwrites it with the
 * phone from the verified JWT, so a client can't act as someone else.
 * (video:accept-call is sent as { from: caller, to: me }, so its sender is `to`.)
 */
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
};

// Per-socket token bucket. Call set-up sends bursts of ICE candidates, so the bucket is roomy;
// a client flooding events past it gets them dropped.
const BUCKET_SIZE = 120;
const REFILL_PER_SECOND = 40;

export const guardSocket = (socket: Socket) => {
  let tokens = BUCKET_SIZE;
  let last = Date.now();
  let warned = false;

  socket.use(([event, payload], next) => {
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

    const field = SENDER_FIELD[event];
    const me = socket.user?.phone?.toString();
    if (field && me && payload && typeof payload === "object") {
      if (payload[field] != null && String(payload[field]) !== me) {
        console.warn(`Socket ${socket.id}: ${event} claimed ${field}=${payload[field]} but is ${me}`);
      }
      payload[field] = me;
    }
    next();
  });
};
