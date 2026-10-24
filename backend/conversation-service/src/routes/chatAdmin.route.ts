import { Router } from "express";
// import { verifyUser } from "../middlewares/verifyUser";
import { chatDashboard } from "../controllers/chats/chatDashboard.controller";

const router = Router();

// router.post("/chat-dashboard", verifyUser, setUsersByPhones);
router.get("/chat-dashboard", chatDashboard);

export default router;
