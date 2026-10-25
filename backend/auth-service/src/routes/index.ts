import { Router } from "express";
import authRouter from "./auth.route";
import profileRouter from "./profile.route";

const router = Router();

router.use("/auth", authRouter);
router.use("/profile", profileRouter);

export default router;
