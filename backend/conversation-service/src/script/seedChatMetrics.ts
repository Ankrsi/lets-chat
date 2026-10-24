/**
 * Seeds dummy chat metrics so the admin dashboard can be developed and tested
 * without waiting for real traffic.
 *
 * Writes the same redis keys the live counters write (imported from
 * utils/chatMetrics so the two cannot drift). Real message content is never
 * involved - this only fabricates the metadata counters.
 *
 *   npm run seed:chat-metrics                    # 30 days, keeps existing data
 *   npm run seed:chat-metrics -- --days=90       # longer history
 *   npm run seed:chat-metrics -- --clear         # wipe seeded keys first
 *   npm run seed:chat-metrics -- --clear-only    # wipe and exit
 *   npm run seed:chat-metrics -- --live          # also fake online presence
 *   npm run seed:chat-metrics -- --seed=42       # reproducible run
 *
 * Refuses to run against NODE_ENV=production without --force.
 */

import { config } from "../config/dot.env";
config();

import mongoose from "mongoose";
import { redisClient } from "../redis/redisClient";
import Conversation from "../models/chatModal/conversation.model";
import { metricKeys, TTL_DAY_COUNTER, TTL_LEADERBOARD, dayKey } from "../utils/chatMetrics";

const DAY_MS = 24 * 60 * 60 * 1000;

// Synthetic identities use a fixed prefix so --clear can find and remove them
// without touching anything real.
const FAKE_PHONE_PREFIX = "99900";
const FAKE_CONV_MARKER = "seed";

const argOf = (name: string, fallback: string): string => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : fallback;
};
const hasFlag = (name: string): boolean => process.argv.includes(`--${name}`);

const DAYS = Math.max(1, Math.min(366, Number(argOf("days", "30")) || 30));
const SEED = Number(argOf("seed", "1337")) || 1337;
const CLEAR = hasFlag("clear") || hasFlag("clear-only");
const CLEAR_ONLY = hasFlag("clear-only");
const SEED_LIVE = hasFlag("live");
const FORCE = hasFlag("force");

/** Deterministic PRNG - same --seed produces the same dashboard every run. */
const makeRandom = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const rand = makeRandom(SEED);
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

// Roughly WhatsApp-shaped mix.
const MESSAGE_TYPES: [string, number][] = [
  ["text", 0.68],
  ["image", 0.10],
  ["voice", 0.07],
  ["video", 0.04],
  ["document", 0.03],
  ["audio", 0.02],
  ["location", 0.02],
  ["contact", 0.015],
  ["money", 0.01],
  ["money_request", 0.005],
];

// Relative volume per UTC hour: quiet overnight, peaks late morning and evening.
const HOUR_WEIGHTS = [
  2, 1, 1, 1, 1, 2, 4, 8, 14, 20, 24, 25,
  22, 20, 21, 23, 26, 30, 34, 36, 30, 20, 12, 6,
];

const weightedSplit = (total: number, weights: number[]): number[] => {
  const sum = weights.reduce((a, b) => a + b, 0);
  const out = weights.map((w) => Math.floor((total * w) / sum));
  // Hand the rounding remainder to the busiest bucket so totals reconcile.
  let assigned = out.reduce((a, b) => a + b, 0);
  let i = weights.indexOf(Math.max(...weights));
  while (assigned < total) {
    out[i]++;
    assigned++;
    i = (i + 1) % out.length;
  }
  return out;
};

const guardEnvironment = () => {
  if (process.env.NODE_ENV === "production" && !FORCE) {
    console.error(
      "Refusing to seed dummy metrics with NODE_ENV=production. Re-run with --force if you really mean it.",
    );
    process.exit(1);
  }
};

/** Deletes only keys this script creates. */
const clearSeeded = async () => {
  let cursor = "0";
  const doomed: string[] = [];

  do {
    const reply: any = await redisClient.scan(cursor, {
      MATCH: `${metricKeys.prefix}:*`,
      COUNT: 500,
    });
    cursor = String(reply?.cursor ?? "0");
    doomed.push(...(reply?.keys ?? []));
  } while (cursor !== "0");

  // Presence keys for synthetic users only.
  cursor = "0";
  do {
    const reply: any = await redisClient.scan(cursor, {
      MATCH: `user:${FAKE_PHONE_PREFIX}*:online`,
      COUNT: 500,
    });
    cursor = String(reply?.cursor ?? "0");
    doomed.push(...(reply?.keys ?? []));
  } while (cursor !== "0");

  if (doomed.length) await redisClient.del(doomed);
  console.info(`Cleared ${doomed.length} seeded keys.`);
};

/**
 * Prefers real conversation ids so topConversations resolves to real names in
 * the dashboard; falls back to synthetic ids when mongo has nothing.
 */
const loadConversations = async () => {
  try {
    if (!process.env.MONGODB_URL) throw new Error("MONGODB_URL not set");
    await mongoose.connect(process.env.MONGODB_URL);

    const docs = await Conversation.find({})
      .select("_id members")
      .limit(120)
      .lean();

    if (docs.length) {
      console.info(`Using ${docs.length} real conversations from mongo.`);
      return {
        conversationIds: docs.map((d: any) => String(d._id)),
        phones: [
          ...new Set(
            docs.flatMap((d: any) => (d.members || []).map(String)).filter(Boolean),
          ),
        ].slice(0, 200),
      };
    }
    console.info("Mongo has no conversations - falling back to synthetic ids.");
  } catch (err) {
    console.info(`Mongo unavailable (${(err as Error).message}) - using synthetic ids.`);
  }

  return {
    conversationIds: Array.from(
      { length: 60 },
      (_, i) => `${FAKE_CONV_MARKER}${String(i).padStart(18, "0")}`,
    ),
    phones: [],
  };
};

const seed = async () => {
  guardEnvironment();

  await redisClient.connect();
  console.info("Redis connected.");

  if (CLEAR) await clearSeeded();
  if (CLEAR_ONLY) {
    await redisClient.quit();
    await mongoose.disconnect().catch(() => undefined);
    return;
  }

  const { conversationIds, phones } = await loadConversations();

  // Top up to a decent population so uniques and leaderboards look realistic.
  const users = [...phones];
  for (let i = users.length; i < 200; i++) {
    users.push(`${FAKE_PHONE_PREFIX}${String(10000 + i).slice(-5)}`);
  }

  const today = new Date();
  let grandTotal = 0;

  for (let d = DAYS - 1; d >= 0; d--) {
    const date = new Date(today.getTime() - d * DAY_MS);
    const day = dayKey(date);
    const dow = date.getUTCDay();

    // Mild upward trend, weekend dip, plus noise.
    const trendFactor = 1 + (DAYS - 1 - d) * 0.008;
    const weekendFactor = dow === 0 || dow === 6 ? 0.72 : 1;
    const noise = 0.85 + rand() * 0.3;
    const dayTotal = Math.max(
      1,
      Math.round(randInt(900, 1400) * trendFactor * weekendFactor * noise),
    );
    grandTotal += dayTotal;

    const multi = redisClient.multi();

    multi.incrBy(metricKeys.day(day), dayTotal);
    multi.expire(metricKeys.day(day), TTL_DAY_COUNTER);

    // Message type mix.
    let assignedTypes = 0;
    MESSAGE_TYPES.forEach(([type, share], idx) => {
      const count =
        idx === MESSAGE_TYPES.length - 1
          ? Math.max(0, dayTotal - assignedTypes)
          : Math.round(dayTotal * share);
      assignedTypes += count;
      if (count > 0) multi.hIncrBy(metricKeys.type(day), type, count);
    });
    multi.expire(metricKeys.type(day), TTL_DAY_COUNTER);

    // Hour-of-day curve.
    weightedSplit(dayTotal, HOUR_WEIGHTS).forEach((count, hour) => {
      if (count > 0) multi.hIncrBy(metricKeys.hourOfDay(day), String(hour), count);
    });
    multi.expire(metricKeys.hourOfDay(day), TTL_DAY_COUNTER);

    // single/group split plus forwarded and reply rates.
    const groupShare = Math.round(dayTotal * (0.22 + rand() * 0.08));
    multi.hIncrBy(metricKeys.meta(day), "conv:group", groupShare);
    multi.hIncrBy(metricKeys.meta(day), "conv:single", dayTotal - groupShare);
    multi.hIncrBy(metricKeys.meta(day), "forwarded", Math.round(dayTotal * (0.06 + rand() * 0.04)));
    multi.hIncrBy(metricKeys.meta(day), "reply", Math.round(dayTotal * (0.12 + rand() * 0.06)));
    multi.expire(metricKeys.meta(day), TTL_DAY_COUNTER);

    // Receipts: nearly everything delivers, most gets read.
    multi.hIncrBy(metricKeys.status(day), "delivered", Math.round(dayTotal * (0.95 + rand() * 0.04)));
    multi.hIncrBy(metricKeys.status(day), "read", Math.round(dayTotal * (0.72 + rand() * 0.15)));
    multi.hIncrBy(metricKeys.status(day), "deleted", Math.round(dayTotal * (0.005 + rand() * 0.01)));
    multi.hIncrBy(metricKeys.status(day), "edited", Math.round(dayTotal * (0.01 + rand() * 0.02)));
    multi.expire(metricKeys.status(day), TTL_DAY_COUNTER);

    // Daily active users / conversations (HyperLogLog).
    const activeUsers = users.slice(0, randInt(Math.floor(users.length * 0.35), Math.floor(users.length * 0.7)));
    if (activeUsers.length) multi.pfAdd(metricKeys.dau(day), activeUsers);
    multi.expire(metricKeys.dau(day), TTL_DAY_COUNTER);

    const activeConvs = conversationIds.slice(
      0,
      randInt(Math.floor(conversationIds.length * 0.4), conversationIds.length),
    );
    if (activeConvs.length) multi.pfAdd(metricKeys.activeConvs(day), activeConvs);
    multi.expire(metricKeys.activeConvs(day), TTL_DAY_COUNTER);

    // Leaderboards - a zipf-ish head so the top 10 is clearly ordered.
    let remaining = dayTotal;
    activeConvs.forEach((convId, idx) => {
      if (remaining <= 0) return;
      const share = Math.max(1, Math.round(dayTotal / (idx + 2) / 2));
      const count = Math.min(remaining, share);
      remaining -= count;
      multi.zIncrBy(metricKeys.topConv(day), count, convId);
    });
    multi.expire(metricKeys.topConv(day), TTL_LEADERBOARD);

    remaining = dayTotal;
    activeUsers.forEach((phone, idx) => {
      if (remaining <= 0) return;
      const share = Math.max(1, Math.round(dayTotal / (idx + 2) / 2));
      const count = Math.min(remaining, share);
      remaining -= count;
      multi.zIncrBy(metricKeys.topSender(day), count, phone);
    });
    multi.expire(metricKeys.topSender(day), TTL_LEADERBOARD);

    await multi.exec();
    console.info(`  ${day}: ${dayTotal} messages`);
  }

  await redisClient.incrBy(metricKeys.total, grandTotal);

  if (SEED_LIVE) {
    const online = users.filter((u) => u.startsWith(FAKE_PHONE_PREFIX)).slice(0, 40);
    const multi = redisClient.multi();
    for (const phone of online) multi.set(`user:${phone}:online`, "1");
    await multi.exec();
    console.info(`Marked ${online.length} synthetic users online.`);
  }

  console.info(`\nSeeded ${DAYS} days, ${grandTotal} messages total.`);
  console.info("Fetch the dashboard with ?refresh=true to bypass the 60s cache.");

  await redisClient.quit();
  await mongoose.disconnect().catch(() => undefined);
};

seed().catch(async (err) => {
  console.error("Seeding failed:", err);
  await redisClient.quit().catch(() => undefined);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
