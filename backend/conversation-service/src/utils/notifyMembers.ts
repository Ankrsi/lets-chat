import { Server } from "socket.io";
import { redisPublisher } from "../redis/redisClient";
import { socketsOf } from "../socket/presence";

const OFFLINE_TTL = 60 * 60 * 24 * 7; // queued events are kept for 7 days

interface Notify {
  io: Server;
  members: (string | number)[];
  event: string;
  data: any;
  offlineType: string;
  queue?: string;
}

export const notifyMembers = async ({ io, members, event, data, offlineType, queue = "offline:messages" }: Notify) => {
  const list = [...new Set(members.map(String))];
  if (!list.length) return;

  const [flags, sockets] = await Promise.all([
    Promise.all(list.map((m) => redisPublisher.get(`user:${m}:online`))),
    socketsOf(list),
  ]);

  const writes: Promise<unknown>[] = [];
  list.forEach((member, i) => {
    if (flags[i] === "1") {
      if (sockets[i].length) io.to(sockets[i]).emit(event, data);
      return;
    }
    const key = `${queue}:${member}`;
    writes.push(redisPublisher.lPush(key, JSON.stringify({ type: offlineType, data })), redisPublisher.expire(key, OFFLINE_TTL));
  });
  await Promise.all(writes);
};
