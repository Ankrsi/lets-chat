import { t } from "../../../i18n";
import TaxiConversation from "../../models/chatModal/taxiConversation.model";
import { getAuthByPhone } from "../../services/auth/authByPhone.service";
import { ApiResponse } from "../../utils/apiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { Request, Response } from "express";

export const taxiCreateConversation = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, t("USER_NOT_FORUND", req.language || "en") as string);
  try {
    req.body.memberIds = Array.isArray(req.body.memberIds)
      ? [...req.body.memberIds, req.user?.phone]
      : [req.user?.phone];
    const { memberIds, bookingId } = req.body;
    if (!Array.isArray(memberIds)) return res.status(400).json({ error: "memberIds" });

    // Ensure two members only
    const members = Array.from(new Set(memberIds)).slice(0, 2);
    // check existing
    const existing = await TaxiConversation.findOne({ bookingId });
    if (existing) return new ApiResponse(200, existing, t("CONVERSATIONS_CREATED", req.language || "en") as string);

    const convData: any = { members, bookingId };

    const conv = await TaxiConversation.create(convData);
    return new ApiResponse(200, conv, t("CONVERSATIONS_CREATED", req.language || "en") as string);
  } catch {
    return new ApiResponse(500, null, t("SERVER_ERROR", req.language || "en") as string);
  }
});

// get taxi conversation members
export const getTaxiConversationMembers = async (bookingId: any) => {
  const conv = await TaxiConversation.findOne({ bookingId }).lean();
  if (!conv) return [];
  return conv.members.map((m: any) => m.toString());
};

// List taxi conversations for user with last message preview
export const getTaxiConversationLists = async (username: string, redisPub: any) => {
  try {
    const convos = await TaxiConversation.find({
      members: username
    })
      .sort({ updatedAt: -1 })
      .lean();

    const withLast = await Promise.all(
      convos.map(async (c: any) => {
        const otherMember = c.members[0] == username ? c.members[1] : c.members[0];
        const last = c.lastMessage ? {
          content: c.lastMessage,
          timestamp: c.updatedAt,
          status: c.lastMessageStatus,
          type: c.lastMessageType,
          senderId: c.lastMessageSenderId,
        } : null;
        let otherMemberData = await getAuthByPhone(otherMember);
        let otherMemberName = `${otherMemberData?.first_name || null} ${otherMemberData?.last_name || null}`
        const unreadMsg = (await redisPub.lRange(`unread:${c.bookingId}:${username}`, 0, -1)) || [];
        return {
          ...c,
          lastMessage: last ? { content: last.content, timestamp: last.timestamp, status: last.status, type: last.type, senderId: last.senderId } : null,
          unreadMsg,
          name: otherMemberName
        };
      }),
    );

    return withLast;
  } catch (err) {
    console.error(err);
  }
};