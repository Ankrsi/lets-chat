import { Router } from "express";
import rateLimit from "express-rate-limit";
import { verifyUser } from "../middlewares/verifyUser";
import { verifyInternalRequest } from "../middlewares/internal-auth.middleware";
import { validate } from "../middlewares/validate";
import {
  generateOtpSchema,
  phonesSchema,
  refreshSchema,
  registerSchema,
  usernameQuerySchema,
  verifyOtpSchema,
} from "../validations/schemas";
import {
  generateOtp,
  logout,
  refreshAccessToken,
  register,
  usernameAvailable,
  verifyOtp,
  turnCredentials,
  verifyUser as verifyUserController,
} from "../controllers/auth.controller";
import { getUsersByPhones } from "../controllers/internal.controller";

const router = Router();

// Per-IP limits on the unauthenticated OTP endpoints (per-phone limits live in otp.service)
const limit = (max: number) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { success: false, message: "Too many requests, please try again later" },
  });

router.post("/generate-otp", limit(10), validate(generateOtpSchema), generateOtp);
router.post("/verify-otp", limit(30), validate(verifyOtpSchema), verifyOtp);
router.post("/get-new-access-token", limit(60), validate(refreshSchema), refreshAccessToken);

router.post("/register", verifyUser, validate(registerSchema), register);
router.get("/username-available", verifyUser, validate(usernameQuerySchema, "query"), usernameAvailable);
router.get("/verify-user", verifyUser, verifyUserController);
router.post("/logout", verifyUser, logout);
router.get("/turn-credentials", verifyUser, limit(60), turnCredentials);

/////// internal hooks /////////
router.post("/get-users-by-phones", verifyInternalRequest, validate(phonesSchema), getUsersByPhones);

export default router;
