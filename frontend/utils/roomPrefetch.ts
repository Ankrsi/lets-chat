import { getConversationById, getUnreadMessageData } from "@/db/conversationRepo";
import { lastMsgsByConvId } from "@/db/messageRepo";

// Chat data read just before opening a room, so its first frame already has everything
export interface PrefetchedRoom {
  conv: any;
  messages: any[];
  unreadIds: string[];
  at: number;
}

const cache = new Map<string, PrefetchedRoom>();
const MAX_AGE_MS = 5000;

export async function prefetchRoom(id: string) {
  try {
    // Unread first: the room clears it on open, and the load must reach the first unread message
    const unreadRow: any = await getUnreadMessageData(id);
    let unreadIds: string[] = [];
    try {
      const parsed = JSON.parse(typeof unreadRow?.unreadMsg === "string" ? unreadRow.unreadMsg : "[]");
      if (Array.isArray(parsed)) unreadIds = parsed.map(String);
    } catch {
      unreadIds = [];
    }
    const [conv, messages] = await Promise.all([
      getConversationById(id),
      lastMsgsByConvId(id, Math.max(50, unreadIds.length + 20)),
    ]);
    cache.set(id, { conv, messages: (messages as any[]) ?? [], unreadIds, at: Date.now() });
  } catch (err) {
    // The room loads on its own if this fails
    console.info("prefetchRoom failed", err);
  }
}

export function takePrefetchedRoom(id: string): PrefetchedRoom | null {
  const hit = cache.get(id);
  cache.delete(id);
  return hit && Date.now() - hit.at < MAX_AGE_MS ? hit : null;
}
