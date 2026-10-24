import { Router } from "express";
import { verifyUser } from "../middlewares/verifyUser";
import { getPublicKeyControler, DecryptionDataControler, setKeysControler, getPublicKeyInternalControler } from "../controllers/encryptData.controller";
import { verifyInternalRequest } from "../middlewares/internal-auth.middleware";

const router = Router();
router.get("/generate-keys",verifyUser, setKeysControler);
router.get("/get-public-key",verifyUser, getPublicKeyControler);
router.get("/get-public-key-internal",verifyInternalRequest, getPublicKeyInternalControler);
router.post("/decrypt-data",verifyUser, DecryptionDataControler);

export default router;