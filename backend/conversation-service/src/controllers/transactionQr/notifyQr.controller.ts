import { redisPublisher } from "../../redis/redisClient";
import { ApiResponse } from "../../utils/apiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { Request, Response } from "express";

export const notifyQrExpired = asyncHandler(async (req: Request, res: Response) => {
    const { data, phone } = req.body;
    const io = req.app.get("io");
    const isOnline = await redisPublisher.get(`user:${phone.toString()}:online`);
    if (isOnline != "1") {
        redisPublisher.lPush(`offline:messages:${phone}`, JSON.stringify({ type: "qrExpired", data: data }));
        await redisPublisher.expire(`offline:messages:${phone.toString()}`, 60 * 60 * 24 * 7); // 7 days
    }
    else {
        let memberSocketId = await redisPublisher.hGet("userSocketMap", phone.toString());
        if (memberSocketId) {
            io.to(JSON.parse(memberSocketId)).emit("qr:expired", data);
        }
    }
    return new ApiResponse(200, null, "user qr notify successfully.");
});
