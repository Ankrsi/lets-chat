import { Router } from "express";
import { verifyUser } from "../middlewares/verifyUser";
import { follow, getSocialProfile, unfollow } from "../controllers/reels/social.controller";

const router = Router();

router.post("/follow/:phone", verifyUser, follow);
router.delete("/follow/:phone", verifyUser, unfollow);
router.get("/profile/:phone", verifyUser, getSocialProfile);

export default router;
