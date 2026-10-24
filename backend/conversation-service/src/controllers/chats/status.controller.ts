import { StatusPrivacy } from "../../models/chatModal/statusPrivacy.model";
import { asyncHandler } from "../../utils/asyncHandler";
import { Request, Response } from "express";
import { ApiResponse } from "../../utils/apiResponse";
import { t } from "i18next";
import { uploadToS3 } from "../../utils/s3Upload";
import mongoose from "mongoose";
import AllFriendsContact from "../../models/contactModal/allFriendsContact.model";
import { redisPublisher } from "../../redis/redisClient";
import { ChatStatus } from "../../models/chatModal/status.modal";


// add image/video status
export const addStatus = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return new ApiResponse(401, null, t("USER_NOT_FORUND", req.language || "en") as string);
    if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
        return new ApiResponse(400, null, t("NO_IMAGE_OR_VIDEO_IS_AVAILABLE_TO_UPLOAD", req.language || "en") as string);
    }
    try {
        let index = 0;
        let timestamp = req.body.timestamp ? new Date(req.body.timestamp) : new Date();
        const captions = Array.isArray(req.body.captions)
            ? req.body.captions
            : [req.body.captions];

        for (let file of req.files as Express.Multer.File[]) {
            const mediaType = file.mimetype.startsWith("image/") ? "image" : file.mimetype.startsWith("video/") ? "video" : null;
            const uploadedUrl = await uploadToS3({
                file,
                folder: `status-${req.user?.phone}-${new mongoose.Types.ObjectId()}`,
            });
            if (!uploadedUrl || !mediaType) return new ApiResponse(400, null, t("MEDIAURL_AND_MEDIATYPE_REQUIRED", req.language || "en") as string);

            // Create individual story document
            await ChatStatus.create({
                phone: req.user.phone,
                url: uploadedUrl,
                type: mediaType,
                caption: captions[index] || null,
                viewers: [],
                createdAt: timestamp,
                expiresAt: new Date(timestamp.getTime() + 24 * 60 * 60 * 1000)
            });
            index++;
        }

        await redisPublisher.publish(`chatStatusRefresh`, JSON.stringify({ phone: req.user.phone }));

        return new ApiResponse(200, null, t("YOUR_STATUS_ADDED", req.language || "en") as string);
    } catch (err) {
        console.error(err);
        return new ApiResponse(500, null, t("SERVER_ERROR", req.language || "en") as string);
    }
});

// remove image/video status
export const removeStatus = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return new ApiResponse(401, null, t("USER_NOT_FORUND", req.language || "en") as string);
    const { storyId } = req.body;

    const storyObjectId = new mongoose.Types.ObjectId(storyId);
    const deletedStory = await ChatStatus.findByIdAndDelete(storyObjectId);

    if (!deletedStory) {
        return new ApiResponse(400, null, t("YOUR_STATUS_NOT_FOUND", req.language || "en") as string);
    }

    await redisPublisher.publish(`chatStatusRefresh`, JSON.stringify({ phone: req.user.phone }));
    return new ApiResponse(200, null, t("YOUR_STATUS_DELETED", req.language || "en") as string);
});

// get all status
export const getAllStatus = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return new ApiResponse(401, null, t("USER_NOT_FORUND", req.language || "en") as string);
    try {
        let contactsData = await AllFriendsContact.findOne({
            phone: req.user.phone
        });

        let phoneNumbers = contactsData?.contacts?.map((c: any) => c.phone.toString()) || [];

        const privacySettings = await StatusPrivacy.find({
            userId: { $in: phoneNumbers },
        }).lean();

        const privacyMap = new Map(
            privacySettings.map(p => [p.userId.toString(), p])
        );

        const tempPhone: string[] = [];

        for (const phone of phoneNumbers) {
            const privacy = privacyMap.get(phone);

            if (!privacy) {
                tempPhone.push(phone);
                continue;
            }

            const viewer = req.user.phone.toString();

            if (privacy.visibility === "my_contacts") {
                tempPhone.push(phone);
            } else if (
                privacy.visibility === "my_contacts_except" &&
                !privacy.exceptContacts?.includes(viewer)
            ) {
                tempPhone.push(phone);
            } else if (
                privacy.visibility === "only_share_with" &&
                privacy.onlyContacts?.includes(viewer)
            ) {
                tempPhone.push(phone);
            }
        }
        tempPhone.push(req.user.phone.toString());
        const now = new Date();

        // Query for non-expired stories and group by phone
        const allStatus = await ChatStatus.aggregate([
            {
                $match: {
                    phone: { $in: tempPhone },
                    expiresAt: { $gte: now }
                }
            },
            {
                $sort: { createdAt: -1 }
            },
            {
                $group: {
                    _id: "$phone",
                    phone: { $first: "$phone" },
                    stories: {
                        $push: {
                            _id: "$_id",
                            url: "$url",
                            type: "$type",
                            caption: "$caption",
                            viewers: "$viewers",
                            createdAt: "$createdAt",
                            expiresAt: "$expiresAt"
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    phone: 1,
                    stories: 1
                }
            }
        ]);

        return new ApiResponse(200, allStatus, t("ALL_STATUS_FETCHED", req.language || "en") as string);
    } catch {
        return new ApiResponse(500, null, t("SERVER_ERROR", req.language || "en") as string);
    }
});

// mark as viewed
export const markStatusAsViewed = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return new ApiResponse(401, null, t("USER_NOT_FORUND", req.language || "en") as string);
    try {
        const { statusId } = req.params;
        const { timestamp } = req.query;
        if (!statusId) return new ApiResponse(400, null, t("STATUSID_IS_REQUIRED", req.language || "en") as string);

        const viewedAt = timestamp ? new Date(timestamp as string) : new Date();
        const statusObjectId = new mongoose.Types.ObjectId(statusId);

        const story = await ChatStatus.findById(statusObjectId);
        if (!story) return new ApiResponse(404, null, t("STORY_NOT_FOUND", req.language || "en") as string);

        const alreadyViewed = story.viewers?.some((v: any) => v.phone.toString() === req.user.phone.toString());
        if (!alreadyViewed) {
            await ChatStatus.findByIdAndUpdate(
                statusObjectId,
                { $push: { viewers: { phone: req.user.phone, viewedAt } } },
                { new: true }
            );
        }

        return new ApiResponse(200, null, t("MARKED_AS_VIEWED", req.language || "en") as string);
    }
    catch {
        return new ApiResponse(500, null, t("SERVER_ERROR", req.language || "en") as string);
    }
});

// user set status privecy
export const statusPrivecy = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return new ApiResponse(401, null, t("USER_NOT_FORUND", req.language || "en") as string);

    try {
        const { phoneNumbers, type } = req.body;
        if (!phoneNumbers || !type) return new ApiResponse(400, null, t("PHONENUMBERS_AND_TYPE_IS_REQUIRED", req.language || "en") as string);
        if (!Array.isArray(phoneNumbers) || phoneNumbers?.length < 1) return new ApiResponse(400, null, t("PHONE_NUMBER_MUST_BE_ATLEAST_1", req.language || "en") as string);

        const userId = req.user.phone?.toString();
        let tempObj: Record<string, any> = {
            visibility: "my_contacts",
            exceptContacts: [],
            onlyContacts: []
        };

        if (type == 'my_contacts_except') {
            tempObj.visibility = "my_contacts_except";
            tempObj.exceptContacts = phoneNumbers;
        }
        else if (type == "only_share_with") {
            tempObj.visibility = "only_share_with";
            tempObj.onlyContacts = phoneNumbers;
        }

        const status = await StatusPrivacy.findOneAndUpdate(
            { userId },
            { $set: tempObj, $setOnInsert: { userId } },
            { new: true, upsert: true }
        );

        return new ApiResponse(200, status, t("STATUS_PRIVECY_UPDATED_SUCCEFULLY", req.language || "en") as string);
    }
    catch {
        return new ApiResponse(500, null, t("SERVER_ERROR", req.language || "en") as string);
    }

});

// get user status privecy
export const getStatusPrivecy = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return new ApiResponse(401, null, t("USER_NOT_FORUND", req.language || "en") as string);

    try {
        const status = await StatusPrivacy.findOne(
            { userId: req.user.phone?.toString() }
        ).select('-_id -__v').lean();
        return new ApiResponse(200, status, t("STATUS_PRIVECY_FETCH_SUCCEFULLY", req.language || "en") as string);
    }
    catch {
        return new ApiResponse(500, null, t("SERVER_ERROR", req.language || "en") as string);
    }

});