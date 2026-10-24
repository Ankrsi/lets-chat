import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/apiResponse';
import { createLog } from '../../apis/webhook.api';
// import { userSocketMap } from '../../socket';
import { redisClient } from '../../redis/redisClient';

export const validateFailedResult = asyncHandler(async (req: Request, res: Response) => {
    console.info('validateFailedResult controller event service')
    const payload = req.body

    const { result, phone } = payload

    const { data, success, user_phone, transactionType } = result

    console.info('result', result);
    console.info('phone', phone);

    const io = req.app.get('io')

    if (!result.success && (!result.data || Object.keys(result.data).length === 0)) {

        // const socketId = userSocketMap.get(phone) as string
        const socketId = await redisClient.hGet("userSocketMap", String(phone)) || "";

        io.to(JSON.parse(socketId)).emit("transaction:error", { message: result.message })
        // io.to(socketId).emit("transaction:error", { message: result.message });
        console.info('transaction:error | scoket emitted for failed txn')
        // return;
        return new ApiResponse(200, 'successfully validate failed result got it')
    }

    // send transaction
    await createLog({ ...data, success, user_phone, transactionType })

    return new ApiResponse(200, 'successfully validate failed result got it')
})

