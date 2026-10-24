import { Request, Response } from "express";
import { ApiResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import { decryptData, getKeyAsJWK, importPublicJWK, initKeys } from "../utils/rsaKeys";
import { DataEncryptKey } from "../modals/dataEncryptKeys.modal";


// ===== Generate Keys =====
export const setKeysControler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, "user not forund");

  const keyPair = await initKeys();
  const publicKey = await getKeyAsJWK(keyPair.publicKey);
  const privateKey = await getKeyAsJWK(keyPair.privateKey);

  const preKey = await DataEncryptKey.findOneAndUpdate(
    { userId: req.user._id },
    { phone: req.user.phone, publicKey, privateKey },
    { upsert: true, new: true }
  );
  if (!preKey) return new ApiResponse(404, null, "data not found or failed to save in db");

  return new ApiResponse(200, null, "keys are generate successfully");
});

// ===== Export Public Key as JWK =====
export const getPublicKeyControler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, "user not forund");
  const jwk = await DataEncryptKey.findOne(
    { userId: req.user._id, phone: req.user.phone }
  ).select("-_id publicKey");
  if (!jwk) return new ApiResponse(404, null, "data not found in db");
  return new ApiResponse(200, jwk, "found keys successfully");
});

// ===== Export Public Key as JWK for Internal =====
export const getPublicKeyInternalControler = asyncHandler(async (req: Request, res: Response) => {
  const { userId, phone } = req.body;
  const jwk = await DataEncryptKey.findOne(
    { userId, phone }
  ).select("-_id publicKey");
  if (!jwk) return new ApiResponse(404, null, "data not found in db");
  return new ApiResponse(200, jwk, "found keys successfully");
});

// ===== Decrypt Endpoint =====
export const DecryptionDataControler = asyncHandler(async (req: Request, res: Response) => {
  try {
    const { encryptedData, userId, phone } = req.body;
    const resPrivate = await DataEncryptKey.findOne(
      { userId, phone }
    ).select("privateKey").lean();

    if (!resPrivate) return new ApiResponse(404, null, "data not found in db");

    let privateKeyJWK = resPrivate.privateKey;
    if (typeof privateKeyJWK === "string") {
      privateKeyJWK = JSON.parse(privateKeyJWK) as JsonWebKey;
    }
    const privateKey = await importPublicJWK(privateKeyJWK as JsonWebKey);
    const message = await decryptData(privateKey, encryptedData);

    return new ApiResponse(200, message, "Data decryption successfully");
  } catch (err) {
    console.error(err);
    return new ApiResponse(400, null, "Decryption failed");
  }
});