import { Router } from "express";
import { verifyUser } from "../middlewares/verifyUser";
import { createTicket, getAllTickets, getChatHistory, updateTicketStatusSocket } from "../controllers/support/support.controller";
import { uploadImage } from "../middlewares/upload.middeware";
import { verifyInternalRequest } from "../middlewares/internal-auth.middleware";

const router = Router();

router.post("/tickets", verifyUser, uploadImage.single("image"), createTicket);
router.get("/tickets", verifyUser, getAllTickets);
router.get("/tickets/chats/:ticketId", verifyUser, getChatHistory);

//////////////// web hook ///////////////////
router.post("/tickets/status-scoket", verifyInternalRequest, updateTicketStatusSocket);

export default router;
