import { Request } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { getUserById } from "../../services/auth/auth.service";
import { startGroupPayment } from "../../services/groupPayment/startGroupPayment.service";
import { ApiResponse } from "../../utils/apiResponse";
import groupPaymentModel from "../../models/groupPayment.model";
import { redisPublisher } from "../../redis/redisClient";
import { ApiError } from "../../utils/apiError";
import { t } from "../../../i18n";
import { validateGroupPayment } from "../../services/groupPayment/validateGroupPayment";

/**
 * Create group payment controller
 *
 * Purpose:
 * Validates the incoming group payment request, creates a group payment record,
 * triggers the asynchronous payment execution process, and publishes a chat event
 * for the group conversation.
 *
 * Flow:
 * 1. Fetches the sender's user details.
 * 2. Validates each recipient (phone, wallet ID, amount, and idempotency key).
 * 3. Marks invalid or duplicate recipients as FAILED.
 * 4. Filters valid recipients (PENDING) and calculates the total amount and recipient count.
 * 5. Enforces group payment constraints (minimum 1 and maximum 10 valid recipients).
 * 6. Calls the group payment validation service to verify the sender wallet,
 *    transfer limits, processing fees, and admin wallet details.
 * 7. Creates a group payment document in MongoDB containing all members
 *    (both valid and invalid recipients).
 * 8. Starts the actual group payment execution asynchronously for valid recipients only.
 * 9. Publishes a group chat event so the payment message appears immediately
 *    in the group conversation.
 * 10. Returns a response indicating that the group payment has started processing.
 *
 * This controller performs request validation and orchestration only; the actual
 * wallet transfers are executed asynchronously by the group payment execution service.
 */

interface RecipientPayload {
    phone: number;
    idempotency_key: string;
    recipientWalletId: string;
    amount: number;
}

interface GroupPaymentPayload {
    recipients: RecipientPayload[];
    groupId: string;
    groupPaymentKey: string;
    user_notes: string;
}


// Validation result
interface ValidationResult {
    grand_total: number,
    processing_fee: number,
    totalFee: number,
    processing_fee_type: string,

    senderWallet: any;
    totalDebit: number;
    feeAmount: number;
    feePercentage: number;
    fee_type: string;
    fee_value: number;
    adminWallet: any;
    senderBlockedUsers: string[]
}

export const createGroupPayment = asyncHandler(async (req: Request) => {
    const payload = req.body as GroupPaymentPayload;

    const { groupId, groupPaymentKey, user_notes, recipients } = payload;

    const user = req.user;

    // Sender details
    const userDetails = await getUserById({ user_id: user._id });

    // Build members with validation
    const members = recipients.map((recipient: any) => {
        if (!recipient || typeof recipient !== "object") {
            return {
                phone: null,
                wallet_id: null,
                amount: 0,
                idempotency_key: null,
                status: "FAILED",
                error_reason: "Recipient object is missing or invalid",
            };
        }

        if (
            typeof recipient.idempotency_key !== "string" ||
            recipient.idempotency_key.trim() === ""
        ) {
            return {
                phone: recipient.phone ?? null,
                wallet_id: recipient.recipientWalletId ?? null,
                amount: recipient.amount ?? 0,
                idempotency_key: recipient.idempotency_key ?? null,
                status: "FAILED",
                error_reason: "Idempotency key is missing or invalid",
            };
        }

        if (
            typeof recipient.phone !== "number" ||
            !Number.isFinite(recipient.phone) ||
            recipient.phone <= 0
        ) {
            return {
                phone: recipient.phone ?? null,
                wallet_id: recipient.recipientWalletId ?? null,
                amount: recipient.amount ?? 0,
                idempotency_key: recipient.idempotency_key,
                status: "FAILED",
                error_reason: "Phone is missing or invalid",
            };
        }

        if (
            typeof recipient.recipientWalletId !== "string" ||
            recipient.recipientWalletId.trim() === ""
        ) {
            return {
                phone: recipient.phone,
                wallet_id: recipient.recipientWalletId ?? null,
                amount: recipient.amount ?? 0,
                idempotency_key: recipient.idempotency_key,
                status: "FAILED",
                error_reason: "Wallet ID is missing or invalid",
            };
        }

        if (
            typeof recipient.amount !== "number" ||
            recipient.amount <= 0
        ) {
            return {
                phone: recipient.phone,
                wallet_id: recipient.recipientWalletId,
                amount: recipient.amount ?? 0,
                idempotency_key: recipient.idempotency_key,
                status: "FAILED",
                error_reason: "Amount is missing or invalid",
            };
        }

        return {
            phone: recipient.phone,
            wallet_id: recipient.recipientWalletId,
            amount: recipient.amount,
            idempotency_key: recipient.idempotency_key,
            status: "PENDING",
        };
    });

    // Mark duplicates as FAILED
    const seenPhones = new Set<number>();
    const seenWalletIds = new Set<string>();

    const finalMembers = members.map((member) => {
        if (member.status === "FAILED") return member;

        if (
            seenPhones.has(member.phone) ||
            seenWalletIds.has(member.wallet_id)
        ) {
            return {
                ...member,
                status: "FAILED",
                error_reason: "Duplicate phone or wallet ID",
            };
        }

        seenPhones.add(member.phone);
        seenWalletIds.add(member.wallet_id);

        return member;
    });

    // Pending users only
    const pendingRecipients = finalMembers
        .filter((member) => member.status === "PENDING")
        .map((member) => ({
            phone: member.phone,
            recipientWalletId: member.wallet_id,
            amount: member.amount,
            idempotency_key: member.idempotency_key,
        }));

    const calculatedTotalAmount = pendingRecipients.reduce(
        (sum, recipient) => sum + recipient.amount,
        0
    );

    const calculatedTotalUsers = pendingRecipients.length;

    // Minimum 1 valid recipient
    if (calculatedTotalUsers === 0) {
        throw new ApiError(
            t("MINIMUM_ONE_RECIPIENT_NEEDED", req.language) as string,
            400
        );
    }

    // Maximum 10 valid recipients
    // if (calculatedTotalUsers > 20) {
    //     throw new ApiError(
    //         t("MAX_MEMBERS_PER_GROUP_TRANSACTION", req.language) as string,
    //         400
    //     );
    // }

    // Validate only pending users
    const validationResult: ValidationResult = await validateGroupPayment(
        {
            groupId,
            groupPaymentKey,
            recipients: pendingRecipients,
            user: userDetails.user,
            total_amount: calculatedTotalAmount,
            total_users: calculatedTotalUsers,
            lang: req?.language || "en",
            user_notes,
        },
        req.language
    );

    // Store all members (PENDING + FAILED)
    await groupPaymentModel.create({
        groupId,
        groupPaymentKey,
        notes: user_notes,
        created_by: user._id,
        total_amount: calculatedTotalAmount,
        grand_total: validationResult.grand_total,
        total_members: finalMembers.length,
        success_count: 0,
        processing_fee: validationResult.processing_fee,
        processing_fee_type: validationResult.processing_fee_type,
        total_fee: validationResult.totalFee,
        failed_count: finalMembers.filter((m) => m.status === "FAILED").length,
        members: finalMembers,
    });

    // Start payment only for pending users
    startGroupPayment(
        {
            groupId,
            groupPaymentKey,
            recipients: pendingRecipients,
            user: userDetails.user,
            total_amount: calculatedTotalAmount,
            total_users: calculatedTotalUsers,
            lang: req?.language || "en",
            user_notes,

            senderWallet: validationResult.senderWallet,
            totalDebit: validationResult.totalDebit,
            feeAmount: validationResult.feeAmount,
            feePercentage: validationResult.feePercentage,
            fee_type: validationResult.fee_type,
            fee_value: validationResult.fee_value,
            adminWallet: validationResult.adminWallet,
            senderBlockedUsers: validationResult.senderBlockedUsers
        },
        req.language
    ).catch((error: any) => {
        const errorMsg =
            error.response?.message ||
            error.message ||
            t("ERROR_WHILE_GROUP_PAYMENT", req.language);

        console.error(errorMsg);
    });

    // Send chat event only for pending users
    const tempMember = pendingRecipients.map((member) => member.phone.toString());

    const eventObj = {
        conversationId: groupId,
        messageId: groupPaymentKey,
        senderId: userDetails.user.phone.toString(),
        content: {
            notes: user_notes,
            members: tempMember,
            amount:
                calculatedTotalUsers > 0
                    ? calculatedTotalAmount / calculatedTotalUsers
                    : 0,
        },
        messageType: "money",
        status: "delivered",
        timestamp: new Date(),
        otherMember: tempMember,
        conv_type: "group",
    };

    await redisPublisher.publish("chat", JSON.stringify(eventObj));

    return new ApiResponse(
        200,
        eventObj,
        t("GROUP_PAYMENT_PROCESSING", req.language) as string
    );
});






// import { Request } from 'express';
// import { asyncHandler } from '../../utils/asyncHandler';
// import { getUserById } from '../../services/auth/auth.service';
// import { startGroupPayment } from '../../services/groupPayment/startGroupPayment.service';
// import { ApiResponse } from '../../utils/apiResponse';
// import groupPaymentModel from '../../models/groupPayment.model';
// import { redisPublisher } from "../../redis/redisClient";
// import { ApiError } from '../../utils/apiError';
// import { t } from '../../../i18n';
// import { validateGroupPayment } from '../../services/groupPayment/validateGroupPayment';

// // // CREATE GROUP PAYMENT FROM GROUP CHAT
// // // USER CAN PAY TO SELECTED MEMBERS.

// interface RecipientPayload {
//     phone: number;
//     idempotency_key: string;
//     recipientWalletId: string;
//     amount: number;
// }

// interface GroupPaymentPayload {
//     recipients: RecipientPayload[]
//     groupId: string;
//     groupPaymentKey: string;
//     user_notes: string,
// }

// export const createGroupPayment = asyncHandler(
//     async (req: Request) => {
//         const payload = req.body as GroupPaymentPayload

//         const {
//             groupId,
//             groupPaymentKey,
//             user_notes,
//             recipients
//         } = payload

//         const user = req.user

//         // SENDER TOKEN
//         const token = req.headers["authorization"]?.split(" ")[1] as string; // Get user token from client request

//         // SENDER DETAILS
//         const userDetails = await getUserById({ user_id: user._id })


//         // FILTER VALID RECIPIENTS
//         const validRecipients = recipients.filter((recipient) => {
//             if (!recipient || typeof recipient !== "object") return false;

//             return (
//                 typeof recipient.phone === "number" &&
//                 Number.isFinite(recipient.phone) &&
//                 recipient.phone > 0 &&
//                 typeof recipient.recipientWalletId === "string" &&
//                 recipient.recipientWalletId.trim() !== "" &&
//                 typeof recipient.amount === "number" &&
//                 recipient.amount > 0
//             );
//         });


//         // REMOVE DUPLICATE RECIPIENTS (same phone OR same wallet ID)
//         const seenPhones = new Set<number>();
//         const seenWalletIds = new Set<string>();

//         const uniqueRecipients = validRecipients.filter((recipient) => {
//             if (
//                 seenPhones.has(recipient.phone) ||
//                 seenWalletIds.has(recipient.recipientWalletId)
//             ) {
//                 return false;
//             }

//             seenPhones.add(recipient.phone);
//             seenWalletIds.add(recipient.recipientWalletId);
//             return true;
//         });

//         // CALCULATE TOTALS FROM UNIQUE RECIPIENTS
//         const calculatedTotalAmount = uniqueRecipients.reduce(
//             (sum, recipient) => sum + recipient.amount,
//             0
//         );

//         const calculatedTotalUsers = uniqueRecipients.length;

//         // CREATE MEMBERS FROM UNIQUE RECIPIENTS
//         const members = uniqueRecipients.map((recipient) => ({
//             phone: recipient.phone,
//             wallet_id: recipient.recipientWalletId,
//             amount: recipient.amount,
//             status: "PENDING",
//         }));

//         // MINIMUM 1 MEMBER NEEDS
//         if (calculatedTotalUsers === 0) {
//             throw new ApiError(t("MINIMUM_ONE_RECIPIENT_NEEDED", req.language) as string, 400);
//         }

//         // ONLY 10 MEMBERS PER GROUP TRANSACTION
//         if (calculatedTotalUsers > 10) {
//             throw new ApiError(t("MAX_MEMBERS_PER_GROUP_TRANSACTION", req.language) as string, 400);
//         }

//         // VALIDATE GROUP PAYMENT WITH SENDER WALLET
//         await validateGroupPayment({
//             groupId,
//             groupPaymentKey,
//             recipients: uniqueRecipients,
//             user: userDetails.user,
//             total_amount: calculatedTotalAmount,
//             total_users: calculatedTotalUsers,
//             lang: req?.language || "en",
//             user_notes,
//         }, req.language)


//         // CREATE GROUP MODEL
//         await groupPaymentModel.create({
//             groupId,
//             groupPaymentKey,
//             notes: user_notes,
//             created_by: user._id,
//             total_amount: calculatedTotalAmount,
//             grand_total: 0,
//             total_members: calculatedTotalUsers,
//             members,
//         });

//         // START GROUP PAYMENT IN WALLET SERVICE
//         startGroupPayment({
//             groupId,
//             groupPaymentKey,
//             recipients: uniqueRecipients,
//             user: userDetails.user,
//             total_amount: calculatedTotalAmount,
//             total_users: calculatedTotalUsers,
//             lang: req?.language || "en",
//             token,
//             user_notes,
//         }, req.language).catch((error: any) => {
//             const errorMsg = error.response.message || error.message || t("ERROR_WHILE_GROUP_PAYMENT", req.language)
//             console.error(errorMsg);
//             throw new ApiError(errorMsg, 400)
//         })

//         let tempMember = [...seenPhones].map((member) => member.toString())
//         const eventObj = {
//             conversationId: groupId,
//             messageId: groupPaymentKey,
//             senderId: userDetails.user.phone.toString(),
//             content: {
//                 notes: user_notes,
//                 members: tempMember,
//                 amount: calculatedTotalAmount / uniqueRecipients.length,
//             },
//             messageType: 'money',
//             status: 'delivered',
//             timestamp: new Date(),
//             otherMember: tempMember,
//             conv_type: 'group'
//         };

//         await redisPublisher.publish("chat", JSON.stringify(eventObj));

//         // return new ApiResponse(200, eventObj, t("GROUP_PAYMENT_SUCCESS", req.language) as string)
//         return new ApiResponse(200, eventObj, t("GROUP_PAYMENT_PROCESSING", req.language) as string)

//     }
// )