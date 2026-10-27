import { ApiError } from "../utils/apiError";
import { ApiResponse } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import { UserKeys, OneTimePreKey } from "../modals/keys.model";

const isBase64 = (s: any) =>
    typeof s === "string" && s.length > 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(s);

// base64 string that decodes to exactly `bytes` bytes (32 for X25519/Ed25519 keys, 64 for Ed25519 sigs)
const isKey = (s: any, bytes: number) =>
    isBase64(s) && Buffer.from(s, "base64").length === bytes;

function validateUploadBody({
    v,
    identitySignPub,
    identityDHPub,
    signedPreKeyPub,
    signedPreKeySig,
    oneTimePreKeys,
}: any) {
    if (v !== undefined && v !== "x3dh1")
        return "v must be \"x3dh1\"";

    if (identitySignPub !== undefined && !isKey(identitySignPub, 32))
        return "identitySignPub must be a 32-byte base64 key";

    if (identityDHPub !== undefined && !isKey(identityDHPub, 32))
        return "identityDHPub must be a 32-byte base64 key";

    if (signedPreKeyPub !== undefined && !isKey(signedPreKeyPub, 32))
        return "signedPreKeyPub must be a 32-byte base64 key";

    if (signedPreKeySig !== undefined && !isKey(signedPreKeySig, 64))
        return "signedPreKeySig must be a 64-byte base64 signature";

    // signed prekey and its signature must be sent together
    if ((signedPreKeyPub === undefined) !== (signedPreKeySig === undefined))
        return "signedPreKeyPub and signedPreKeySig must be sent together";

    if (oneTimePreKeys !== undefined) {
        const ok =
            Array.isArray(oneTimePreKeys) &&
            oneTimePreKeys.every((k) => isKey(k, 32));
        if (!ok) return "oneTimePreKeys must be [base64 (32-byte key)]";
    }

    return null;
}

export const uploadKeys = asyncHandler(async (req, res) => {
    if (!req.user) return new ApiResponse(401, null, "user not found");
    try {
        const invalid = validateUploadBody(req.body);
        if (invalid) return new ApiResponse(400, null, invalid);

        const {
            v = "x3dh1",
            identitySignPub,
            identityDHPub,
            signedPreKeyPub,
            signedPreKeySig,
            oneTimePreKeys,
        } = req.body;

        const userId = req.user._id.toString();

        let record = await UserKeys.findOne({ userId });

        if (!record) {
            // First registration: identity keys + signed prekey required
            if (!identitySignPub || !identityDHPub)
                return new ApiResponse(400, null, "identitySignPub and identityDHPub required on first upload");
            if (!signedPreKeyPub)
                return new ApiResponse(400, null, "signedPreKeyPub and signedPreKeySig required on first upload");
            record = await UserKeys.create({
                userId,
                phone: req.user.phone,
                v,
                identitySignPub,
                identityDHPub,
                signedPreKey: { publicKey: signedPreKeyPub, signature: signedPreKeySig },
            });
        } else if (
            // legacy (keyId-based) record is updated in place to x3dh1
            !record.identitySignPub ||
            (identitySignPub && identitySignPub !== record.identitySignPub) ||
            (identityDHPub && identityDHPub !== record.identityDHPub)
        ) {
            // New identity from the authenticated owner (reinstall / cleared data / new phone):
            // update it in place. Existing one-time prekeys are kept.
            if (!identitySignPub || !identityDHPub)
                return new ApiResponse(400, null, "identitySignPub and identityDHPub required when replacing identity");
            if (!signedPreKeyPub)
                return new ApiResponse(400, null, "signedPreKeyPub and signedPreKeySig required when replacing identity");

            record.v = v;
            record.phone = req.user.phone;
            // identity keys are immutable in the schema; a plain assignment is silently ignored
            record.$set("identitySignPub", identitySignPub, undefined, { overwriteImmutable: true });
            record.$set("identityDHPub", identityDHPub, undefined, { overwriteImmutable: true });
            record.signedPreKey = {
                publicKey: signedPreKeyPub,
                signature: signedPreKeySig,
                createdAt: new Date(),
            };
            await record.save();
        } else {
            // Signed prekey rotation
            if (signedPreKeyPub) {
                record.signedPreKey = {
                    publicKey: signedPreKeyPub,
                    signature: signedPreKeySig,
                    createdAt: new Date(),
                };
                await record.save();
            }
        }

        // Insert one-time prekey batch; duplicates (userId+publicKey) silently skipped
        if (oneTimePreKeys?.length) {
            await OneTimePreKey.insertMany(
                oneTimePreKeys.map((publicKey: string) => ({ userId, phone: req.user.phone, publicKey })),
                { ordered: false }
            ).catch((e: any) => {
                if (e.code !== 11000) throw e; // ignore duplicate-key errors only
            });
        }

        const count = await OneTimePreKey.countDocuments({ userId });
        return new ApiResponse(200, { oneTimePreKeyCount: count }, "Keys uploaded successfully");
    } catch (err: any) {
        console.error("uploadKeys error:", err);
        return new ApiError("Internal error", 500, err.stack);
    }
});

export const getPreKeyCount = asyncHandler(async (req, res) => {
    if (!req.user) return new ApiResponse(401, null, "user not found");
    try {
        const userId = req.user._id.toString();

        // Missing or legacy (keyId-based) record: client must do a full x3dh1 upload
        const record = await UserKeys.findOne({ userId }, { identitySignPub: 1, signedPreKey: 1 }).lean();
        if (!record?.identitySignPub) {
            const data = {
                registered: false,
                oneTimePreKeyCount: 0,
                shouldReplenish: true,
                signedPreKeyCreatedAt: null,
            };
            return new ApiResponse(200, data, "PreKey count retrieved successfully");
        }

        const count = await OneTimePreKey.countDocuments({ userId });
        const data = {
            registered: true,
            oneTimePreKeyCount: count,
            shouldReplenish: count < 10,
            signedPreKeyCreatedAt: record.signedPreKey?.createdAt ?? null,
        };
        return new ApiResponse(200, data, "PreKey count retrieved successfully");
    } catch (err) {
        console.error("getPreKeyCount error:", err);
        return new ApiError("Internal error", 500);
    }
});

export const getKeyBundle = asyncHandler(async (req, res) => {
    try {
        const { userId } = req.params;

        const record = await UserKeys.findOne({ phone: userId }).lean();
        // Legacy (keyId-based) records can't be used for x3dh1 — treat as unregistered
        if (!record?.identitySignPub)
            return new ApiResponse(404, null, "User has no registered keys");

        // Read without deleting. Newest first so that after a reinstall the key comes from the current install.
        const otp = await OneTimePreKey.findOne({ phone: userId }, { publicKey: 1 }, { sort: { createdAt: -1 } }).lean();

        const data = {
            v: record.v,
            userId,
            identitySignPub: record.identitySignPub,
            identityDHPub: record.identityDHPub,
            signedPreKeyPub: record.signedPreKey.publicKey,
            signedPreKeySig: record.signedPreKey.signature,
            oneTimePreKey: otp ? otp.publicKey : null,
        };
        return new ApiResponse(200, data, "Key bundle retrieved successfully");
    } catch (err) {
        console.error("getKeyBundle error:", err);
        return new ApiError("Internal error", 500);
    }
});
