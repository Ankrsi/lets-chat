import { Router } from "express";
import { verifyInternalRequest } from "../middlewares/internal-auth.middleware";
import { sendMultiNotification, sendNotification } from "../controllers/fcm.controller";
import { sendMulticastNotification } from "../controllers/fcm.multicast.controller";

const router = Router();

router.post("/send-multicast", sendMulticastNotification);
router.post("/send", verifyInternalRequest, sendNotification);
router.post("/send-multi-fcms", verifyInternalRequest, sendMultiNotification);

export default router;
