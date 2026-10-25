import { model, Schema } from "mongoose";

interface ISignedPreKey {
    publicKey: string;
    signature: string;
    createdAt: Date;
}

interface IUserKeys {
    userId: string;
    phone: string;
    v: string;
    identitySignPub: string;
    identityDHPub: string;
    signedPreKey: ISignedPreKey;
}

const userKeysSchema = new Schema<IUserKeys>(
    {
        userId: { type: String, required: true, unique: true, index: true },
        phone: { type: String, required: true, unique: true, index: true },
        v: { type: String, required: true, default: "x3dh1" },
        identitySignPub: { type: String, required: true, immutable: true }, // base64 Ed25519
        identityDHPub: { type: String, required: true, immutable: true }, // base64 X25519
        signedPreKey: {
            publicKey: { type: String, required: true }, // base64
            signature: { type: String, required: true }, // base64, signed by identitySignPub
            createdAt: { type: Date, default: Date.now },
        },
    },
    { timestamps: true, collection: "user_keys" }
);

const oneTimePreKeySchema = new Schema(
    {
        userId: { type: String, required: true, index: true },
        phone: { type: String, required: true, index: true },
        publicKey: { type: String, required: true }, // base64
    },
    { timestamps: true, collection: "one_time_prekeys" }
);

oneTimePreKeySchema.index({ userId: 1, publicKey: 1 }, { unique: true });
oneTimePreKeySchema.index({ phone: 1, publicKey: 1 }, { unique: true });

export const UserKeys = model("UserKeys", userKeysSchema);
export const OneTimePreKey = model("OneTimePreKey", oneTimePreKeySchema);
