import { Router } from "express";
import rateLimit from "express-rate-limit";
import { verifyUser } from "../middlewares/verifyUser";
import { verifyInternalRequest } from "../middlewares/internal-auth.middleware";
import { validate } from "../middlewares/validate";
import { uploadProfileImage } from "../middlewares/upload.middleware";
import {
  blockSchema,
  changeUsernameSchema,
  deviceTokensSchema,
  disableTwoStepSchema,
  phoneSchema,
  removePushTokenSchema,
  setTwoStepSchema,
  updateProfileSchema,
  usernameQuerySchema,
} from "../validations/schemas";
import {
  changeUsername,
  disableTwoStep,
  getMyProfile,
  getUserByUsername,
  removeProfileImage,
  setTwoStep,
  updateDeviceTokens,
  updateMyProfile,
  updateProfileImage,
} from "../controllers/profile.controller";
import {
  blockContact,
  getFcmByPhone,
  getVoipByPhone,
  removePushToken,
  unblockContact,
} from "../controllers/internal.controller";

const router = Router();

// Slows down guessing the two-step code (checkPin also locks it after 5 wrong tries)
const limit = (max: number) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { success: false, message: "Too many requests, please try again later" },
  });

router.get("/me", verifyUser, getMyProfile);
router.patch("/me", verifyUser, validate(updateProfileSchema), updateMyProfile);
router.patch("/username", verifyUser, validate(changeUsernameSchema), changeUsername);
router.patch("/update-profile-image", verifyUser, uploadProfileImage, updateProfileImage);
router.delete("/profile-image", verifyUser, removeProfileImage);
router.patch("/device-tokens", verifyUser, validate(deviceTokensSchema), updateDeviceTokens);
router.put("/two-step", verifyUser, limit(20), validate(setTwoStepSchema), setTwoStep);
router.post("/two-step/disable", verifyUser, limit(20), validate(disableTwoStepSchema), disableTwoStep);
router.get("/user/:username", verifyUser, validate(usernameQuerySchema, "params"), getUserByUsername);

/////// internal hooks /////////
router.post("/get-fcm-by-phone", verifyInternalRequest, validate(phoneSchema), getFcmByPhone);
router.post("/get-voip-by-phone", verifyInternalRequest, validate(phoneSchema), getVoipByPhone);
router.post("/remove-fcm-token", verifyInternalRequest, validate(removePushTokenSchema), removePushToken);
router.post("/block-contact", verifyInternalRequest, validate(blockSchema), blockContact);
router.post("/unblock-contact", verifyInternalRequest, validate(blockSchema), unblockContact);

export default router;
