import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/apiResponse';
import { createLog } from '../../apis/webhook.api';

export const acidResult = asyncHandler(async (req: Request, res: Response) => {
    console.info('acidResult controller event service')
    const payload = req.body

    const { result, driverNumber, conversationId, type } = payload

    const { data, success, user_phone, transactionType } = result

    console.info('result', result);
    console.info('driverNumber', driverNumber)
    console.info('conversationId', conversationId)

    // send transaction
    const response = await createLog({ ...data, success, user_phone, transactionType, driverNumber, conversationId, type })

    return new ApiResponse(200, 'successfully acid result got it and created log', response.data)
})