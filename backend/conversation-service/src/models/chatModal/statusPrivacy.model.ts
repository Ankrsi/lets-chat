import mongoose, { Schema, Document } from "mongoose";

export interface IStatusPrivacy extends Document {
    userId: string;
    visibility: "my_contacts" | "my_contacts_except" | "only_share_with";
    exceptContacts?: string[]; // (for "my_contacts_except")
    onlyContacts?: string[]; // (for "only_share_with")
}

const statusPrivacySchema = new Schema<IStatusPrivacy>({
    userId: {
        type: String,
        required: true,
        unique: true,
    },
    visibility: {
        type: String,
        enum: ["my_contacts", "my_contacts_except", "only_share_with"],
        default: "my_contacts",
    },
    exceptContacts: {type: [String], default : []},
    onlyContacts: {type: [String], default : []},
},{ timestamps: true });

export const StatusPrivacy = mongoose.model<IStatusPrivacy>("StatusPrivacy",statusPrivacySchema);
