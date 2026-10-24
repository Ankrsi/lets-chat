import mongoose, { Schema, Types, Document } from "mongoose";

export interface IGroupPayment extends Document {
  groupId: string;
  groupPaymentKey: string;

  created_by: Types.ObjectId;

  notes: string;

  total_amount: number; // without fee
  grand_total: number;  // with fee
  processing_fee: number;
  processing_fee_type: string;
  total_fee: number;

  members: {
    phone: number;
    wallet_id: string;
    amount: number;
    status: string;
    error_reason?: string;
  }[];

  total_members: number;

  success_count: number;
  failed_count: number;

  status:
  | "PENDING"
  | "PARTIAL_COMPLETED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

  createdAt?: Date;
  updatedAt?: Date;
}

const MemberSchema = new Schema(
  {
    phone: {
      type: Number,
      required: true,
    },

    wallet_id: {
      type: String
    },

    amount: {
      type: Number
    },

    status: {
      type: String
    },

    error_reason: {
      type: String
    }

  },
  { _id: false }
);

const GroupPaymentSchema = new Schema<IGroupPayment>(
  {
    groupId: {
      type: String,
      required: true,
      index: true,
    },

    groupPaymentKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    created_by: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "User",
      index: true,
    },

    notes: {
      type: String,
      default: null,
      trim: true,
      maxlength: 140,
    },

    total_amount: {
      type: Number,
      required: true,
      min: 0,
    },

    grand_total: {
      type: Number,
      required: true,
      min: 0,
    },

    processing_fee: {
      type: Number,
    },

    processing_fee_type: {
      type: String
    },

    total_fee: {
      type: Number
    },

    members: {
      type: [MemberSchema],
    },

    total_members: {
      type: Number,
      required: true,
      min: 1,
    },

    success_count: {
      type: Number,
      default: 0,
      min: 0,
    },

    failed_count: {
      type: Number,
      default: 0,
      min: 0,
    },

    status: {
      type: String,
      enum: [
        "PENDING",
        "PARTIAL_COMPLETED",
        "COMPLETED",
        "FAILED",
        "CANCELLED",
      ],
      default: "PENDING",
      index: true,
    }

  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Useful indexes
GroupPaymentSchema.index({ created_by: 1, createdAt: -1 });
GroupPaymentSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model<IGroupPayment>(
  "GroupPayment",
  GroupPaymentSchema
);