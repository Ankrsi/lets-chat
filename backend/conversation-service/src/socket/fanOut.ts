import { Server } from "socket.io";
import { redisClient } from "../redis/redisClient";
import { socketsOf } from "./presence";
import { TOPICS } from "../kafka/kafkaClient";

export { socketsOf };

interface FanOut {
  io: Server;
  producer: any;
  members: (string | number)[];
  event: string;
  data: any;
  offlineTopic: string;
  alwaysQueue?: boolean;
  live?: (member: string) => boolean;
  offlineValue?: (member: string) => any;
}

export const fanOut = async ({ io, producer, members, event, data, offlineTopic, alwaysQueue = false, live, offlineValue }: FanOut) => {
  const list = members.map(String);
  if (!list.length) return;

  const [flags, sockets] = await Promise.all([
    alwaysQueue ? Promise.resolve([] as (string | null)[]) : Promise.all(list.map((m) => redisClient.get(`user:${m}:online`))),
    socketsOf(list),
  ]);

  const queued: { key: string; value: string }[] = [];
  list.forEach((member, i) => {
    const online = alwaysQueue || (flags[i] === "1" && (!live || live(member)));
    if (online && sockets[i].length) io.to(sockets[i]).emit(event, data);
    if (alwaysQueue || !online) {
      // Keyed by member: one person's events stay in order on one partition
      const value = offlineValue ? offlineValue(member) : { ...data, member };
      queued.push({ key: member, value: JSON.stringify({ ...value, kind: offlineTopic }) });
    }
  });

  if (queued.length) {
    await producer.send({ topic: TOPICS.offline, messages: queued }).catch((e: any) => console.error(`queue ${offlineTopic} failed`, e));
  }
};
