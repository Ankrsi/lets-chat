import { redisClient } from "../redis/redisClient";

const P = "stats:chat";

// Counters outlive the longest dashboard window; leaderboards are heavier per
// key so they roll off sooner.
export const TTL_DAY_COUNTER = 60 * 60 * 24 * 400;
export const TTL_LEADERBOARD = 60 * 60 * 24 * 31;

export const MAX_METRIC_DAYS = 366;
const MAX_LEADERBOARD_DAYS = 31;
const LEADERBOARD_FETCH_PER_DAY = 50;

// The daily totals and uniques cost one command each for the whole window, but
// the breakdown hashes cost one command per day. Cap those so a long range
// cannot fan out into thousands of round trips.
const MAX_DETAIL_DAYS = 92;

const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC day bucket - matches the UTC day buckets the dashboard trend renders. */
export const dayKey = (date: Date): string => date.toISOString().slice(0, 10);

/** Exported so the seed script writes the exact keys the reader expects. */
export const metricKeys = {
  prefix: P,
  total: `${P}:msg:total`,
  day: (d: string) => `${P}:msg:day:${d}`,
  type: (d: string) => `${P}:msg:type:${d}`,
  hourOfDay: (d: string) => `${P}:msg:hod:${d}`,
  meta: (d: string) => `${P}:msg:meta:${d}`,
  status: (d: string) => `${P}:msg:status:${d}`,
  dau: (d: string) => `${P}:dau:${d}`,
  activeConvs: (d: string) => `${P}:convs:${d}`,
  topConv: (d: string) => `${P}:top:conv:${d}`,
  topSender: (d: string) => `${P}:top:sender:${d}`,
};

// Every UTC day touched by the window, oldest first, clamped to the most recent
// `max` days so an "all" range cannot fan out into thousands of metricKeys.
export const daysInRange = (from: Date, to: Date, max = MAX_METRIC_DAYS): string[] => {
  const endUtc = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  let startUtc = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  startUtc = Math.max(startUtc, endUtc - (max - 1) * DAY_MS);

  const days: string[] = [];
  for (let day = startUtc; day <= endUtc; day += DAY_MS) {
    days.push(new Date(day).toISOString().slice(0, 10));
  }
  return days;
};

type MessageEvent = {
  senderId: string;
  conversationId: string;
  messageType?: string;
  convType?: string;
  forwarded?: boolean;
  isReply?: boolean;
  timestamp?: string | number | Date;
};

const toDate = (value?: string | number | Date): Date => {
  if (!value) return new Date();
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
};

// Counts one relayed message. Fire and forget - metrics must never delay or
// break message delivery, so failures are logged and swallowed.
export const recordMessageSent = (event: MessageEvent): void => {
  void (async () => {
    try {
      if (!redisClient.isOpen || !event?.senderId || !event?.conversationId) return;

      const at = toDate(event.timestamp);
      const day = dayKey(at);
      const hour = at.getUTCHours();
      const type = event.messageType || "unknown";
      const convType = event.convType === "group" ? "group" : "single";

      const multi = redisClient
        .multi()
        .incr(metricKeys.total)
        .incr(metricKeys.day(day))
        .expire(metricKeys.day(day), TTL_DAY_COUNTER)
        .hIncrBy(metricKeys.type(day), type, 1)
        .expire(metricKeys.type(day), TTL_DAY_COUNTER)
        .hIncrBy(metricKeys.hourOfDay(day), String(hour), 1)
        .expire(metricKeys.hourOfDay(day), TTL_DAY_COUNTER)
        .hIncrBy(metricKeys.meta(day), `conv:${convType}`, 1)
        .expire(metricKeys.meta(day), TTL_DAY_COUNTER)
        // Approximate uniques - HyperLogLog stays ~12KB per day no matter how
        // many users, and never stores the identifiers themselves.
        .pfAdd(metricKeys.dau(day), String(event.senderId))
        .expire(metricKeys.dau(day), TTL_DAY_COUNTER)
        .pfAdd(metricKeys.activeConvs(day), String(event.conversationId))
        .expire(metricKeys.activeConvs(day), TTL_DAY_COUNTER)
        .zIncrBy(metricKeys.topConv(day), 1, String(event.conversationId))
        .expire(metricKeys.topConv(day), TTL_LEADERBOARD)
        .zIncrBy(metricKeys.topSender(day), 1, String(event.senderId))
        .expire(metricKeys.topSender(day), TTL_LEADERBOARD);

      if (event.forwarded) multi.hIncrBy(metricKeys.meta(day), "forwarded", 1);
      if (event.isReply) multi.hIncrBy(metricKeys.meta(day), "reply", 1);

      await multi.exec();
    } catch (err) {
      console.error("chatMetrics: recordMessageSent failed:", (err as Error).message);
    }
  })();
};

// Counts receipts and message mutations. `field` is one of
// delivered | read | deleted | edited.
export const recordMessageEvent = (
  field: "delivered" | "read" | "deleted" | "edited",
  count = 1,
  timestamp?: string | number | Date,
): void => {
  void (async () => {
    try {
      if (!redisClient.isOpen || count < 1) return;

      const day = dayKey(toDate(timestamp));
      await redisClient
        .multi()
        .hIncrBy(metricKeys.status(day), field, count)
        .expire(metricKeys.status(day), TTL_DAY_COUNTER)
        .exec();
    } catch (err) {
      console.error("chatMetrics: recordMessageEvent failed:", (err as Error).message);
    }
  })();
};

const sumHashes = (hashes: Record<string, string>[]): Record<string, number> => {
  const totals: Record<string, number> = {};
  for (const hash of hashes) {
    for (const [field, value] of Object.entries(hash || {})) {
      totals[field] = (totals[field] || 0) + Number(value || 0);
    }
  }
  return totals;
};

// Merges per-day leaderboards in memory - avoids writing temp keys on a read path.
const mergeLeaderboards = (
  perDay: { value: string; score: number }[][],
  limit: number,
) => {
  const totals = new Map<string, number>();
  for (const day of perDay) {
    for (const entry of day || []) {
      totals.set(entry.value, (totals.get(entry.value) || 0) + Number(entry.score || 0));
    }
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, messages]) => ({ id, messages }));
};

// Just the message total for a window - used for period-over-period growth.
export const readMessageTotal = async (from: Date, to: Date): Promise<number> => {
  try {
    if (!redisClient.isOpen) return 0;
    const days = daysInRange(from, to);
    if (!days.length) return 0;

    const counts = await redisClient.mGet(days.map(metricKeys.day));
    return counts.reduce((sum: number, c) => sum + Number(c || 0), 0);
  } catch (err) {
    console.error("chatMetrics: readMessageTotal failed:", (err as Error).message);
    return 0;
  }
};

export type ChatMetrics = Awaited<ReturnType<typeof readChatMetrics>>;

// Reads everything the dashboard needs for a window. Returns `available: false`
// rather than throwing when redis is unreachable.
export const readChatMetrics = async (from: Date, to: Date, topLimit: number) => {
  const empty = {
    available: false,
    lifetimeMessages: 0,
    messagesInRange: 0,
    trend: [] as { date: string; count: number }[],
    byType: {} as Record<string, number>,
    hourly: [] as { hour: number; count: number }[],
    meta: {} as Record<string, number>,
    status: {} as Record<string, number>,
    uniqueSenders: 0,
    activeConversations: 0,
    topConversations: [] as { id: string; messages: number }[],
    topSenders: [] as { id: string; messages: number }[],
    leaderboardDays: 0,
    detailDays: 0,
  };

  try {
    if (!redisClient.isOpen) return empty;

    const days = daysInRange(from, to);
    if (!days.length) return { ...empty, available: true };

    const detailDays = days.slice(-MAX_DETAIL_DAYS);
    const leaderboardDays = days.slice(-MAX_LEADERBOARD_DAYS);

    // Commands issued in the same tick are pipelined by node-redis, so this is
    // still a single round trip - but unlike MULTI it does not hold the server
    // in an atomic block for the whole batch.
    //
    // PFCOUNT over many keys returns the cardinality of their union, so range
    // uniques need no temp keys and never double count a user across days.
    const [
      lifetimeRaw,
      dailyCounts,
      typeHashes,
      hourHashes,
      metaHashes,
      statusHashes,
      uniqueSenders,
      activeConversations,
      convBoards,
      senderBoards,
    ] = await Promise.all([
      redisClient.get(metricKeys.total),
      redisClient.mGet(days.map(metricKeys.day)),
      Promise.all(detailDays.map((d) => redisClient.hGetAll(metricKeys.type(d)))),
      Promise.all(detailDays.map((d) => redisClient.hGetAll(metricKeys.hourOfDay(d)))),
      Promise.all(detailDays.map((d) => redisClient.hGetAll(metricKeys.meta(d)))),
      Promise.all(detailDays.map((d) => redisClient.hGetAll(metricKeys.status(d)))),
      redisClient.pfCount(days.map(metricKeys.dau)),
      redisClient.pfCount(days.map(metricKeys.activeConvs)),
      Promise.all(
        leaderboardDays.map((d) =>
          redisClient.zRangeWithScores(metricKeys.topConv(d), 0, LEADERBOARD_FETCH_PER_DAY - 1, {
            REV: true,
          }),
        ),
      ),
      Promise.all(
        leaderboardDays.map((d) =>
          redisClient.zRangeWithScores(metricKeys.topSender(d), 0, LEADERBOARD_FETCH_PER_DAY - 1, {
            REV: true,
          }),
        ),
      ),
    ]);

    const lifetimeMessages = Number(lifetimeRaw || 0);

    const trend = days.map((date, idx) => ({
      date,
      count: Number(dailyCounts[idx] || 0),
    }));
    const messagesInRange = trend.reduce((sum, d) => sum + d.count, 0);

    const hourTotals = sumHashes(hourHashes);
    const hourly = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      count: hourTotals[String(hour)] || 0,
    }));

    return {
      available: true,
      lifetimeMessages,
      messagesInRange,
      trend,
      byType: sumHashes(typeHashes),
      hourly,
      meta: sumHashes(metaHashes),
      status: sumHashes(statusHashes),
      uniqueSenders: Number(uniqueSenders || 0),
      activeConversations: Number(activeConversations || 0),
      topConversations: mergeLeaderboards(convBoards, topLimit),
      topSenders: mergeLeaderboards(senderBoards, topLimit),
      leaderboardDays: leaderboardDays.length,
      detailDays: detailDays.length,
    };
  } catch (err) {
    console.error("chatMetrics: readChatMetrics failed:", (err as Error).message);
    return empty;
  }
};
