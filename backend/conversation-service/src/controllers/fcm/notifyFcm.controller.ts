import { Response, Request } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/apiResponse";
import { redisPublisher } from "../../redis/redisClient";

export const notifyFcmToUser = asyncHandler(async (req: Request, res: Response) => {
  const { user_id, phone } = req.body;
  const io = req.app.get("io");
  let memberSocketId = await redisPublisher.hGet("userSocketMap", phone);
  if (memberSocketId) {
    io.to(JSON.parse(memberSocketId)).emit("fcm:fcm-expired", { user_id, phone });
  }
  return new ApiResponse(200, null, "user fcm notify successfully.");
});