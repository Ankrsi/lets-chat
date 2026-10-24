// src/db/connectDB.ts
import mongoose from "mongoose";

export const connectDB = async () => {
  try {
    const MONGODB_URI = process.env.MONGODB_URL;

    await mongoose.connect(MONGODB_URI ?? "");
    console.info(" MongoDB connected successfully");
  } catch (error) {
    console.error(" MongoDB connection failed:", (error as Error).message);
    process.exit(1);
  }
};

