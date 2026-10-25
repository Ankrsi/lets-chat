import { Router } from "express";
import { verifyUser } from "../middlewares/verifyUser";
import { uploadImage, uploadStatus } from "../middlewares/upload.middeware";
import {
  addEditDescription,
  addMembersInConversation,
  addRemoveAdmin,
  blockUser,
  clearOfflineMessages,
  contactsRefrashController,
  createConversation,
  generateNotifyNewLogin,
  getBlockedUser,
  getChatMessagesOutSideIOS,
  getGroupConversation,
  getMembersDetails,
  getOfflineMessages,
  getPresignedUrlInChat,
  leaveConversation,
  removeMembersInConversation,
  setDestructingMessages,
  setDisappearingMessages,
  setMsgDeliveryIos,
  unblockUser,
  updateGroupProfileName,
} from "../controllers/chats/chats.controller";
import { verifyInternalRequest } from "../middlewares/internal-auth.middleware";
import { validate } from "../middlewares/validate";
import { conversationSchema } from "../validations/conversationSchema";
import { setDisappearingMessagesSchema } from "../validations/setDisappearingMessagesSchema";
import { statusPrivacySchema } from "../validations/statusPrivacySchema";
import { setDestructingMessagesSchema } from "../validations/setDestructingMessagesSchema";
import { blockUserSchema } from "../validations/blockUserSchema";
import { unblockUserSchema } from "../validations/unblockUserSchema";
import { addMembersInConversationSchema } from "../validations/addMembersInConversationSchema";
import { removeMembersInConversationSchema } from "../validations/removeMembersInConversationSchema";
import { addRemoveAdminSchema } from "../validations/addRemoveAdminSchema";
import { addEditDescriptionSchema } from "../validations/addEditDescriptionSchema";
import { addStatus, getAllStatus, getStatusPrivecy, markStatusAsViewed, removeStatus, statusPrivecy } from "../controllers/chats/status.controller";

const router = Router();

router.post(
  "/getPresignedUrl",
  verifyUser,
  getPresignedUrlInChat,
)

///// New Conversation/status Routes /////

router.post(
  "/createConversations",
  verifyUser,
  uploadImage.single("image"),
  validate(conversationSchema),
  createConversation,
);

router.get(
  "/getGroupConversation",
  verifyUser,
  getGroupConversation,
);

router.post(
  "/updateGroupProfileName",
  verifyUser,
  uploadImage.single("image"),
  updateGroupProfileName,
);

router.post(
  "/addMembersInConversation",
  verifyUser,
  validate(addMembersInConversationSchema),
  addMembersInConversation,
);

router.post(
  "/removeMembersInConversation",
  verifyUser,
  validate(removeMembersInConversationSchema),
  removeMembersInConversation,
);

router.get(
  "/leaveConversation/:conversationId",
  verifyUser,
  leaveConversation,
);

router.post(
  "/addRemoveAdmin",
  verifyUser,
  validate(addRemoveAdminSchema),
  addRemoveAdmin,
);

router.post(
  "/addEditDescription",
  verifyUser,
  validate(addEditDescriptionSchema),
  addEditDescription,
);

router.post(
  "/addStatus",
  // captions, files
  verifyUser,
  uploadStatus.any(),
  addStatus
);

router.post(
  "/removeStatus",
  verifyUser,
  removeStatus
);

router.get(
  "/getAllStatus",
  verifyUser,
  getAllStatus,
);

router.get(
  "/markStatusAsViewed/:statusId",
  verifyUser,
  markStatusAsViewed,
);

router.post(
  "/statusPrivecy",
  verifyUser,
  validate(statusPrivacySchema),
  statusPrivecy,
);

router.get(
  "/getStatusPrivecy",
  verifyUser,
  getStatusPrivecy,
);

router.post(
  "/setDisappearingMessages",
  verifyUser,
  validate(setDisappearingMessagesSchema),
  setDisappearingMessages
);

router.post(
  "/setDestructingMessages",
  verifyUser,
  validate(setDestructingMessagesSchema),
  setDestructingMessages
);

router.post(
  "/blockUser",
  verifyUser,
  validate(blockUserSchema),
  blockUser,
);

router.post(
  "/unblockUser",
  verifyUser,
  validate(unblockUserSchema),
  unblockUser,
);

router.get(
  "/getblockedUser",
  verifyUser,
  getBlockedUser,
);

router.post(
  "/setMsgDeliveryIos",
  verifyUser,
  setMsgDeliveryIos,
);

router.get(
  "/getOfflineMessages",
  verifyUser,
  getOfflineMessages,
);

router.get(
  "/clearOfflineMessages",
  verifyUser,
  clearOfflineMessages,
);

router.post(
  "/getChatMessagesOutside",
  verifyUser,
  getChatMessagesOutSideIOS,
);

router.get(
  "/getMembersDetails/:number",
  verifyUser,
  getMembersDetails,
);

/////// internal hooks /////////
router.post(
  "/notifyNewLogin",
  verifyInternalRequest,
  generateNotifyNewLogin,
);

router.post(
  "/contactsRefrash",
  verifyInternalRequest,
  contactsRefrashController,
);

export default router;
