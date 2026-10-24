import { t } from "../../../i18n";
import { Response, Request } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/apiResponse";
import { ApiError } from "../../utils/apiError";
import { redisClient } from "../../redis/redisClient";
import Conversation from "../../models/chatModal/conversation.model";
import { readChatMetrics, readMessageTotal } from "../../utils/chatMetrics";

/**
 * Admin chat dashboard.
 *
 * Two sources, because messages are end-to-end encrypted and live only on the
 * device:
 *   - mongo  -> conversation structure (conversations, groups, membership),
 *               which is still written server side
 *   - redis  -> message activity, counted as events pass through the relay
 *               (see utils/chatMetrics.ts) plus live presence
 *
 * Message metrics therefore only exist from the day the counters were deployed;
 * there is no historical backfill to recover.
 */

const CACHE_TTL_SECONDS = 60;
const CACHE_PREFIX = "dashboard:chat";
const TOP_LIMIT = 10;
const SCAN_COUNT = 500;
const MAX_SCAN_ITERATIONS = 500;

type ResolvedRange = {
  key: string;
  from: Date;
  to: Date;
};

/**
 * Supported ranges: today | 7d | 30d | 90d | all | custom (needs from & to).
 */
const resolveRange = (range: string, from?: string, to?: string): ResolvedRange => {
  const to_ = new Date();
  const from_ = new Date();

  switch (range) {
    case "today":
      from_.setHours(0, 0, 0, 0);
      break;
    case "7d":
      from_.setDate(from_.getDate() - 7);
      break;
    case "30d":
      from_.setDate(from_.getDate() - 30);
      break;
    case "90d":
      from_.setDate(from_.getDate() - 90);
      break;
    case "all":
      from_.setTime(0);
      break;
    case "custom": {
      if (!from || !to) {
        throw new ApiError("from and to are required for custom range", 400);
      }
      const customFrom = new Date(from);
      const customTo = new Date(to);
      if (isNaN(customFrom.getTime()) || isNaN(customTo.getTime())) {
        throw new ApiError("from and to must be valid dates", 400);
      }
      if (customFrom > customTo) {
        throw new ApiError("from must be earlier than to", 400);
      }
      return { key: range, from: customFrom, to: customTo };
    }
    default:
      throw new ApiError(
        "range must be one of: today, 7d, 30d, 90d, all, custom",
        400,
      );
  }

  return { key: range, from: from_, to: to_ };
};

/**
 * Same-length window immediately before the selected one, used for growth %.
 */
const previousWindow = ({ from, to }: ResolvedRange) => {
  const span = to.getTime() - from.getTime();
  return { from: new Date(from.getTime() - span), to: from };
};

const growth = (current: number, previous: number): number => {
  if (!previous) return current ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(2));
};

const percent = (part: number, whole: number): number =>
  whole ? Number(((part / whole) * 100).toFixed(2)) : 0;

/**
 * Live presence straight from redis. Never fatal - a redis outage degrades the
 * live block to nulls instead of failing the whole dashboard.
 */
const getLiveMetrics = async () => {
  try {
    if (!redisClient.isOpen) {
      return { available: false, onlineUsers: null, connectedSockets: null, usersWithSockets: null };
    }

    let cursor = "0";
    let iterations = 0;
    let onlineUsers = 0;

    do {
      const reply: any = await redisClient.scan(cursor, {
        MATCH: "user:*:online",
        COUNT: SCAN_COUNT,
      });

      cursor = String(reply?.cursor ?? "0");
      const keys: string[] = reply?.keys ?? [];

      if (keys.length) {
        const values = await redisClient.mGet(keys);
        onlineUsers += values.filter((v) => v === "1").length;
      }

      iterations++;
    } while (cursor !== "0" && iterations < MAX_SCAN_ITERATIONS);

    const [connectedSockets, usersWithSockets] = await Promise.all([
      redisClient.hLen("socketUserMap"),
      redisClient.hLen("userSocketMap"),
    ]);

    return { available: true, onlineUsers, connectedSockets, usersWithSockets };
  } catch (err) {
    console.error("chatDashboard: redis live metrics failed:", (err as Error).message);
    return { available: false, onlineUsers: null, connectedSockets: null, usersWithSockets: null };
  }
};

export const chatDashboard = asyncHandler(async (req: Request, res: Response) => {
  const { range = "30d", from, to, refresh } = req.query as Record<string, string>;

  const window = resolveRange(String(range), from, to);
  const previous = previousWindow(window);
  const inRange = { $gte: window.from, $lte: window.to };

  const cacheKey = `${CACHE_PREFIX}:${window.key}:${window.from.getTime()}:${window.to.getTime()}`;

  // Cached payloads keep the aggregations off mongo/redis when several admins
  // hit the dashboard at once. ?refresh=true forces a rebuild.
  if (refresh !== "true") {
    try {
      if (redisClient.isOpen) {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          return new ApiResponse(
            200,
            { ...JSON.parse(cached), cached: true },
            t("CHAT_DASHBOARD_FETCHED_SUCCESSFULLY", req.language || "en") as string,
          );
        }
      }
    } catch (err) {
      console.error("chatDashboard: cache read failed:", (err as Error).message);
    }
  }

  const [
    conversationStats,
    groupStats,
    newConversations,
    previousConversations,
    metrics,
    previousMessages,
    live,
  ] = await Promise.all([
    Conversation.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          single: { $sum: { $cond: [{ $eq: ["$type", "single"] }, 1, 0] } },
          group: { $sum: { $cond: [{ $eq: ["$type", "group"] }, 1, 0] } },
          active: { $sum: { $cond: [{ $ne: ["$active", false] }, 1, 0] } },
          blocked: { $sum: { $cond: [{ $eq: ["$blocked", true] }, 1, 0] } },
          disappearing: {
            $sum: { $cond: [{ $eq: ["$disappearingMessages", true] }, 1, 0] },
          },
        },
      },
    ]),

    Conversation.aggregate([
      { $match: { type: "group" } },
      {
        $group: {
          _id: null,
          totalMembers: { $sum: { $size: { $ifNull: ["$members", []] } } },
          avgMembers: { $avg: { $size: { $ifNull: ["$members", []] } } },
          largestGroup: { $max: { $size: { $ifNull: ["$members", []] } } },
        },
      },
    ]),

    Conversation.countDocuments({ createdAt: inRange }),
    Conversation.countDocuments({ createdAt: { $gte: previous.from, $lt: previous.to } }),

    readChatMetrics(window.from, window.to, TOP_LIMIT),
    readMessageTotal(previous.from, previous.to),

    getLiveMetrics(),
  ]);

  const conversations = conversationStats[0] || {
    total: 0,
    single: 0,
    group: 0,
    active: 0,
    blocked: 0,
    disappearing: 0,
  };
  const groups = groupStats[0] || { totalMembers: 0, avgMembers: 0, largestGroup: 0 };

  const messagesInRange = metrics.messagesInRange;
  const readReceipts = metrics.status.read || 0;
  const deliveredReceipts = metrics.status.delivered || 0;

  // Leaderboard ids come from redis - enrich them with conversation metadata.
  const topConversationDocs = metrics.topConversations.length
    ? await Conversation.find({ _id: { $in: metrics.topConversations.map((c) => c.id) } })
        .select("type name members admins active blocked createdAt")
        .lean()
    : [];
  const conversationById = new Map(
    topConversationDocs.map((c: any) => [String(c._id), c]),
  );

  const busiestHour = metrics.hourly.reduce(
    (best, cur) => (!best || cur.count > best.count ? cur : best),
    null as { hour: number; count: number } | null,
  );

  const payload = {
    range: {
      key: window.key,
      from: window.from,
      to: window.to,
    },
    overview: {
      totalConversations: conversations.total,
      singleChats: conversations.single,
      groupChats: conversations.group,
      activeConversations: conversations.active,
      blockedConversations: conversations.blocked,
      disappearingConversations: conversations.disappearing,
      messagesAllTime: metrics.lifetimeMessages,
      messagesInRange,
      newConversationsInRange: newConversations,
      // Approximate (HyperLogLog, ~0.81% error) and de-duplicated across days.
      activeConversationsInRange: metrics.activeConversations,
      activeUsersInRange: metrics.uniqueSenders,
      avgMessagesPerActiveConversation: metrics.activeConversations
        ? Number((messagesInRange / metrics.activeConversations).toFixed(2))
        : 0,
      avgMessagesPerActiveUser: metrics.uniqueSenders
        ? Number((messagesInRange / metrics.uniqueSenders).toFixed(2))
        : 0,
    },
    growth: {
      messages: {
        current: messagesInRange,
        previous: previousMessages,
        changePercent: growth(messagesInRange, previousMessages),
      },
      newConversations: {
        current: newConversations,
        previous: previousConversations,
        changePercent: growth(newConversations, previousConversations),
      },
    },
    live: {
      available: live.available,
      onlineUsers: live.onlineUsers,
      connectedSockets: live.connectedSockets,
      usersWithSockets: live.usersWithSockets,
    },
    messages: {
      available: metrics.available,
      byType: Object.entries(metrics.byType)
        .map(([type, count]) => ({
          type,
          count,
          percentage: percent(count, messagesInRange),
        }))
        .sort((a, b) => b.count - a.count),
      byConversationType: {
        single: metrics.meta["conv:single"] || 0,
        group: metrics.meta["conv:group"] || 0,
      },
      forwarded: metrics.meta.forwarded || 0,
      replies: metrics.meta.reply || 0,
      deleted: metrics.status.deleted || 0,
      edited: metrics.status.edited || 0,
      delivered: deliveredReceipts,
      read: readReceipts,
      deliveryRate: percent(deliveredReceipts, messagesInRange),
      readRate: percent(readReceipts, messagesInRange),
      trend: metrics.trend,
      hourly: metrics.hourly,
      busiestHour: busiestHour && busiestHour.count ? busiestHour : null,
    },
    groups: {
      totalGroups: conversations.group,
      totalMembers: groups.totalMembers || 0,
      avgMembers: Number((groups.avgMembers || 0).toFixed(2)),
      largestGroup: groups.largestGroup || 0,
    },
    topConversations: metrics.topConversations.map((entry) => {
      const doc: any = conversationById.get(entry.id);
      return {
        conversationId: entry.id,
        messages: entry.messages,
        type: doc?.type || null,
        name: doc?.name || null,
        membersCount: doc?.members?.length || 0,
        active: doc?.active ?? null,
        blocked: doc?.blocked ?? null,
        createdAt: doc?.createdAt || null,
      };
    }),
    topSenders: metrics.topSenders.map((entry) => ({
      senderId: entry.id,
      messages: entry.messages,
    })),
    // Totals, trend and uniques cover the whole range. Breakdowns and
    // leaderboards are capped to the most recent days of it.
    coverage: {
      breakdownDays: metrics.detailDays,
      leaderboardDays: metrics.leaderboardDays,
    },
    generatedAt: new Date(),
  };

  try {
    if (redisClient.isOpen) {
      await redisClient.setEx(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(payload));
    }
  } catch (err) {
    console.error("chatDashboard: cache write failed:", (err as Error).message);
  }

  return new ApiResponse(
    200,
    { ...payload, cached: false },
    t("CHAT_DASHBOARD_FETCHED_SUCCESSFULLY", req.language || "en") as string,
  );
});
