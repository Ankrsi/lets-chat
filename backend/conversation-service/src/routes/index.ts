import { Router } from "express";
import chatsRouter from "./chats.route";
import contactsRouter from "./contact.route";
import dashboardRouter from "./chatAdmin.route";

const router = Router();

router.use("/chats", chatsRouter);
router.use("/contacts", contactsRouter);
router.use("/dashboard", dashboardRouter);

export default router;
