import { t } from "../../../i18n";
import { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/apiResponse";
import { presignedUrlS3, uploadToS3 } from "../../utils/s3Upload";
import Conversation from "../../models/chatModal/conversation.model";
import mongoose from "mongoose";
import { redisClient, redisPublisher } from "../../redis/redisClient";
import { blockContacts } from "../../services/blockUserService/blockContacts.service";
import { unblockContacts } from "../../services/blockUserService/unblockContacts.service";
import AllFriendsContact from "../../models/contactModal/allFriendsContact.model";
import { getUsersByPhones } from "../../services/auth/phone.service";
import { getWalletsByUserId } from "../../services/getWallet.service";
import { sendBasicFCMNotification } from "../../services/chatBasicFcm.service";
// import { sendBasicFCMNotification } from "../../services/chatBasicFcm.service";

export const getPresignedUrlInChat = asyncHandler(async (req: Request, res: Response) => {
  const { conversationId, data } = req.body;
  if (Array.isArray(data) && data.length > 0) {
    let result = [];
    for (let item of data) {
      const { fileName, mediaType } = item;
      if (!fileName || !conversationId || !mediaType) {
        return new ApiResponse(400, null, t("DATA_MISSING_PLS_CHECK", req.language || "en") as string);
      }
      else {
        let { uploadUrl, fileUrl } = await presignedUrlS3(fileName, conversationId, mediaType);
        result.push({ uploadUrl, fileUrl });
      }
    }
    return new ApiResponse(200, result, t("URLS_CREATED_SUCCESSFULLY", req.language || "en") as string);
  }
  else {
    return new ApiResponse(400, null, t("DATA_MISSING_PLS_CHECK", req.language || "en") as string);
  }
});

export const uploadImageInChat = asyncHandler(async (req: Request, res: Response) => {
  const files = req.files;
  // const { appCode, senderId, receiverId } = req.params;
  // const chatId = generateChatId(appCode, senderId, receiverId);
  const { messageId, conversationId, senderId, messageType, caption = null, timestamp, viewOnce = false } = req.body
  if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
    return new ApiResponse(400, null, t("NO_IMAGE_IS_AVAILABLE_TO_UPLOAD", req.language || "en") as string);
  }

  let uploadFiles = [];
  for (let file of files as Express.Multer.File[]) {
    const uploadedUrl = await uploadToS3({
      file,
      folder: `chats/${conversationId}-${messageId}/images`,
    });
    uploadFiles.push({
      url: uploadedUrl,
      name: file.originalname
    })
  }

  let otherMember = await getConversationMembers(conversationId) || [];

  const event = {
    messageId,
    conversationId,
    senderId,
    content: {
      urls: uploadFiles || [],
    },
    messageType,
    caption,
    status: "sent",
    viewOnce,
    timestamp,
    otherMember,
  };
  await redisPublisher.publish("chat", JSON.stringify(event));

  return new ApiResponse(200, { data: event }, t("IMAGE_UPLOADED_SUCCESSFULLY", req.language || "en") as string);
});
export const uploadDocInChat = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  // const { appCode, senderId, receiverId } = req.params;
  // const chatId = generateChatId(appCode, senderId, receiverId);
  const { messageId, conversationId, senderId, messageType, timestamp } = req.body
  if (!file) {
    return new ApiResponse(400, null, t("NO_DOCUMENT_IS_AVAILABLE_TO_UPLOAD", req.language || "en") as string);
  }

  const uploadedUrl = await uploadToS3({
    file,
    folder: `chats/${conversationId}-${messageId}/documents`,
  });

  let otherMember = await getConversationMembers(conversationId) || [];

  const event = {
    messageId,
    conversationId,
    senderId,
    content: {
      url: uploadedUrl || ""
    },
    messageType,
    status: "sent",
    timestamp,
    otherMember,
  };

  await redisPublisher.publish("chat", JSON.stringify(event));

  return new ApiResponse(200, { data: event }, t("DOCUMENT_UPLOADED_SUCCESSFULLY", req.language || "en") as string);
});

export const uploadVoiceInChat = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  // const { appCode, senderId, receiverId } = req.params;
  // const chatId = generateChatId(appCode, senderId, receiverId);
  const { messageId, conversationId, senderId, messageType, timestamp, duration } = req.body
  if (!file) {
    return new ApiResponse(400, null, t("NO_VOICE_IS_AVAILABLE_TO_UPLOAD", req.language || "en") as string);
  }

  const uploadedUrl = await uploadToS3({
    file,
    folder: `chats/${conversationId}-${messageId}/voice`,
  });

  let otherMember = await getConversationMembers(conversationId) || [];

  const event = {
    messageId,
    conversationId,
    senderId,
    content: {
      url: uploadedUrl || "",
      duration: duration || "0"
    },
    messageType,
    status: "sent",
    timestamp,
    otherMember,
  };

  await redisPublisher.publish("chat", JSON.stringify(event));

  return new ApiResponse(200, { data: event }, t("VOICE_UPLOADED_SUCCESSFULLY", req.language || "en") as string);
});

export const uploadAudioInChat = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  // const { appCode, senderId, receiverId } = req.params;
  // const chatId = generateChatId(appCode, senderId, receiverId);
  const { messageId, conversationId, senderId, messageType, timestamp, duration } = req.body
  if (!file) {
    return new ApiResponse(400, null, t("NO_AUDIO_IS_AVAILABLE_TO_UPLOAD", req.language || "en") as string);
  }

  const uploadedUrl = await uploadToS3({
    file,
    folder: `chats/${conversationId}-${messageId}/audio`,
  });

  let otherMember = await getConversationMembers(conversationId) || [];

  const event = {
    messageId,
    conversationId,
    senderId,
    content: {
      url: uploadedUrl || "",
      duration: duration || "0"
    },
    messageType,
    status: "sent",
    timestamp,
    otherMember,
  };

  await redisPublisher.publish("chat", JSON.stringify(event));

  return new ApiResponse(200, { data: event }, t("AUDIO_UPLOADED_SUCCESSFULLY", req.language || "en") as string);
});

export const uploadVideoInChat = asyncHandler(async (req: Request, res: Response) => {
  const files = req.files;
  // const { appCode, senderId, receiverId } = req.params;
  // const chatId = generateChatId(appCode, senderId, receiverId);
  const { messageId, conversationId, senderId, messageType, caption = null, timestamp, viewOnce = false } = req.body
  if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
    return new ApiResponse(400, null, t("NO_VIDEO_IS_AVAILABLE_TO_UPLOAD", req.language || "en") as string);
  }

  let uploadFiles = [];
  for (let file of files as Express.Multer.File[]) {
    const uploadedUrl = await uploadToS3({
      file,
      folder: `chats/${conversationId}-${messageId}/video`,
    });
    uploadFiles.push({
      url: uploadedUrl,
      name: file.originalname
    })
  }

  let otherMember = await getConversationMembers(conversationId) || [];

  const event = {
    messageId,
    conversationId,
    senderId,
    content: {
      urls: uploadFiles || [],
    },
    messageType,
    caption,
    status: "sent",
    viewOnce,
    timestamp,
    otherMember,
  };

  await redisPublisher.publish("chat", JSON.stringify(event));

  return new ApiResponse(200, { data: event }, t("VIDEO_UPLOADED_SUCCESSFULLY", req.language || "en") as string);
});

///////////////////// New code ////////////////////////

// Create conversation (single or group)
export const createConversation = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, t("USER_NOT_FORUND", req.language || "en") as string);
  const io = req.app.get("io");
  try {
    req.body.memberIds = Array.isArray(req.body.memberIds)
      ? [...req.body.memberIds, String(req.user?.phone)]
      : [req.user?.phone];
    if (req.body.type == "group" && req.file) {
      const file = req.file;
      const uploadedUrl = await uploadToS3({
        file,
        folder: `conversation/logos`,
      });
      req.body.avatar = uploadedUrl;
    }

    const { type = "single", memberIds, name, avatar, timestamp = new Date() } = req.body;
    if (!type || !Array.isArray(memberIds))
      return new ApiResponse(400, null, t("TYPE_MEMBERIDS_IS_INVALID", req.language || "en") as string);

    if (type === "single" && memberIds.length != 2) {
      return new ApiResponse(
        400,
        null,
        t("SINGLE_CONVERSATION_MUST_HAVE_EXACTLY_2_MEMBERS", req.language || "en") as string
      );
    }

    if (type === "group" && memberIds.length > 100) {
      return new ApiResponse(
        400,
        null,
        t("GROUP_CONVERSATION_MEMBER_LIMIT_EXCEEDED_BY_100", req.language || "en") as string
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
        for (let member of members) {
          if (member == req.user?.phone) continue;
          const isOnline = await redisPublisher.get(`user:${member}:online`);
          if (isOnline !== "1") {
            redisPublisher.lPush(`offline:messages:${member}`, JSON.stringify({ type: "createConversation", data: { conv: existing, users } }));
            await redisPublisher.expire(`offline:messages:${member}`, 60 * 60 * 24 * 7); // 7 days
          }
          else {
            let memberSocketId = await redisPublisher.hGet("userSocketMap", member);
            if (memberSocketId) {
              io.to(JSON.parse(memberSocketId)).emit("chat:otherCreateConversation", { conv: existing, users });
            }
          }
        }
        return new ApiResponse(200, { conv: existing, users }, t("CONVERSATIONS_CREATED", req.language || "en") as string);
      }

      const convData: any = { type, members, timestamp };
      const conv = await Conversation.create(convData);

      for (let member of members) {
        if (member == req.user?.phone) continue;
        const isOnline = await redisPublisher.get(`user:${member}:online`);
        if (isOnline !== "1") {
          redisPublisher.lPush(`offline:messages:${member}`, JSON.stringify({ type: "createConversation", data: { conv: conv, users } }));
          await redisPublisher.expire(`offline:messages:${member}`, 60 * 60 * 24 * 7); // 7 days
        }
        else {
          let memberSocketId = await redisPublisher.hGet("userSocketMap", member);
          if (memberSocketId) {
            io.to(JSON.parse(memberSocketId)).emit("chat:otherCreateConversation", { conv: conv, users });
          }
        }
      }

      return new ApiResponse(200, { conv, users }, t("CONVERSATIONS_CREATED", req.language || "en") as string);
    } else {
      // group
      const members = Array.from(new Set(memberIds));
      const convData: any = { type, members, name, avatar, admins: [req.user?.phone], timestamp };

      const conv = await Conversation.create(convData);

      for (let member of members) {
        if (member == req.user?.phone) continue;
        const isOnline = await redisPublisher.get(`user:${member}:online`);
        if (isOnline !== "1") {
          redisPublisher.lPush(`offline:messages:${member}`, JSON.stringify({ type: "createConversation", data: { conv: conv, users } }));
          await redisPublisher.expire(`offline:messages:${member}`, 60 * 60 * 24 * 7); // 7 days
        }
        else {
          let memberSocketId = await redisPublisher.hGet("userSocketMap", member);
          if (memberSocketId) {
            io.to(JSON.parse(memberSocketId)).emit("chat:otherCreateConversation", { conv: conv, users });
          }
        }
      }

      return new ApiResponse(200, { conv, users }, t("CONVERSATIONS_CREATED", req.language || "en") as string);
    }
  } catch {
    return new ApiResponse(500, null, t("SERVER_ERROR", req.language || "en") as string);
  }
});

// get all group
export const getGroupConversation = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, t("USER_NOT_FORUND", req.language || "en") as string);
  const conv = await Conversation.find(
    {
      members: { $in: [req.user.phone] },
      removedMembers: { $nin: [req.user.phone] },
      type: "group"
    }
  ).select("-lastMessageId -lastMessage -lastMessageStatus -lastMessageType -lastMessageSenderId -lastMessageDate").lean();

  if (!conv || conv.length === 0) {
    return new ApiResponse(404, null, t("CONVERSATION_NOT_FOUND", req.language || "en") as string);
  }

  const membersList = Array.from(new Set(conv.flatMap((c) => c.members)));
  const users = await getUserInfoFun(membersList);

  if (!conv) {
    return new ApiResponse(500, null, t("CONVERSATION_NOT_FOUND", req.language || "en") as string);
  }
  return new ApiResponse(200, { conv: conv, users }, t("CONVERSATIONS_FOUND", req.language || "en") as string);
})

// update group name and profile
export const updateGroupProfileName = asyncHandler(async (req: Request, res: Response) => {
  try {
    if (!req.user) return new ApiResponse(401, null, t("USER_NOT_FORUND", req.language || "en") as string);

    const file = req.file;

    if (file) {
      const uploadedUrl = await uploadToS3({
        file,
        folder: `conversation/logos`,
      });
      req.body.avatar = uploadedUrl;
    }

    const { conversationId, name, avatar } = req.body;

    if (!conversationId) return new ApiResponse(400, null, t("CONVERSATIONID_IS_REQUIRED", req.language || "en") as string);

    const update: Partial<{ name: string; avatar: string }> = {};
    if (avatar) update.avatar = avatar;
    if (name) update.name = name;

    if (Object.keys(update).length === 0) {
      return new ApiResponse(400, null, t("NOTHING_TO_UPDATE", req.language || "en") as string);
    }

    const conv = await Conversation.findOneAndUpdate(
      { _id: conversationId },
      { $set: update },
      { new: true }
    );

    if (!conv) return new ApiResponse(404, null, t("CONVERSATION_NOT_FOUND", req.language || "en") as string);

    const sendData = { conversationId, name: conv.name, avatar: conv.avatar };

    const io = req.app.get("io");
    for (let member of conv.members) {
      if (member == req.user?.phone) continue;
      const isOnline = await redisPublisher.get(`user:${member}:online`);
      if (isOnline !== "1") {
        await redisPublisher.lPush(`offline:messages:${member}`, JSON.stringify({ type: "updateGroupProfileName", data: sendData }));
        await redisPublisher.expire(`offline:messages:${member}`, 60 * 60 * 24 * 7); // 7 days
      }
      else {
        let memberSocketId = await redisPublisher.hGet("userSocketMap", member);
        if (memberSocketId) {
          io.to(JSON.parse(memberSocketId)).emit("chat:updateGroupProfileName", sendData);
        }
      }
    }

    return new ApiResponse(200, sendData, t("PROFILE_UPDATED_SUCCESSFULLY", req.language || "en") as string);

  } catch {
    return new ApiResponse(500, null, t("SERVER_ERROR", req.language || "en") as string);
  }
});

// get conversation members
export const getConversationMembers = async (convId: any) => {
  const conv = await Conversation.findById(convId).lean();
  if (!conv) return [];
  return conv.members.map((m: any) => m.toString());
};

// add members in conversation
export const addMembersInConversation = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, t("USER_NOT_FORUND", req.language || "en") as string);

  const { conversationId, members, timestamp = new Date } = req.body;

  if (!Array.isArray(members) || members.length < 1) {
    return new ApiResponse(400, null, t("MEMBERS_DATA_NOT_FOUND_OR_INCORRECT", req.language || "en") as string);
  }

  const conv = await Conversation.findOne({ _id: conversationId }).lean();
  if (!conv) {
    return new ApiResponse(404, null, t("CONVERSATION_NOT_FOUND", req.language || "en") as string);
  }
  if (conv.type !== "group") {
    return new ApiResponse(400, null, t("ONLY_GROUP_CONVERSATIONS_ACCEPT_MEMBERS", req.language || "en") as string);
  }

  if (conv.admins && !conv.admins.includes(req.user.phone.toString())) {
    return new ApiResponse(400, null, t("ONLY_ADMINS_CAN_ADD_MEMBERS", req.language || "en") as string);
  }

  const membersList = Array.from(new Set(members));
  const users = await getUserInfoFun(membersList);
  const updatedMembers = Array.from(new Set([...conv.members, ...members]));
  const allUsers = await getUserInfoFun(updatedMembers);
  const updatedRemovedMembers = conv.removedMembers.filter((m: any) => !updatedMembers.includes(m));
  const updatedConv = await Conversation.findOneAndUpdate(
    { _id: conversationId },
    { $set: { members: updatedMembers, removedMembers: updatedRemovedMembers } },
    { new: true }
  );

  if (!updatedConv) {
    return new ApiResponse(500, null, t("FAILED_TO_ADD_MEMBERS", req.language || "en") as string);
  }

  const io = req.app.get("io");
  for (let member of members) {
    const isOnline = await redisPublisher.get(`user:${member}:online`);
    if (isOnline !== "1") {
      await redisPublisher.lPush(`offline:messages:${member}`, JSON.stringify({ type: "createConversation", data: { conv: updatedConv, users: allUsers } }));
      await redisPublisher.expire(`offline:messages:${member}`, 60 * 60 * 24 * 7); // 7 days
    }
    else {
      let memberSocketId = await redisPublisher.hGet("userSocketMap", member);
      if (memberSocketId) {
        io.to(JSON.parse(memberSocketId)).emit("chat:otherCreateConversation", { conv: updatedConv, users: allUsers });
      }
    }
  }

  const sendData = { conversationId, members: updatedMembers, removedMembers: updatedRemovedMembers, new: members, by: String(req.user.phone), timestamp, users };

  for (let member of updatedMembers) {
    if (member == req.user?.phone) continue;
    const isOnline = await redisPublisher.get(`user:${member}:online`);
    if (isOnline !== "1") {
      redisPublisher.lPush(`offline:messages:${member}`, JSON.stringify({ type: "updateConversationMembers", data: sendData }));
      await redisPublisher.expire(`offline:messages:${member}`, 60 * 60 * 24 * 7); // 7 days
    }
    else {
      let memberSocketId = await redisPublisher.hGet("userSocketMap", member);
      if (memberSocketId) {
        io.to(JSON.parse(memberSocketId)).emit("chat:updateConversationMembers", sendData);
      }
    }
    // if (members.includes(member)) {
    //   sendBasicFCMNotification(member, {
    //     senderId: String(req.user?.phone),
    //     title: `${updatedConv.name}`,
    //     content: `${req.user?.phone} added you to the group.`,
    //     type: "group_event"
    //   });
    // }
  }

  return new ApiResponse(200, sendData, t("MEMBERS_ADDED_SUCCESSFULLY", req.language || "en") as string);
});

// remove member from conversation
export const removeMembersInConversation = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, t("USER_NOT_FORUND", req.language || "en") as string);

  const { conversationId, member } = req.body;

  if (!conversationId || !member) return new ApiResponse(400, null, t("CONVERSATIONID_OR_MEMBER_IS_MISSING", req.language || "en") as string);

  const conversation = await Conversation.findById(conversationId);

  if (!conversation) return new ApiResponse(404, null, t("CONVERSATION_NOT_FOUND", req.language || "en") as string);
  if (conversation.type !== "group") return new ApiResponse(400, null, t("NOT_A_GROUP_CONVERSATION", req.language || "en") as string);
  if (!conversation.admins?.includes(req.user?.phone.toString())) return new ApiResponse(400, null, t("MEMBER_MUST_BE_ADMIN", req.language || "en") as string);

  let dataSendToMember = [...conversation.members];

  conversation.members = conversation.members.filter(m => m != member);
  conversation.removedMembers = Array.from(new Set([...conversation.removedMembers, member]));
  conversation.admins = conversation.admins.filter(m => m != member);
  await conversation.save();

  const sendData = { conversationId, members: conversation.members, removedMember: conversation.removedMembers, admins: conversation.admins, new: [member], by: String(req.user.phone) };

  const io = req.app.get("io");
  for (let m of dataSendToMember) {
    const isOnline = await redisPublisher.get(`user:${m}:online`);
    if (isOnline !== "1") {
      await redisPublisher.lPush(`offline:messages:${m}`, JSON.stringify({ type: "removeConversationMembers", data: sendData }));
      await redisPublisher.expire(`offline:messages:${m}`, 60 * 60 * 24 * 7); // 7 days
    }
    else {
      let memberSocketId = await redisPublisher.hGet("userSocketMap", m);
      if (memberSocketId) {
        io.to(JSON.parse(memberSocketId)).emit("chat:removeConversationMembers", sendData);
      }
    }
  }

  return new ApiResponse(200, sendData, t("CONVERSATION_MEMBER_UPDATED", req.language || "en") as string);

});

export const leaveConversation = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, t("USER_NOT_FORUND", req.language || "en") as string);

  const { conversationId } = req.params;

  if (!conversationId) return new ApiResponse(400, null, t("CONVERSATIONID_IS_MISSING", req.language || "en") as string);

  const conversation = await Conversation.findOneAndUpdate(
    { _id: conversationId, members: req.user.phone },
    {
      $pull: { members: req.user?.phone, admins: req.user?.phone },
      $addToSet: { removedMembers: req.user?.phone }
    },
    { new: true }
  )

  if (!conversation) {
    return res
      .status(404)
      .json(new ApiResponse(404, null, t("CONVERSATION_NOT_FOUND_OR_USER_NOT_A_MEMBER", req.language || "en") as string));
  }

  const sendData = {
    conversationId,
    member: String(req.user.phone)
  };

  const io = req.app.get("io");
  let memb = [String(req.user.phone), ...conversation.members]
  for (let m of memb) {
    const isOnline = await redisPublisher.get(`user:${m}:online`);

    if (isOnline !== "1") {
      await redisPublisher.lPush(`offline:messages:${m}`, JSON.stringify({ type: "leaveConversationMembers", data: sendData }));
      await redisPublisher.expire(`offline:messages:${m}`, 60 * 60 * 24 * 7); // 7 days
    }
    else {
      let memberSocketId = await redisPublisher.hGet("userSocketMap", m);
      if (memberSocketId) {
        io.to(JSON.parse(memberSocketId)).emit("chat:leaveConversationMembers", sendData);
      }
    }
  }

  return new ApiResponse(200, null, t("MEMBER_REMOVED_FROM_CONVERSATION", req.language || "en") as string);
});

// Disappearing Messages
export const setDisappearingMessages = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, t("USER_NOT_FORUND", req.language || "en") as string);

  try {
    const { conversationId, duration, timestamp } = req.body;
    if (!conversationId || !duration) return new ApiResponse(400, null, t("CONVERSATIONID_AND_DURATION_IS_REQUIRED", req.language || "en") as string);

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

    if (!conv) return new ApiResponse(404, null, t("CONVERSATION_NOT_FOUND", req.language || "en") as string);

    if (duration == '0s') {
      await redisPublisher.del(`chatMsg:${conversationId}:disappearingMessages`);
      await redisPublisher.del(`chatMsg:${conversationId}:disappearingMessages:ttl`);
    } else {
      await redisPublisher.set(`chatMsg:${conversationId}:disappearingMessages`, convertToSeconds(duration));
      await redisPublisher.expire(`chatMsg:${conversationId}:disappearingMessages`, convertToSeconds(duration));
      await redisPublisher.set(`chatMsg:${conversationId}:disappearingMessages:ttl`, convertToSeconds(duration));
    }

    await redisPublisher.publish(`update-disappearing-messages`, JSON.stringify({ conversationId, duration, username: req.user.phone, "timestamp": timestamp }));

    return new ApiResponse(200, null, t("DISAPPEARING_MESSAGES_UPDATED_SUCCEFULLY", req.language || "en") as string);
  }
  catch {
    return new ApiResponse(500, null, t("SERVER_ERROR", req.language || "en") as string);
  }

});

// Destructing Messages
export const setDestructingMessages = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, t("USER_NOT_FORUND", req.language || "en") as string);

  try {
    const { conversationId, duration, timestamp } = req.body;
    if (!conversationId || !duration) return new ApiResponse(400, null, t("CONVERSATIONID_AND_DURATION_IS_REQUIRED", req.language || "en") as string);

    const conv = await Conversation.findOne(
      { _id: conversationId, members: req.user.phone }
    );

    if (!conv) return new ApiResponse(404, null, t("CONVERSATION_NOT_FOUND", req.language || "en") as string);

    if (duration == '0s') {
      await redisPublisher.del(`chatMsg:${conversationId}:destructingMessages`);
      await redisPublisher.del(`chatMsg:${conversationId}:destructingMessages:data`);
    } else {
      await redisPublisher.set(`chatMsg:${conversationId}:destructingMessages`, convertToSeconds(duration));
      await redisPublisher.expire(`chatMsg:${conversationId}:destructingMessages`, convertToSeconds(duration));
      await redisPublisher.set(`chatMsg:${conversationId}:destructingMessages:data`, JSON.stringify({ "senderId": String(req.user.phone), "ttl": convertToSeconds(duration), "timestamp": timestamp }));
    }

    return new ApiResponse(200, null, t("DESTRUCTING_MESSAGES_UPDATED_SUCCEFULLY", req.language || "en") as string);
  }
  catch {
    return new ApiResponse(500, null, t("SERVER_ERROR", req.language || "en") as string);
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
  if (!req.user) return new ApiResponse(401, null, t("USER_NOT_FORUND", req.language || "en") as string);
  const { conversationId, member, add = true } = req.body;

  if (!conversationId || !member) return new ApiResponse(400, null, t("CONVERSATIONID_OR_MEMBER_MISSING", req.language || "en") as string);

  try {
    const updateQuery = add
      ? { $addToSet: { admins: member } }
      : { $pull: { admins: member } };

    const updated = await Conversation.findOneAndUpdate(
      { _id: conversationId },
      updateQuery,
      { new: true }
    )

    if (!updated) return new ApiResponse(404, null, t("CONVERSATION_NOT_FOUND", req.language || "en") as string);

    const sendData = { conversationId, admins: updated.admins };

    const io = req.app.get("io");
    for (let m of updated.members) {
      if (m == req.user?.phone) continue;
      const isOnline = await redisPublisher.get(`user:${m}:online`);
      if (isOnline !== "1") {
        await redisPublisher.lPush(`offline:messages:${m}`, JSON.stringify({ type: "updateGroupAdmins", data: sendData }));
        await redisPublisher.expire(`offline:messages:${m}`, 60 * 60 * 24 * 7); // 7 days
      }
      else {
        let memberSocketId = await redisPublisher.hGet("userSocketMap", m);
        if (memberSocketId) {
          io.to(JSON.parse(memberSocketId)).emit("chat:updateGroupAdmins", sendData);
        }
      }
    }

    return new ApiResponse(200, sendData, add ? t("ADMIN_ADDED", req.language || "en") as string : t("ADMIN_REMOVED", req.language || "en") as string);
  }
  catch {
    return new ApiResponse(500, null, t("SERVER_ERROR", req.language || "en") as string);
  }
});

// add/edit group description
export const addEditDescription = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, t("USER_NOT_FORUND", req.language || "en") as string);

  const { conversationId, desc } = req.body;

  if (!conversationId || !desc) return new ApiResponse(400, null, t("CONVERSATIONID_OR_DESC_MISSING", req.language || "en") as string);

  const conversation = await Conversation.findById(conversationId);

  if (!conversation) return new ApiResponse(404, null, t("CONVERSATION_NOT_FOUND", req.language || "en") as string);
  if (conversation.type !== "group") return new ApiResponse(400, null, t("NOT_A_GROUP_CONVERSATION", req.language || "en") as string);

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
  return new ApiResponse(200, null, t("GROUP_DESCRIPTION_UPDATED", req.language || "en") as string);
});

// block user
export const blockUser = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, t("USER_NOT_FORUND", req.language || "en") as string);

  const { no, conversationId } = req.body;

  if (!no) return new ApiResponse(401, null, t("NUMBER_NOT_FORUND", req.language || "en") as string);

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
      ).select("-_id blockedPhones")

      await redisClient.del(`blocked:phones:${req.user?.phone}`);
      await redisClient.sAdd(`blocked:phones:${req.user?.phone}`, (blocked?.blockedPhones ?? [])?.map(String));

      const isOnline = await redisPublisher.get(`user:${no}:online`);
      if (isOnline !== "1") {
        await redisPublisher.lPush(`offline:messages:${no}`, JSON.stringify({ type: "blockUser", data: { conversationId, hitBy: req.user?.phone, type: "block" } }));
        await redisPublisher.expire(`offline:messages:${no}`, 60 * 60 * 24 * 7); // 7 days
      }
      else {
        let otherSocketId = await redisPublisher.hGet("userSocketMap", no);
        if (otherSocketId) {
          const io = req.app.get("io");
          io.to(JSON.parse(otherSocketId)).emit("chat:blockUser", { conversationId, hitBy: req.user?.phone, type: "block" });
        }
      }

      return new ApiResponse(data.statusCode || 200, null, data.message || t("USER_BLOCKED_SUCCESSFULLY", req.language || "en") as string);
    }
    return new ApiResponse(data.statusCode || 500, null, data.message || t("FAILED_TO_BLOCK_USER", req.language || "en") as string);
  }
  catch (err: any) {
    console.error("Block User Error:", err)
    return new ApiResponse(500, null, t("FAILED_TO_BLOCK_USER", req.language || "en") as string);
  }

});

// unblock user
export const unblockUser = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, t("USER_NOT_FORUND", req.language || "en") as string);

  const { no, conversationId } = req.body;

  if (!no) return new ApiResponse(401, null, t("NUMBER_NOT_FORUND", req.language || "en") as string);

  try {

    const conv = await Conversation.findOne(
      { _id: conversationId, blocked: true }
    ).select("blockedBy blocked");

    if (!conv) return new ApiResponse(200, null, t("CONVERSATION_IS_NOT_BLOCKED", req.language || "en") as string);

    if (!conv.blockedBy?.includes(req.user?.phone)) return new ApiResponse(200, null, t("CONVERSATION_BLOCK_NOT_APPLY", req.language || "en") as string);

    let data = await unblockContacts(req.user?.phone, no);
    if (data.success) {
      conv.blockedBy = conv.blockedBy.filter((block: any) => block != req.user?.phone)
      if (conv.blockedBy.length == 0) {
        conv.blocked = false;
      }
      conv.save();

      const blocked = await AllFriendsContact.findOneAndUpdate(
        { phone: req.user?.phone },
        {
          $pull: { blockedPhones: no }
        },
        {
          new: true
        }
      ).select("-_id blockedPhones")

      if (data.data?.blockedNo?.length > 0) {
        await redisClient.del(`blocked:phones:${req.user?.phone}`);
        await redisClient.sAdd(`blocked:phones:${req.user?.phone}`, (blocked?.blockedPhones || [])?.map(String));
      }
      else {
        await redisClient.del(`blocked:phones:${req.user?.phone}`);
      }

      const isOnline = await redisPublisher.get(`user:${no}:online`);
      if (isOnline !== "1") {
        await redisPublisher.lPush(`offline:messages:${no}`, JSON.stringify({ type: "blockUser", data: { conversationId, hitBy: req.user?.phone, type: "unblock" } }));
        await redisPublisher.expire(`offline:messages:${no}`, 60 * 60 * 24 * 7); // 7 days
      }
      else {
        let otherSocketId = await redisPublisher.hGet("userSocketMap", no);
        if (otherSocketId) {
          const io = req.app.get("io");
          io.to(JSON.parse(otherSocketId)).emit("chat:blockUser", { conversationId, hitBy: req.user?.phone, type: "unblock" });
        }
      }

      return new ApiResponse(data.statusCode || 200, null, data.message || t("USER_UNBLOCKED_SUCCESSFULLY", req.language || "en") as string);
    }
    return new ApiResponse(400, null, t("FAILED_TO_UNBLOCK_USER", req.language || "en") as string);
  }
  catch (err: any) {
    console.error("Block User Error:", err)
    return new ApiResponse(500, null, t("FAILED_TO_UNBLOCK_USER", req.language || "en") as string);
  }
});

// get blocked user
export const getBlockedUser = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, t("USER_NOT_FORUND", req.language || "en") as string);

  try {
    let data = await AllFriendsContact.findOne({ phone: req.user?.phone });
    if (data) {
      await redisClient.del(`blocked:phones:${req.user?.phone}`);
      await redisClient.sAdd(`blocked:phones:${req.user?.phone}`, data.blockedPhones?.map(String));
      return new ApiResponse(200, { blockedNo: data.blockedPhones || [] }, t("FETCH_BLOCKED_USER_SUCCESSFULLY", req.language || "en") as string);
    }
    return new ApiResponse(404, null, t("FAILED_TO_FETCH_BLOCKED_USER", req.language || "en") as string);
  }
  catch (err: any) {
    console.error("Block User Error:", err)
    return new ApiResponse(500, null, t("FAILED_TO_FETCH_BLOCKED_USER", req.language || "en") as string);
  }
});

export const setMsgDeliveryIos = asyncHandler(async (req: Request, res: Response) => {
  const { conversationId, messageIds, username, timestamp } = req.body;
  if (!Array.isArray(messageIds) || messageIds.length == 0 || !conversationId) return new ApiResponse(400, null, t("CONVERSATIONID_OR_MESSAGEIDS_ARE_MISSING", req.language || "en") as string);

  for (let messageId of messageIds) {
    const event = {
      messageId,
      updatedStatus: "delivered",
      conversationId,
      username,
      timestamp,
    };
    await redisPublisher.publish("chat-messages-status", JSON.stringify(event));
  }

  return new ApiResponse(200, null, t("MESSAGE_STATUS_UPDATED", req.language || "en") as string);
});

export const getOfflineMessages = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, t("USER_NOT_FORUND", req.language || "en") as string);

  const offlineMessages = await redisPublisher.lRange(`offline:messages:${req.user.phone.toString()}`, 0, -1);

  // const messages = offlineMessages.map(msg => JSON.parse(msg));
  const parsed = offlineMessages.map(msg => JSON.parse(msg));

  // Group keys go last: the client reverses this list, so they get processed first and the
  // key is in place before the group messages are decrypted
  const messages = [
    ...parsed.filter(msg => msg?.type !== "groupKeyChat"),
    ...parsed.filter(msg => msg?.type === "groupKeyChat"),
  ];
  return new ApiResponse(200, messages, t("OFFLINE_MESSAGES_FETCHED", req.language || "en") as string);
});

export const clearOfflineMessages = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, t("USER_NOT_FORUND", req.language || "en") as string);

  await redisPublisher.del(`offline:messages:${req.user.phone.toString()}`);
  return new ApiResponse(200, null, t("OFFLINE_MESSAGES_CLEARED", req.language || "en") as string);
});

export const getChatMessagesOutSideIOS = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, t("USER_NOT_FORUND", req.language || "en") as string);

  const { data } = req.body;

  const {
    messageId,
    conversationId,
    senderId,
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

  if (!conversationId) return new ApiResponse(400, null, t("CONVERSATIONID_IS_MISSING", req.language || "en") as string);

  let otherMember = await getConversationMembers(conversationId) || [];
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

  return new ApiResponse(200, null, t("MESSAGE_SENT", req.language || "en") as string);
});

export const getMembersDetails = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, t("USER_NOT_FORUND", req.language || "en") as string);

  const { number } = req.params;

  if (!number) return new ApiResponse(400, null, t("USER_NOT_FORUND", req.language || "en") as string);

  const membersList = [number.toString()];
  const users = await getUserInfoFun(membersList);

  return new ApiResponse(200, users, t("USER_DETAILS_FOUND", req.language || "en") as string);

});

/////// web hooks //////
export const generateMoneyRequest = asyncHandler(async (req: Request, res: Response) => {
  const { data } = req.body;

  if (!data) return new ApiResponse(400, null, t("PAYLOAD_IS_MISSING", req.language || "en") as string);

  // const conversation = await Conversation.findOne({
  //   members: { $in: [payload.creator_phone, payload.receiver_phone], type: "single" }
  // });
  const conversation = await Conversation.findOne({
    type: "single",
    members: { $all: [data.creator_phone, data.receiver_phone], $size: 2 },
  });

  let friendsData = await AllFriendsContact.findOne({
    phone: data.creator_phone
  });
  const isFriend = friendsData?.contacts.some((c: any) => c.phone == String(data.receiver_phone));

  if (isFriend && conversation) {
    const messageId = new mongoose.Types.ObjectId()
    const eventObj = {
      messageId,
      conversationId: conversation._id,
      senderId: data.creator_phone,
      content: data,
      status: "delivered",
      messageType: "money_request",
      timestamp: new Date(),
    };
    await Conversation.findByIdAndUpdate(conversation._id, {
      $set: {
        updatedAt: new Date(),
        lastMessageId: messageId,
        lastMessage: "money request",
        lastMessageStatus: "delivered",
        lastMessageType: "money_request",
        lastMessageDate: new Date(),
        lastMessageSenderId: data.creator_phone
      },
    });

    const isOnline = await redisPublisher.get(`user:${data.receiver_phone.toString()}:online`);
    if (isOnline !== "1") {
      await redisPublisher.lPush(`offline:messages:${data.receiver_phone.toString()}`, JSON.stringify({ type: "chatMassage", data: eventObj }));
      await redisPublisher.expire(`offline:messages:${data.receiver_phone.toString()}`, 60 * 60 * 24 * 7); // 7 days
    }
    else {
      let otherSocketId = await redisPublisher.hGet("userSocketMap", data.receiver_phone.toString());
      if (otherSocketId) {
        const io = req.app.get("io");
        io.to(JSON.parse(otherSocketId)).emit("chat:recv-message", eventObj);
      }
    }
  }
  return new ApiResponse(200, null, t("CONVERSATION_UPDATED", req.language || "en") as string);
});

export const generateNotifyNewLogin = asyncHandler(async (req: Request, res: Response) => {
  const { data, language = "en" } = req.body;

  if (!data) return new ApiResponse(400, null, t("PAYLOAD_IS_MISSING", language) as string);

  const io = req.app.get("io");
  const isOnline = await redisPublisher.get(`user:${String(data.phone)}:online`);
  if (isOnline !== "1") {
    let memberSocketId = null;
    if (data.app_code == 'NG_TBA') {
      memberSocketId = await redisPublisher.hGet("userSocketMap:role:taxi", String(data.phone));
    }
    else {
      memberSocketId = await redisPublisher.hGet("userSocketMap", String(data.phone));
    }
    await redisPublisher.lPush(`offline:newLogin:${String(data.phone)}`, JSON.stringify({ type: "updateNewLogin", data: { logout: data.logout, deviceId: data.deviceId, app_code: data.app_code }, socketIds: memberSocketId }));
    await redisPublisher.expire(`offline:newLogin:${String(data.phone)}`, 60 * 60 * 24 * 7); // 7 days
  }
  else {
    let memberSocketId = null;
    if (data.app_code == 'NG_TBA') {
      memberSocketId = await redisPublisher.hGet("userSocketMap:role:taxi", String(data.phone));
    }
    else {
      memberSocketId = await redisPublisher.hGet("userSocketMap", String(data.phone));
    }
    if (memberSocketId) {
      io.to(JSON.parse(memberSocketId)).emit("chat:updateNewLogin", { logout: data.logout, deviceId: data.deviceId, app_code: data.app_code });
    }
  }

  if(data.logout == true) {
    await sendBasicFCMNotification(String(data.phone), {
      senderId: String(data.phone),
      title: t("NEW_LOGIN", language) as string,
      content: t("YOU_HAVE_A_NEW_LOGIN_ON_ANOTHER_DEVICE", language) as string,
      type: "new_login",
      extraData: {
        logout: data.logout,
        deviceId: data.deviceId,
        app_code: data.app_code
      }
    });
  }

  return new ApiResponse(200, null, t("NEW_LOGIN_UPDATED", language) as string);
});

export const contactsRefrashController = asyncHandler(async (req: Request, res: Response) => {
  const { data } = req.body;

  if (!data.phone) {
    return new ApiResponse(404, null, "Phone No Not Found.");
  }

  let contactsData = await AllFriendsContact.findOne({
    phone: data.phone
  }).lean();
  if (!contactsData) {
    return new ApiResponse(404, null, "Contacts Not Found.");
  }

  const io = req.app.get("io");
  for (let contact of contactsData.contacts) {
    if (String(data.phone) == String(contact.phone)) continue;
    const isOnline = await redisPublisher.get(`user:${String(contact.phone)}:online`);
    if (isOnline !== "1") {
      let memberSocketId = await redisPublisher.hGet("userSocketMap", String(contact.phone));
      await redisPublisher.lPush(`offline:newLogin:${String(contact.phone)}`, JSON.stringify({ type: "updateContactsList", data: { phone: String(data.phone) }, socketIds: memberSocketId }));
      await redisPublisher.expire(`offline:newLogin:${String(contact.phone)}`, 60 * 60 * 24 * 7); // 7 days
    }
    else {
      let memberSocketId = await redisPublisher.hGet("userSocketMap", String(contact.phone));
      if (memberSocketId) {
        io.to(JSON.parse(memberSocketId)).emit("chat:updateContactsList", { phone: String(data.phone) });
      }
    }
  }

  return new ApiResponse(200, null, "contact updated successfully.");
});

/////////////////////user info update/////////////////////
export const getUserInfoFun = async (phones: string[]) => {
  const users = await getUsersByPhones(phones);
  const userMap = new Map(users.map((user: any) => [String(user.phone), user]));

  const response = await Promise.all(
    phones?.map(async (phone) => {
      const user: any = userMap.get(phone);
      let wallets: Record<string, string | null> = {};
      if (user?._id) {
        const result = await getWalletsByUserId(String(user._id));
        if (result && typeof result === "object") {
          const walletValue = Object.values(result)[0] ?? null;
          wallets = { walletId: walletValue };
        }
      }
      return {
        name: user ? `${user.first_name} ${user.last_name}` : null,
        phone,
        userId: user ? String(user._id) : null,
        full_name: user ? `${user.first_name} ${user.last_name}` : null,
        profile_image: user?.profile_image || null,
        email: user?.email || null,
        isOnboarded: !!user,
        wallets,
        identity_verification_status: user?.identity_verification_status || null
      };
    }),
  );
  return response;
}
