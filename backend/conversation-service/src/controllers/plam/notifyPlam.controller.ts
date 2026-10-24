import { Response, Request } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/apiResponse";
import { redisPublisher } from "../../redis/redisClient";

export const notifyPlamToUser = asyncHandler(async (req: Request, res: Response) => {
  const { data, phone } = req.body;
  const io = req.app.get("io");
  const isOnline = await redisPublisher.get(`user:${phone.toString()}:online`);
  if (isOnline != "1") {
    redisPublisher.lPush(`offline:messages:${phone}`, JSON.stringify({ type: "registerPlam", data: data }));
    await redisPublisher.expire(`offline:messages:${phone.toString()}`, 60 * 60 * 24 * 7); // 7 days
  }
  else {
    let memberSocketId = await redisPublisher.hGet("userSocketMap", phone.toString());
    if (memberSocketId) {
      io.to(JSON.parse(memberSocketId)).emit("plam:register-plam", data);
    }
  }

  return new ApiResponse(200, null, "user plam notify successfully.");
});