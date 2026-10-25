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
  /** What kind of queued delivery this is (the consumer handles it by kind) */
  offlineTopic: string;
  /**
   * true: emit to whatever sockets a member has and also queue it for them (chat messages, keys).
   * false (default): online members get it live, everyone else gets it queued.
   */
  alwaysQueue?: boolean;
  /** Extra condition for counting a member as online (e.g. has this chat open) */
  live?: (member: string) => boolean;
  /** What gets queued for a member (default: the event plus `member`) */
  offlineValue?: (member: string) => any;
}

/**
 * Delivers an event to conversation members: online flags and sockets fetched together
 * (pipelined), and one Kafka batch for everyone who has to get it later.
 */
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
