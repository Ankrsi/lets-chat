import { Request } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import groupPaymentModel from "../../models/groupPayment.model";
import { ApiResponse } from "../../utils/apiResponse";
import { ApiError } from "../../utils/apiError";


export const updatePaymentGroup = asyncHandler(
  async (req: Request) => {
    const {
      groupPaymentKey,
      success_count,
      failed_count,
      status,
      members,
    } = req.body;

    const groupPayment = await groupPaymentModel.findOne({
      groupPaymentKey,
    });

    if (!groupPayment) {
      throw new ApiError("Group payment not found", 404)
    }

    const memberMap = new Map(
      members.map((m: any) => [m.wallet_id, m])
    );

    groupPayment.members = groupPayment.members.map((member: any) => {
      const update = memberMap.get(member.wallet_id) as any

      if (!update) return member;

      member.status = update.status;

      if (update.error_reason) {
        member.error_reason = update.error_reason;
      }

      return member;
    });

    groupPayment.success_count = success_count;
    groupPayment.failed_count = failed_count;
    groupPayment.status = status;

    await groupPayment.save();

    return new ApiResponse(200, {}, "Group payment completed");
  }
);



// export const updatePaymentGroup = asyncHandler(async (req: Request) => {
//   const {
//     groupId,
//     groupPaymentKey,

//     grand_total,
//     success_count,
//     failed_count,
//     status,

//     processing_fee,
//     processing_fee_type,

//     recipient_status,
//     recipient_wallet_id,
//     error_reason
//   } = req.body;

//   if (!groupId || !groupPaymentKey) throw new ApiError("groupId or groupPaymentKey is required");

//   // Build update objects dynamically
//   const setData: any = {};
//   const incData: any = {};

//   if (grand_total !== undefined) setData.grand_total = grand_total;
//   if (status !== undefined) setData.status = status;
//   if (processing_fee !== undefined) setData.processing_fee = processing_fee;
//   if (processing_fee_type !== undefined) setData.processing_fee_type = processing_fee_type;

//   // Increment counters
//   if (success_count !== undefined) incData.success_count = success_count;
//   if (failed_count !== undefined) incData.failed_count = failed_count;

//   // Base filter
//   const filter: any = {
//     groupPaymentKey,
//     groupId,
//   };

//   // Update recipient status inside members array
//   if (recipient_wallet_id && recipient_status !== undefined) {
//     filter["members.wallet_id"] = recipient_wallet_id;
//     setData["members.$.status"] = recipient_status;

//     if (recipient_status === "FAILED" && error_reason) {
//       setData["members.$.error_reason"] = error_reason;
//     }
//   }

//   // Build final update query
//   const updateQuery: any = {};

//   if (Object.keys(setData).length > 0) {
//     updateQuery.$set = setData;
//   }

//   if (Object.keys(incData).length > 0) {
//     updateQuery.$inc = incData;
//   }

//   const updated = await groupPaymentModel.findOneAndUpdate(
//     filter,
//     updateQuery,
//     { new: true }
//   );


//   if (!updated) {
//     throw new ApiError("Group payment not found", 404);
//   }

//   // If all members are processed, mark group as SUCCESS
//   // const processedCount =
//   //   (updated.success_count || 0) + (updated.failed_count || 0);

//   // if (processedCount === updated.total_members && updated.status !== "SUCCESS") {
//   //   updated.status = "SUCCESS";
//   //   await updated.save();
//   // }


//   // Total members that have been processed
// const successCount = updated.success_count || 0;
// const failedCount = updated.failed_count || 0;
// const totalMembers = updated.total_members;

// const processedCount = successCount + failedCount;

// if (processedCount === totalMembers) {
//   if (successCount === totalMembers) {
//     updated.status = "COMPLETED";
//   } else if (failedCount === totalMembers) {
//     updated.status = "FAILED";
//   } else {
//     updated.status = "PARTIAL_COMPLETED";
//   }

//   await updated.save();
// }


//   return new ApiResponse(200, updated, "Payment group updated")
// });