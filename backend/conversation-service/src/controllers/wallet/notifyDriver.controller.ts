import { Request } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { redisPublisher } from '../../redis/redisClient';
import { ApiResponse } from '../../utils/apiResponse';
import { ApiError } from '../../utils/apiError';

// If Taxi payment was completed from ods request notify the driver.

// EG: passenger paid through his relatives.
export const notifyDriverPayment = asyncHandler(
    async (req: Request) => {
        try {

            const { driverNumber, data } = req.body;

            const datasWithNumber = { logData: data, phoneNumber: driverNumber };
            await redisPublisher.publish("update-receiver", JSON.stringify(datasWithNumber));

            return new ApiResponse(200, {}, "Notifyed driver");
        } catch (error: any) {
            const errorMessage = error?.response?.data?.message || error?.message || "Failed to notify driver";
            const status = error?.response?.status || 400;

            console.error(errorMessage)
            throw new ApiError(errorMessage, status)
        }
    }
)