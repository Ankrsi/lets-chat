import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/apiResponse";
import { presignedUrlR2, uploadToR2 } from "../../utils/r2Upload";
import Conversation from "../../models/chatModal/conversation.model";
import { redisClient, redisPublisher } from "../../redis/redisClient";
import { blockContacts } from "../../services/blockUserService/blockContacts.service";
import { unblockContacts } from "../../services/blockUserService/unblockContacts.service";
import AllFriendsContact from "../../models/contactModal/allFriendsContact.model";
import { getUsersByPhones } from "../../services/auth/phone.service";
import { sendBasicFCMNotification } from "../../services/chatBasicFcm.service";
import { notifyMembers } from "../../utils/notifyMembers";

export const getPresignedUrlInChat = asyncHandler(async (req: Request, res: Response) => {
  const { conversationId, data } = req.body;
  if (!conversationId || !Array.isArray(data) || !data.length || data.some((d: any) => !d?.fileName || !d?.mediaType)) {
    return new ApiResponse(400, null, "Data missing, please check");
  }
  const result = await Promise.all(data.map(async ({ fileName, mediaType }: any) => {
    const { uploadUrl, fileUrl } = await presignedUrlR2(fileName, conversationId, mediaType);
    return { uploadUrl, fileUrl };
  }));
  return new ApiResponse(200, result, "Urls created successfully");
});

// Create conversation (single or group)
export const createConversation = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, "User not found");
  const io = req.app.get("io");
  try {
    req.body.memberIds = Array.isArray(req.body.memberIds)
      ? [...req.body.memberIds, String(req.user?.phone)]
      : [req.user?.phone];
    if (req.body.type == "group" && req.file) {
      const file = req.file;
      const uploadedUrl = await uploadToR2({
        file,
        folder: `conversation/logos`,
      });
      req.body.avatar = uploadedUrl;
    }

    const { type = "single", memberIds, name, avatar, timestamp = new Date() } = req.body;
    if (!type || !Array.isArray(memberIds))
      return new ApiResponse(400, null, "Type or member IDs are invalid");

    if (type === "single" && memberIds.length != 2) {
      return new ApiResponse(
        400,
        null,
        "Single conversation must have exactly 2 members"
      );
    }

    if (type === "group" && memberIds.length > 100) {
      return new ApiResponse(
        400,
        null,
        "Group conversation member limit (100) exceeded"
      );
    }

    const membersList = type === "single" ? Array.from(new Set(memberIds)).slice(0, 2) : Array.from(new Set(memberIds));
    const users = await getUserInfoFun(membersList);

    if (type === "single") {
      // Ensure two members only
      const members = Array.from(new Set(memberIds)).slice(0, 2);
      // check existing
      const existing = await Conversation.findOne({
        type: "single",
        members: { $all: members, $size: 2 },
      });
      if (existing) {
        await notifyNewConversation(io, members, req.user?.phone, { conv: existing, users });
        return new ApiResponse(200, { conv: existing, users }, "Conversation created successfully");
      }

      const convData: any = { type, members, timestamp };
      const conv = await Conversation.create(convData);
      await forgetMembership(conv._id, members);

      await notifyNewConversation(io, members, req.user?.phone, { conv, users });

      return new ApiResponse(200, { conv, users }, "Conversation created successfully");
    } else {
      // group
      const members = Array.from(new Set(memberIds));
      const convData: any = { type, members, name, avatar, admins: [req.user?.phone], timestamp };

      const conv = await Conversation.create(convData);
      await forgetMembership(conv._id, members);

      await notifyNewConversation(io, members, req.user?.phone, { conv, users });

      return new ApiResponse(200, { conv, users }, "Conversation created successfully");
    }
  } catch {
    return new ApiResponse(500, null, "Server error");
  }
});

// get all group
export const getGroupConversation = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, "User not found");
  const conv = await Conversation.find(
    {
      members: { $in: [req.user.phone] },
      removedMembers: { $nin: [req.user.phone] },
      type: "group"
    }
  ).select("-lastMessageId -lastMessage -lastMessageStatus -lastMessageType -lastMessageSenderId -lastMessageDate").lean();

  // No groups yet (e.g. a new user) is an empty list, not an error
  if (conv.length === 0) {
    return new ApiResponse(200, { conv: [], users: [] }, "No group conversations");
  }

  const membersList = Array.from(new Set(conv.flatMap((c) => c.members)));
  const users = await getUserInfoFun(membersList);

  return new ApiResponse(200, { conv: conv, users }, "Conversations found");
})

// update group name and profile
export const updateGroupProfileName = asyncHandler(async (req: Request, res: Response) => {
  try {
    if (!req.user) return new ApiResponse(401, null, "User not found");

    const file = req.file;

    if (file) {
      const uploadedUrl = await uploadToR2({
        file,
        folder: `conversation/logos`,
      });
      req.body.avatar = uploadedUrl;
    }

    const { conversationId, name, avatar } = req.body;

    if (!conversationId) return new ApiResponse(400, null, "Conversation ID is required");

    const update: Partial<{ name: string; avatar: string }> = {};
    if (avatar) update.avatar = avatar;
    if (name) update.name = name;

    if (Object.keys(update).length === 0) {
      return new ApiResponse(400, null, "Nothing to update");
    }

    // Only members can change the group's name or photo
    const conv = await Conversation.findOneAndUpdate(
      { _id: conversationId, members: String(req.user.phone) },
      { $set: update },
      { new: true }
    ).lean();

    if (!conv) return new ApiResponse(404, null, "Conversation not found");

    const sendData = { conversationId, name: conv.name, avatar: conv.avatar };

    await notifyMembers({
      io: req.app.get("io"),
      members: conv.members.filter((m: any) => m != req.user?.phone),
      event: "chat:updateGroupProfileName",
      data: sendData,
      offlineType: "updateGroupProfileName",
    });

    return new ApiResponse(200, sendData, "Profile updated successfully");

  } catch {
    return new ApiResponse(500, null, "Server error");
  }
});

const CACHE_TTL = 10 * 60;
const membersKey = (convId: any) => `convMembers:${convId}`;
const userConvsKey = (phone: any) => `userConvs:${phone}`;

export const getConversationMembers = async (convId: any): Promise<string[]> => {
  const cached = await redisClient.get(membersKey(convId));
  if (cached) return JSON.parse(cached);
  const conv = await Conversation.findById(convId).select("members").lean();
  if (!conv) return [];
  const members = conv.members.map((m: any) => m.toString());
  await redisClient.set(membersKey(convId), JSON.stringify(members), { EX: CACHE_TTL });
  return members;
};

export const getUserConversationIds = async (phone: string): Promise<string[]> => {
  const cached = await redisClient.get(userConvsKey(phone));
  if (cached) return JSON.parse(cached);
  const convs = await Conversation.find({ members: phone }).select("_id").lean();
  const ids = convs.map((c: any) => String(c._id));
  await redisClient.set(userConvsKey(phone), JSON.stringify(ids), { EX: CACHE_TTL });
  return ids;
};

const forgetMembership = (convId: any, phones: any[]) =>
  redisClient.del([membersKey(convId), ...phones.map((p) => userConvsKey(p))]);

// add members in conversation
export const addMembersInConversation = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, "User not found");

  const { conversationId, members, timestamp = new Date } = req.body;

  if (!Array.isArray(members) || members.length < 1) {
    return new ApiResponse(400, null, "Members data not found or incorrect");
  }

  const conv = await Conversation.findOne({ _id: conversationId }).lean();
  if (!conv) {
    return new ApiResponse(404, null, "Conversation not found");
  }
  if (conv.type !== "group") {
    return new ApiResponse(400, null, "Only group conversations accept members");
  }

  if (conv.admins && !conv.admins.includes(req.user.phone.toString())) {
    return new ApiResponse(400, null, "Only admins can add members");
  }

  const updatedMembers = Array.from(new Set([...conv.members, ...members]));
  const allUsers = await getUserInfoFun(updatedMembers);
  const newSet = new Set(members.map(String));
  const users = allUsers.filter((u) => newSet.has(String(u.phone)));
  const updatedRemovedMembers = conv.removedMembers.filter((m: any) => !updatedMembers.includes(m));
  const updatedConv = await Conversation.findOneAndUpdate(
    { _id: conversationId },
    { $set: { members: updatedMembers, removedMembers: updatedRemovedMembers } },
    { new: true }
  );

  if (!updatedConv) {
    return new ApiResponse(500, null, "Failed to add members");
  }
  await forgetMembership(conversationId, updatedMembers);

  const io = req.app.get("io");
  const sendData = { conversationId, members: updatedMembers, removedMembers: updatedRemovedMembers, new: members, by: String(req.user.phone), timestamp, users };
  await Promise.all([
    // New members get the whole conversation; existing ones get the change
    notifyMembers({ io, members, event: "chat:otherCreateConversation", data: { conv: updatedConv, users: allUsers }, offlineType: "createConversation" }),
    notifyMembers({ io, members: updatedMembers.filter((m: any) => m != req.user?.phone), event: "chat:updateConversationMembers", data: sendData, offlineType: "updateConversationMembers" }),
  ]);

  return new ApiResponse(200, sendData, "Members added successfully");
});

// remove member from conversation
export const removeMembersInConversation = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, "User not found");

  const { conversationId, member } = req.body;

  if (!conversationId || !member) return new ApiResponse(400, null, "Conversation ID or member is missing");

  const conversation = await Conversation.findById(conversationId);

  if (!conversation) return new ApiResponse(404, null, "Conversation not found");
  if (conversation.type !== "group") return new ApiResponse(400, null, "Not a group conversation");
  if (!conversation.admins?.includes(req.user?.phone.toString())) return new ApiResponse(400, null, "Member must be admin");

  let dataSendToMember = [...conversation.members];

  conversation.members = conversation.members.filter(m => m != member);
  conversation.removedMembers = Array.from(new Set([...conversation.removedMembers, member]));
  conversation.admins = conversation.admins.filter(m => m != member);
  await conversation.save();
  await forgetMembership(conversationId, dataSendToMember);

  const sendData = { conversationId, members: conversation.members, removedMember: conversation.removedMembers, admins: conversation.admins, new: [member], by: String(req.user.phone) };

  await notifyMembers({ io: req.app.get("io"), members: dataSendToMember, event: "chat:removeConversationMembers", data: sendData, offlineType: "removeConversationMembers" });

  return new ApiResponse(200, sendData, "Conversation member updated");

});

export const leaveConversation = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, "User not found");

  const { conversationId } = req.params;

  if (!conversationId) return new ApiResponse(400, null, "Conversation ID is missing");

  const conversation = await Conversation.findOneAndUpdate(
    { _id: conversationId, members: req.user.phone },
    {
      $pull: { members: req.user?.phone, admins: req.user?.phone },
      $addToSet: { removedMembers: req.user?.phone }
    },
    { new: true }
  )

  if (!conversation) return new ApiResponse(404, null, "Conversation not found or user not a member");
  await forgetMembership(conversationId, [req.user.phone]);

  const sendData = {
    conversationId,
    member: String(req.user.phone)
  };

  await notifyMembers({
    io: req.app.get("io"),
    members: [String(req.user.phone), ...conversation.members],
    event: "chat:leaveConversationMembers",
    data: sendData,
    offlineType: "leaveConversationMembers",
  });

  return new ApiResponse(200, null, "Member removed from conversation");
});

// Disappearing Messages
export const setDisappearingMessages = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, "User not found");

  try {
    const { conversationId, duration, timestamp } = req.body;
    if (!conversationId || !duration) return new ApiResponse(400, null, "Conversation ID and duration are required");

    const conv = await Conversation.findOneAndUpdate(
      { _id: conversationId, members: req.user.phone },
      {
        $set: {
          disappearingMessages: duration == '0s' ? false : true,
          disappearingMessagesTime: duration == '0s' ? 'off' : duration
        }
      },
      { new: true }
    );

    if (!conv) return new ApiResponse(404, null, "Conversation not found");

    const seconds = convertToSeconds(duration);
    if (duration == '0s') {
      await redisPublisher.del([`chatMsg:${conversationId}:disappearingMessages`, `chatMsg:${conversationId}:disappearingMessages:ttl`]);
    } else {
      await redisPublisher.multi()
        .set(`chatMsg:${conversationId}:disappearingMessages`, seconds, { EX: seconds })
        .set(`chatMsg:${conversationId}:disappearingMessages:ttl`, seconds)
        .exec();
    }

    await redisPublisher.publish(`update-disappearing-messages`, JSON.stringify({ conversationId, duration, username: req.user.phone, "timestamp": timestamp }));

    return new ApiResponse(200, null, "Disappearing messages updated successfully");
  }
  catch {
    return new ApiResponse(500, null, "Server error");
  }

});

// Destructing Messages
export const setDestructingMessages = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, "User not found");

  try {
    const { conversationId, duration, timestamp } = req.body;
    if (!conversationId || !duration) return new ApiResponse(400, null, "Conversation ID and duration are required");

    const conv = await Conversation.exists({ _id: conversationId, members: req.user.phone });

    if (!conv) return new ApiResponse(404, null, "Conversation not found");

    const seconds = convertToSeconds(duration);
    if (duration == '0s') {
      await redisPublisher.del([`chatMsg:${conversationId}:destructingMessages`, `chatMsg:${conversationId}:destructingMessages:data`]);
    } else {
      await redisPublisher.multi()
        .set(`chatMsg:${conversationId}:destructingMessages`, seconds, { EX: seconds })
        .set(`chatMsg:${conversationId}:destructingMessages:data`, JSON.stringify({ senderId: String(req.user.phone), ttl: seconds, timestamp }))
        .exec();
    }

    return new ApiResponse(200, null, "Destructing messages updated successfully");
  }
  catch {
    return new ApiResponse(500, null, "Server error");
  }

});

function convertToSeconds(duration: string): number {
  const map: Record<string, number> = {
    '5m': 5 * 60,
    '10m': 10 * 60,
    '15m': 15 * 60,
    '30m': 30 * 60,
    '1h': 3600,
    '2h': 2 * 3600,
    '24h': 24 * 3600,
    '7d': 7 * 86400,
    '90d': 90 * 86400,
  };
  return map[duration] ?? 0;
}

// add/remove admin in group
export const addRemoveAdmin = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, "User not found");
  const { conversationId, member, add = true } = req.body;

  if (!conversationId || !member) return new ApiResponse(400, null, "Conversation ID or member is missing");

  try {
    const updateQuery = add
      ? { $addToSet: { admins: member } }
      : { $pull: { admins: member } };

    // Only a current admin of the group can add or remove admins
    const updated = await Conversation.findOneAndUpdate(
      { _id: conversationId, type: "group", admins: String(req.user.phone) },
      updateQuery,
      { new: true }
    ).lean();

    if (!updated) return new ApiResponse(404, null, "Conversation not found or you are not an admin");

    const sendData = { conversationId, admins: updated.admins };

    await notifyMembers({
      io: req.app.get("io"),
      members: updated.members.filter((m: any) => m != req.user?.phone),
      event: "chat:updateGroupAdmins",
      data: sendData,
      offlineType: "updateGroupAdmins",
    });

    return new ApiResponse(200, sendData, add ? "Admin added to conversation successfully" : "Admin removed from conversation successfully");
  }
  catch {
    return new ApiResponse(500, null, "Server error");
  }
});

// add/edit group description
export const addEditDescription = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, "User not found");

  const { conversationId, desc } = req.body;

  if (!conversationId || !desc) return new ApiResponse(400, null, "Conversation ID or description is missing");

  const conversation = await Conversation.findOne({ _id: conversationId, members: String(req.user.phone) });

  if (!conversation) return new ApiResponse(404, null, "Conversation not found");
  if (conversation.type !== "group") return new ApiResponse(400, null, "Not a group conversation");

  if (!conversation.groupDescription || !conversation.groupDescription.desc) {
    conversation.groupDescription = {
      desc,
      createdBy: req.user.phone,
      createdAt: new Date(),
    };
  } else {
    conversation.groupDescription.desc = desc;
    conversation.groupDescription.createdBy = req.user.phone;
    conversation.groupDescription.createdAt = new Date();
  }

  await conversation.save();
  return new ApiResponse(200, null, "Group description updated");
});

// block user
export const blockUser = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, "User not found");

  const { no, conversationId } = req.body;

  if (!no) return new ApiResponse(401, null, "Number not found");

  try {
    let data = await blockContacts(req.user?.phone, no);
    if (data.success) {
      await Conversation.findOneAndUpdate(
        { _id: conversationId },
        {
          blocked: true,
          $addToSet: { blockedBy: req.user?.phone.toString() }
        }
      );

      const blocked = await AllFriendsContact.findOneAndUpdate(
        { phone: req.user?.phone },
        {
          $addToSet: { blockedPhones: no }
        },
        {
          new: true
        }
      ).select("-_id blockedPhones").lean();

      await cacheBlocked(req.user.phone, blocked?.blockedPhones ?? []);
      await notifyMembers({
        io: req.app.get("io"),
        members: [no],
        event: "chat:blockUser",
        data: { conversationId, hitBy: req.user?.phone, type: "block" },
        offlineType: "blockUser",
      });

      return new ApiResponse(data.statusCode || 200, null, data.message || "User blocked successfully");
    }
    return new ApiResponse(data.statusCode || 500, null, data.message || "Failed to block user");
  }
  catch (err: any) {
    console.error("Block User Error:", err)
    return new ApiResponse(500, null, "Failed to block user");
  }

});

// unblock user
export const unblockUser = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, "User not found");

  const { no, conversationId } = req.body;

  if (!no) return new ApiResponse(401, null, "Number not found");

  try {

    const conv = await Conversation.findOne(
      { _id: conversationId, blocked: true }
    ).select("blockedBy blocked");

    if (!conv) return new ApiResponse(200, null, "Conversation is not blocked");

    if (!conv.blockedBy?.includes(req.user?.phone)) return new ApiResponse(200, null, "Conversation block does not apply");

    let data = await unblockContacts(req.user?.phone, no);
    if (data.success) {
      conv.blockedBy = conv.blockedBy.filter((block: any) => block != req.user?.phone)
      if (conv.blockedBy.length == 0) {
        conv.blocked = false;
      }
      await conv.save();

      const blocked = await AllFriendsContact.findOneAndUpdate(
        { phone: req.user?.phone },
        {
          $pull: { blockedPhones: no }
        },
        {
          new: true
        }
      ).select("-_id blockedPhones").lean();

      await cacheBlocked(req.user.phone, data.data?.blockedNo?.length > 0 ? blocked?.blockedPhones ?? [] : []);
      await notifyMembers({
        io: req.app.get("io"),
        members: [no],
        event: "chat:blockUser",
        data: { conversationId, hitBy: req.user?.phone, type: "unblock" },
        offlineType: "blockUser",
      });

      return new ApiResponse(data.statusCode || 200, null, data.message || "User unblocked successfully");
    }
    return new ApiResponse(400, null, "Failed to unblock user");
  }
  catch (err: any) {
    console.error("Block User Error:", err)
    return new ApiResponse(500, null, "Failed to unblock user");
  }
});

// get blocked user
export const getBlockedUser = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, "User not found");

  try {
    const data: any = await AllFriendsContact.findOne({ phone: req.user?.phone }).select("-_id blockedPhones").lean();
    if (data) {
      await cacheBlocked(req.user.phone, data.blockedPhones ?? []);
      return new ApiResponse(200, { blockedNo: data.blockedPhones || [] }, "Blocked users fetched successfully");
    }
    return new ApiResponse(404, null, "Failed to fetch blocked users");
  }
  catch (err: any) {
    console.error("Block User Error:", err)
    return new ApiResponse(500, null, "Failed to fetch blocked users");
  }
});

export const setMsgDeliveryIos = asyncHandler(async (req: Request, res: Response) => {
  const { conversationId, messageIds, timestamp } = req.body;
  const username = String(req.user?.phone); // the receipt is always from the caller
  if (!Array.isArray(messageIds) || messageIds.length == 0 || !conversationId) return new ApiResponse(400, null, "conversationId or messageIds are missing");

  await Promise.all(messageIds.map((messageId: string) =>
    redisPublisher.publish("chat-messages-status", JSON.stringify({ messageId, updatedStatus: "delivered", conversationId, username, timestamp }))));

  return new ApiResponse(200, null, "Message status updated");
});

export const getOfflineMessages = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, "User not found");

  const offlineMessages = await redisPublisher.lRange(`offline:messages:${req.user.phone.toString()}`, 0, -1);

  const parsed = offlineMessages.map(msg => JSON.parse(msg));

  // Group keys go last: the client reverses this list, so they get processed first and the
  // key is in place before the group messages are decrypted
  const messages = [
    ...parsed.filter(msg => msg?.type !== "groupKeyChat"),
    ...parsed.filter(msg => msg?.type === "groupKeyChat"),
  ];
  return new ApiResponse(200, messages, "Offline messages fetched");
});

export const clearOfflineMessages = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, "User not found");

  await redisPublisher.del(`offline:messages:${req.user.phone.toString()}`);
  return new ApiResponse(200, null, "Offline messages cleared");
});

export const getChatMessagesOutSideIOS = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, "User not found");

  const { data } = req.body;

  const {
    messageId,
    conversationId,
    messageType,
    content = {},
    status,
    replyToMessage = null,
    forwarded = false,
    timestamp,
    autoDisappearing = false,
    publicKey = null,
    ephPublicKey = null,
    number = null,
    viewOnce = false,
    version = null,
    conv_type = "single"
  } = data;

  if (!conversationId) return new ApiResponse(400, null, "Conversation ID is missing");

  // The sender is always the caller, and must be in the conversation
  const senderId = String(req.user.phone);
  const otherMember = await getConversationMembers(conversationId) || [];
  if (!otherMember.includes(senderId)) return new ApiResponse(403, null, "Not a member of this conversation");
  const event = {
    messageId,
    conversationId,
    senderId,
    content: content,
    replyToMessage,
    messageType,
    status,
    timestamp,
    autoDisappearing,
    forwarded,
    publicKey,
    ephPublicKey,
    number,
    otherMember,
    viewOnce,
    version,
    conv_type
  };
  await redisPublisher.publish("chat", JSON.stringify(event));

  return new ApiResponse(200, null, "Message sent");
});

export const getMembersDetails = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, "User not found");

  const { number } = req.params;

  if (!number) return new ApiResponse(400, null, "User not found");

  const membersList = [number.toString()];
  const users = await getUserInfoFun(membersList);

  return new ApiResponse(200, users, "User Details Found");

});

export const generateNotifyNewLogin = asyncHandler(async (req: Request, res: Response) => {
  const { data } = req.body;

  if (!data) return new ApiResponse(400, null, "Payload is missing");

  await notifyMembers({
    io: req.app.get("io"),
    members: [String(data.phone)],
    event: "chat:updateNewLogin",
    data: { logout: data.logout, deviceId: data.deviceId, app_code: data.app_code },
    offlineType: "updateNewLogin",
    queue: "offline:newLogin",
  });

  if(data.logout == true) {
    await sendBasicFCMNotification(String(data.phone), {
      senderId: String(data.phone),
      title: "New Login",
      content: "You have a new login on another device.",
      type: "new_login",
      extraData: {
        logout: data.logout,
        deviceId: data.deviceId,
        app_code: data.app_code
      }
    });
  }

  return new ApiResponse(200, null, "New login updated");
});

export const contactsRefrashController = asyncHandler(async (req: Request, res: Response) => {
  const { data } = req.body;

  if (!data.phone) {
    return new ApiResponse(404, null, "Phone No Not Found.");
  }

  const contactsData: any = await AllFriendsContact.findOne({ phone: data.phone }).select("-_id contacts.phone").lean();
  if (!contactsData) {
    return new ApiResponse(404, null, "Contacts Not Found.");
  }

  await notifyMembers({
    io: req.app.get("io"),
    members: contactsData.contacts.map((c: any) => String(c.phone)).filter((p: string) => p != String(data.phone)),
    event: "chat:updateContactsList",
    data: { phone: String(data.phone) },
    offlineType: "updateContactsList",
    queue: "offline:newLogin",
  });

  return new ApiResponse(200, null, "contact updated successfully.");
});

const getUserInfoFun = async (phones: string[]) => {
  const users = await getUsersByPhones(phones);
  const userMap = new Map(users.map((user: any) => [String(user.phone), user]));

  return phones?.map((phone) => {
    const user: any = userMap.get(phone);
    return {
      name: user ? `${user.first_name} ${user.last_name}` : null,
      phone,
      userId: user ? String(user._id) : null,
      full_name: user ? `${user.first_name} ${user.last_name}` : null,
      profile_image: user?.profile_image || null,
      email: user?.email || null,
      isOnboarded: !!user,
    };
  });
};

const notifyNewConversation = (io: any, members: any[], me: any, data: any) =>
  notifyMembers({ io, members: members.filter((m) => m != me), event: "chat:otherCreateConversation", data, offlineType: "createConversation" });

const cacheBlocked = async (phone: any, blocked: any[]) => {
  const key = `blocked:phones:${phone}`;
  const tx = redisClient.multi().del(key);
  if (blocked.length) tx.sAdd(key, blocked.map(String));
  await tx.exec();
};
