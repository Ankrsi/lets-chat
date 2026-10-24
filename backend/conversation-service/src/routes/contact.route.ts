import { Router } from "express";
import { verifyUser } from "../middlewares/verifyUser";
import { blockContactByWallet, setUsersByPhones } from "../controllers/chats/contactByPhones.controller";
import { verifyInternalRequest } from "../middlewares/internal-auth.middleware";

const router = Router();

router.post("/my-contacts", verifyUser, setUsersByPhones);
router.post("/blockContactByWallet", verifyInternalRequest, blockContactByWallet);

export default router;
