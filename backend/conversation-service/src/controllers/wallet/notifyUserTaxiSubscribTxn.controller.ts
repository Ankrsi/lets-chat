import { Request } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { redisPublisher } from '../../redis/redisClient';
import { ApiResponse } from '../../utils/apiResponse';
import { ApiError } from '../../utils/apiError';
import { transactionUserMap } from '../../socket/handlers/transactionHandler';

// Notify the user with socket about the subscription payment transaction completed/failed

export const notifyTaxiSubscribeTxn = asyncHandler(
    async (req: Request) => {
        try {

            const { userNumber, data } = req.body;

            if (data.length > 0) {
                transactionUserMap.set(data[0].referenceId, userNumber);
                console.info("txnUserMap: ", transactionUserMap.entries());
            }

            await redisPublisher.publish("updateusertransaction", JSON.stringify({ logData: data, conversationId: null }));

            return new ApiResponse(200, {}, "Notifyed user about taxi subscription payment");
        } catch (error: any) {
            const errorMessage = error?.response?.data?.message || error?.message || "Failed to notify users taxi subscription.";
            const status = error?.response?.status || 400;

            console.error(errorMessage)
            throw new ApiError(errorMessage, status)
        }
    }
)