import { Router } from "express";
import { verifyUser } from "../middlewares/verifyUser";
// import { getGroupKeyBackupControler, getGroupMembersKeysControler, getPubKeyControler, setGroupKeyBackupControler, setPubKeyControler, setPubPrivKeysControler } from "../controllers/endToEndControler";
import { getKeyBundle, getPreKeyCount, uploadKeys } from "../controllers/e2eKeys.controller";

const router = Router();
// router.post("/group-key-backup",verifyUser, setGroupKeyBackupControler);
// router.get("/group-key-backup",verifyUser, getGroupKeyBackupControler);
// router.post("/upload",verifyUser, setPubKeyControler);
// router.post("/savePubPrivKeys",verifyUser, setPubPrivKeysControler);
// router.post("/group-members-keys", verifyUser, getGroupMembersKeysControler);
// router.get("/:phone",verifyUser, getPubKeyControler);



////////// new e2e api /////////////////////////
router.post("/keys/upload", verifyUser, uploadKeys);
router.get("/keys/count", verifyUser, getPreKeyCount);
router.get("/keys/:userId", verifyUser, getKeyBundle);

export default router;