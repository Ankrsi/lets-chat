import { Router } from "express";
import { verifyUser } from "../middlewares/verifyUser";
import { 
  // uploadDocument, 
  uploadImage, 
  uploadStatus, 
  // uploadVideo, 
  // uploadVoice 
} from "../middlewares/upload.middeware";
import {
  addEditDescription,
  addMembersInConversation,
  addRemoveAdmin,
  blockUser,
  clearOfflineMessages,
  contactsRefrashController,
  // chatIds,
  createConversation,
  generateMoneyRequest,
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
  // getChatMessages,
  unblockUser,
  updateGroupProfileName,
  // uploadAudioInChat,
  // getLastMessages,
  // uploadDocInChat,
  // uploadImageInChat,
  // uploadVideoInChat,
  // uploadVoiceInChat,
} from "../controllers/chats/chats.controller";
import { taxiCreateConversation } from "../controllers/chats/taxiChats.controller";
import { verifyInternalRequest } from "../middlewares/internal-auth.middleware";
import { botCreateConversation } from "../controllers/chats/botChats.controller";
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
import { taxiConversationSchema } from "../validations/taxiConversationSchema";
import { addStatus, getAllStatus, getStatusPrivecy, markStatusAsViewed, removeStatus, statusPrivecy } from "../controllers/chats/status.controller";

const router = Router();

router.post(
  "/getPresignedUrl",
  verifyUser,
  getPresignedUrlInChat,
)

// router.post(
//   "/upload-image",
//   /*  #swagger.consumes: ['multipart/form-data'],
//       #swagger.produces = ['application/json']
//       #swagger.parameters['messageId'] ={
//         "in": "formData",
//         "required": true,
//         "type": "string"
//       }
//       #swagger.parameters['conversationId'] ={
//         "in": "formData", 
//         "required": true,
//         "type": "string"
//       }
//       #swagger.parameters['senderId'] ={
//         "in": "formData",
//         "required": true,
//         "type": "string"
//       }
//       #swagger.parameters['messageType'] ={
//         "in": "formData",
//         "required": true,
//         "type": "string"
//       }
//       #swagger.parameters['timestamp'] ={
//         "in": "formData",
//         "required": true,
//         "type": "string"
//       }
//       #swagger.parameters['image'] = {
//         "in": "formData",
//         "description": "file to upload",
//         "required": true,
//         "type": "file"
//       }
//   */
//   verifyUser,
//   uploadImage.array("image", 10),
//   uploadImageInChat,
// );

// router.post(
//   "/upload-document",
//   /*  #swagger.consumes: ['multipart/form-data'],
//       #swagger.produces = ['application/json']
//       #swagger.parameters['messageId'] ={
//         "in": "formData",
//         "required": true,
//         "type": "string"
//       }
//       #swagger.parameters['conversationId'] ={
//         "in": "formData",
//         "required": true,
//         "type": "string"
//       }
//       #swagger.parameters['senderId'] ={
//         "in": "formData",
//         "required": true,
//         "type": "string"
//       }
//       #swagger.parameters['messageType'] ={
//         "in": "formData",
//         "required": true,
//         "type": "string"
//       }
//       #swagger.parameters['timestamp'] ={
//         "in": "formData",
//         "required": true,
//         "type": "string"
//       }
//       #swagger.parameters['document'] = {
//         "in": "formData",
//         "description": "file to upload",
//         "required": true,
//         "type": "file"
//       }
//   */
//   verifyUser,
//   uploadDocument.single("document"),
//   uploadDocInChat,
// );

// router.post(
//   "/upload-voice",
//   /*  #swagger.consumes: ['multipart/form-data'],
//       #swagger.produces = ['application/json']
//       #swagger.parameters['messageId'] ={
//         "in": "formData",
//         "required": true,
//         "type": "string"
//       }
//       #swagger.parameters['conversationId'] ={
//         "in": "formData",
//         "required": true,
//         "type": "string"
//       }
//       #swagger.parameters['senderId'] ={
//         "in": "formData",
//         "required": true,
//         "type": "string"
//       }
//       #swagger.parameters['messageType'] ={
//         "in": "formData",
//         "required": true,
//         "type": "string"
//       }
//       #swagger.parameters['timestamp'] ={
//         "in": "formData",
//         "required": true,
//         "type": "string"
//       }
//       #swagger.parameters['duration'] ={
//         "in": "formData",
//         "required": true,
//         "type": "string"
//       }
//       #swagger.parameters['voice'] = {
//         "in": "formData",
//         "description": "file to upload",
//         "required": true,
//         "type": "file"
//       }
//   */
//   verifyUser,
//   uploadVoice.single("voice"),
//   uploadVoiceInChat,
// );

// router.post(
//   "/upload-audio",
//   /*  #swagger.consumes: ['multipart/form-data'],
//       #swagger.produces = ['application/json']
//       #swagger.parameters['messageId'] ={
//         "in": "formData",
//         "required": true,
//         "type": "string"
//       }
//       #swagger.parameters['conversationId'] ={
//         "in": "formData",
//         "required": true,
//         "type": "string"
//       }
//       #swagger.parameters['senderId'] ={
//         "in": "formData",
//         "required": true,
//         "type": "string"
//       }
//       #swagger.parameters['messageType'] ={
//         "in": "formData",
//         "required": true,
//         "type": "string"
//       }
//       #swagger.parameters['timestamp'] ={
//         "in": "formData",
//         "required": true,
//         "type": "string"
//       }
//       #swagger.parameters['duration'] ={
//         "in": "formData",
//         "required": true,
//         "type": "string"
//       }
//       #swagger.parameters['audio'] = {
//         "in": "formData",
//         "description": "file to upload",
//         "required": true,
//         "type": "file"
//       }
//   */
//   verifyUser,
//   uploadVoice.single("audio"),
//   uploadAudioInChat,
// );

// router.post(
//   "/upload-video",
//   /*  #swagger.consumes: ['multipart/form-data'],
//       #swagger.produces = ['application/json']
//       #swagger.parameters['messageId'] ={
//         "in": "formData",
//         "required": true,
//         "type": "string"
//       }
//       #swagger.parameters['conversationId'] ={
//         "in": "formData",
//         "required": true,
//         "type": "string"
//       }
//       #swagger.parameters['senderId'] ={
//         "in": "formData",
//         "required": true,
//         "type": "string"
//       }
//       #swagger.parameters['messageType'] ={
//         "in": "formData",
//         "required": true,
//         "type": "string"
//       }
//       #swagger.parameters['timestamp'] ={
//         "in": "formData",
//         "required": true,
//         "type": "string"
//       }
//       #swagger.parameters['duration'] ={
//         "in": "formData",
//         "required": true,
//         "type": "string"
//       }
//       #swagger.parameters['video'] = {
//         "in": "formData",
//         "description": "file to upload",
//         "required": true,
//         "type": "file"
//       }
//   */
//   verifyUser,
//   uploadVideo.array("video", 10),
//   uploadVideoInChat,
// );

///// New Conversation/status Routes /////

router.post(
  "/createConversations",
  /*
    #swagger.consumes: ['multipart/form-data'],
    #swagger.produces = ['application/json']
    #swagger.parameters['type'] ={
      "in": "formData",
      "required": true,
      "type": "string"
    }
    #swagger.parameters['memberIds'] = {
      "in": "formData",
      "required": true,
      "type": "string"
    }
    #swagger.parameters['name'] = {
      "in": "formData",
      "required": true,
      "type": "string"
    },
    #swagger.parameters['image'] = {
      "in": "formData",
      "description": "file to upload",
      "required": true,
      "type": "file"
    }
  */
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
  /*
    #swagger.consumes: ['multipart/form-data'],
    #swagger.produces = ['application/json']
    #swagger.parameters['conversationId'] ={
      "in": "formData",
      "required": true,
      "type": "string"
    }
    #swagger.parameters['name'] = {
      "in": "formData",
      "required": false,
      "type": "string"
    }
    #swagger.parameters['image'] = {
      "in": "formData",
      "description": "file to upload",
      "required": false,
      "type": "file"
    }
  */
  verifyUser,
  uploadImage.single("image"),
  updateGroupProfileName,
);

router.post(
  "/addMembersInConversation",
  /*
    #swagger.parameters['body'] = {
      in: 'body',
      required: true,
      schema: {
        conversationId: "conversationId",
        members: "[919832xxx,91533xxxxx]"
      }
    }
  */
  verifyUser,
  validate(addMembersInConversationSchema),
  addMembersInConversation,
);

router.post(
  "/removeMembersInConversation",
  /*
    #swagger.parameters['body'] = {
      in: 'body',
      required: true,
      schema: {
        conversationId: "userId",
        member: "919832xxx"
      }
    }
  */
  verifyUser,
  validate(removeMembersInConversationSchema),
  removeMembersInConversation,
);

router.get(
  "/leaveConversation/:conversationId",
  /*
    #swagger.parameters['conversationId'] = {
      in: 'path',
      required: true,
      type: 'string'
    }
  */
  verifyUser,
  leaveConversation,
);

router.post(
  "/addRemoveAdmin",
  /*
    #swagger.parameters['body'] = {
      in: 'body',
      required: true,
      schema: {
        conversationId: "conversationId",
        member: "member",
        add: true/false
      }
    }
  */
  verifyUser,
  validate(addRemoveAdminSchema),
  addRemoveAdmin,
);

router.post(
  "/addEditDescription",
  /*  #swagger.parameters['body'] = {
        in: 'body',
        required: true,
        schema: {
          conversationId: "conversationId",
          desc: "description"
        }
      }
  */
  verifyUser,
  validate(addEditDescriptionSchema),
  addEditDescription,
);

router.post(
  "/addStatus",
  // captions, files
  /*#swagger.consumes: ['multipart/form-data'],
    #swagger.produces = ['application/json']
    #swagger.parameters['captions'] ={
      "in": "formData",
      "required": true,
      "type": "array",
      "collectionFormat": "multi",
      "items": { "type": "string" }
    }
    #swagger.parameters['files'] = {
      "in": "formData",
      "description": "files to upload",
      "required": true,
      "type": "array",
      "collectionFormat": "multi",
      "items": { "type": "file" }
    }
  */
  verifyUser,
  uploadStatus.any(),
  addStatus
);

router.post(
  "/removeStatus",
  /*  #swagger.parameters['body'] = {
        in: 'body',
        required: true,
        schema: {
          storyId: "xyz"
        }
      }
  */
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
  /*  #swagger.parameters['body'] = {
        in: 'body',
        required: true,
        schema: {
          phoneNumbers: ["9198xxxxxx","9153xxxxxx"],
          type: "my_contacts_except/only_share_with/my_contacts"
        }
      }
  */
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
  /*  #swagger.parameters['body'] = {
        in: 'body',
        required: true,
        schema: {
          conversationId: "conversationId",
          duration: "0s/24h/7d"
        }
      }
  */
  verifyUser,
  validate(setDisappearingMessagesSchema),
  setDisappearingMessages
);

router.post(
  "/setDestructingMessages",
  /*  #swagger.parameters['body'] = {
        in: 'body',
        required: true,
        schema: {
          conversationId: "conversationId",
          duration: "0s/24h/7d"
        }
      }
  */
  verifyUser,
  validate(setDestructingMessagesSchema),
  setDestructingMessages
);

router.post(
  "/blockUser",
  /*  #swagger.parameters['body'] = {
        in: 'body',
        required: true,
        schema: {
          no: "9198xxxxxx",
          conversationId: "conversationId"
        }
      }
  */
  verifyUser,
  validate(blockUserSchema),
  blockUser,
);

router.post(
  "/unblockUser",
  /*  #swagger.parameters['body'] = {
        in: 'body',
        required: true,
        schema: {
          no: "9198xxxxxx",
          conversationId: "conversationId"
        }
      }
  */
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

/////// taxi chat routes ///////

router.post(
  "/taxiCreateConversation",
  /* #swagger.parameters['body'] = {
        in: 'body',
        required: true,
        schema: {
          memberIds: ["9198xxxxxx","9153xxxxxx"],
          bookingId: "bookingId"
        }
      }
  */
  verifyUser,
  validate(taxiConversationSchema),
  taxiCreateConversation,
);

/////// bot chat routes ///////

router.get(
  "/botCreateConversation",
  verifyUser,
  botCreateConversation,
);

/////// web hooks /////////
router.post(
  "/generateMoneyRequest",
  /* #swagger.ignore = true */
  verifyInternalRequest,
  generateMoneyRequest,
);

router.post(
  "/notifyNewLogin",
  /* #swagger.ignore = true */
  verifyInternalRequest,
  generateNotifyNewLogin,
);

router.post(
  "/contactsRefrash",
  /* #swagger.ignore = true */
  verifyInternalRequest,
  contactsRefrashController,
);

export default router;
