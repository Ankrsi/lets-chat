import { Router } from "express";
import chatsRouter from "./chats.route";
import contactsRouter from "./contact.route";
import reelsRouter from "./reels.route";
import socialRouter from "./social.route";

const router = Router();

router.use("/chats", chatsRouter);
router.use("/contacts", contactsRouter);
router.use("/reels", reelsRouter);
router.use("/social", socialRouter);

export default router;
