// modal for user contacts
import { Schema, model, Document } from "mongoose";

export interface IAllContact extends Document {
  userId: Schema.Types.ObjectId;
  phone: string;
  contacts: { phone: string; name: string }[];
}

const allContactSchema = new Schema<IAllContact>(
    {
        userId: { type: String, required: true, unique: true },
        phone: { type: String, required: true },
        contacts: [
            { phone: { type: String, required: true }, name: { type: String, required: true } }
        ]
    },
    { timestamps: true }
);

const AllContact = model<IAllContact>("AllContact", allContactSchema);
export default AllContact;