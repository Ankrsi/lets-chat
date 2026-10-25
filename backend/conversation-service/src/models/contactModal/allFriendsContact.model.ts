// modal for friends contacts
import { Schema, model, Document } from "mongoose";

export interface IAllFriendsContact extends Document {
    userId: Schema.Types.ObjectId;
    phone: string;
    contacts: { phone: string; name: string }[];
    blockedPhones: string[];
}

const allfriendsContactSchema = new Schema<IAllFriendsContact>(
    {
        userId: { type: String, required: true, unique: true },
        phone: { type: String, required: true },
        contacts: [
            { phone: { type: String, required: true }, name: { type: String, required: true } }
        ],
        blockedPhones: { type: [Number], default: [] }
    },
    { timestamps: true }
);

// Every lookup is by phone (socket registration, block checks, status refresh, contact sync)
allfriendsContactSchema.index({ phone: 1 });

const AllFriendsContact = model<IAllFriendsContact>("AllFriendsContact", allfriendsContactSchema);
export default AllFriendsContact;