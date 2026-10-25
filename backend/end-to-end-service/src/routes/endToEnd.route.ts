import { Router } from "express";
import { verifyUser } from "../middlewares/verifyUser";
import { getKeyBundle, getPreKeyCount, uploadKeys } from "../controllers/e2eKeys.controller";

const router = Router();

router.post("/keys/upload", verifyUser, uploadKeys);
router.get("/keys/count", verifyUser, getPreKeyCount);
router.get("/keys/:userId", verifyUser, getKeyBundle);

export default router;