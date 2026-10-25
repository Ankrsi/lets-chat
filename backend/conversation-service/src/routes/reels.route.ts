import { Router } from "express";
import { verifyUser } from "../middlewares/verifyUser";
import { createReel, deleteReel, getFeed, getReelUploadUrl, getUserReels } from "../controllers/reels/reels.controller";
import {
  addComment, deleteComment, getComments, likeReel, shareReel, unlikeReel,
} from "../controllers/reels/reelEngagement.controller";

const router = Router();

router.post("/upload-url", verifyUser, getReelUploadUrl);
router.post("/", verifyUser, createReel);
router.get("/feed", verifyUser, getFeed);
router.get("/user/:phone", verifyUser, getUserReels);
router.delete("/:id", verifyUser, deleteReel);

// Likes, comments, shares
router.post("/:id/like", verifyUser, likeReel);
router.delete("/:id/like", verifyUser, unlikeReel);
router.post("/:id/share", verifyUser, shareReel);
router.get("/:id/comments", verifyUser, getComments);
router.post("/:id/comments", verifyUser, addComment);
router.delete("/:id/comments/:commentId", verifyUser, deleteComment);

export default router;
