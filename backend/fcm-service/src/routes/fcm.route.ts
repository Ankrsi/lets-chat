import { Router } from "express";
import { verifyInternalRequest } from "../middlewares/internal-auth.middleware";
import { sendMultiNotification, sendNotification } from "../controllers/fcm.controller";

const router = Router();

router.post("/send", verifyInternalRequest, sendNotification);
router.post("/send-multi-fcms", verifyInternalRequest, sendMultiNotification);

export default router;
