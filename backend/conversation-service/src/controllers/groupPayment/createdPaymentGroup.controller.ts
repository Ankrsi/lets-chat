import { Request } from "express";
import { Types } from "mongoose";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiError } from "../../utils/apiError";
import { ApiResponse } from "../../utils/apiResponse";
import groupPaymentModel from "../../models/groupPayment.model";
import { t } from "../../../i18n";

export const getCreatedPaymentGroup = asyncHandler(async (req: Request) => {
    const user = req.user as { _id: string; phone?: number; wallet_id?: string };
    const { groupId, groupPaymentKey } = req.query as {
        groupId?: string;
        groupPaymentKey?: string;
    };

    // Either send both or send none
    if ((groupId && !groupPaymentKey) || (!groupId && groupPaymentKey)) {
        throw new ApiError(
            t("BOTH_GROUP_ID_AND_GROUP_PAYMENT_KEY_REQUIRED", req.language) as string,
            400
        );
    }

    // ------------------------------------------------------------
    // 1. No params -> return all groups created by logged-in user
    // ------------------------------------------------------------
    if (!groupId && !groupPaymentKey) {
        const groups = await groupPaymentModel
            .find({ created_by: new Types.ObjectId(user._id) })
            .sort({ createdAt: -1 });

        return new ApiResponse(
            200,
            groups,
            t("GROUP_FETCH_SUCCESSFULLY", req.language) as string
        );

    }

    // ------------------------------------------------------------
    // 2. groupId + groupPaymentKey -> creator or receiver view
    // ------------------------------------------------------------
    const group = await groupPaymentModel.findOne({
        groupId,
        groupPaymentKey,
    }).lean();

    if (!group) {
        throw new ApiError(
            t("GROUP_NOT_FOUND", req.language) as string,
            404
        );
    }

    // Creator view
    if (group.created_by.toString() === user._id.toString()) {
        return new ApiResponse(
            200,
            group,
            t("GROUP_FETCH_SUCCESSFULLY", req.language) as string
        );
    }

    // Receiver view
    const member = group.members.find(
        (m: any) =>
            (user.phone && m.phone === user.phone) ||
            (user.wallet_id && m.wallet_id === user.wallet_id)

            // m.status !== "FAILED" &&
            // (
            //     (user.phone && m.phone === user.phone) ||
            //     (user.wallet_id && m.wallet_id === user.wallet_id)
            // )
    );

    if (!member) {
        throw new ApiError(
            t("SUCCESS_GROUP_PAYMENT_NOT_FOUND_FOR_THIS_USER", req.language) as string,
            403
        );
    }

    // Create a plain copy
    const memberData = { ...member }

    // Remove error_reason if status is FAILED
    if (memberData.status === "FAILED") {
        memberData.error_reason = "Payment failed. Contact payer"
    }

    const receiverData = {
        _id: group._id,
        groupId: group.groupId,
        notes: group.notes,
        groupPaymentKey: group.groupPaymentKey,
        members: [memberData],
        createdAt: group.createdAt
    };

    return new ApiResponse(
        200,
        receiverData,
        t("GROUP_FETCH_SUCCESSFULLY", req.language) as string
    );
});






// import { Request } from "express";
// import { asyncHandler } from "../../utils/asyncHandler";
// import { ApiError } from "../../utils/apiError";
// import groupPaymentModel from "../../models/groupPayment.model";
// import { ApiResponse } from "../../utils/apiResponse";
// import { t } from "../../../i18n";

// export const getCreatedPaymentGroup = asyncHandler(
//     async (req: Request) => {
//         const user = req?.user;
//         const { groupId, groupPaymentKey } = req.body

//         if ((groupId && !groupPaymentKey) || (!groupId && groupPaymentKey)) {
//             throw new ApiError(
//                 t("BOTH_GROUP_ID_AND_GROUP_PAYMENT_KEY_REQUIRED", req.language) as string,
//                 400
//             );
//         }
//         const filter: any = {
//             created_by: user?._id
//         }

//         if (groupId) filter.groupId = groupId
//         if (groupPaymentKey) filter.groupPaymentKey = groupPaymentKey

//         const groups = await groupPaymentModel.find(filter)

//         return new ApiResponse(
//             200,
//             groups,
//             t("GROUP_FETCH_SUCCESSFULLY", req.language) as string
//         )

//     }
// )