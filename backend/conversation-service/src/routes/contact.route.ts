import { Router } from "express";
import { verifyUser } from "../middlewares/verifyUser";
import { setUsersByPhones } from "../controllers/chats/contactByPhones.controller";

const router = Router();

router.post("/my-contacts", verifyUser, setUsersByPhones);

export default router;
