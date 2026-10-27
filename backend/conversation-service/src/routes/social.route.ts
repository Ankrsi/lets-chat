import { Router } from "express";
import { verifyUser } from "../middlewares/verifyUser";
import { follow, getFollowers, getFollowing, getSocialProfile, unfollow } from "../controllers/reels/social.controller";

const router = Router();

router.post("/follow/:phone", verifyUser, follow);
router.delete("/follow/:phone", verifyUser, unfollow);
router.get("/profile/:phone", verifyUser, getSocialProfile);
router.get("/followers/:phone", verifyUser, getFollowers);
router.get("/following/:phone", verifyUser, getFollowing);

export default router;
