import { StatusPrivacy } from "../../models/chatModal/statusPrivacy.model";
import { asyncHandler } from "../../utils/asyncHandler";
import { Request, Response } from "express";
import { ApiResponse } from "../../utils/apiResponse";
import { deleteR2Object, keyFromPublicUrl, uploadToR2 } from "../../utils/r2Upload";
import mongoose from "mongoose";
import AllFriendsContact from "../../models/contactModal/allFriendsContact.model";
import { redisPublisher } from "../../redis/redisClient";
import { ChatStatus } from "../../models/chatModal/status.modal";


// add image/video status
export const addStatus = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return new ApiResponse(401, null, "User not found");
    if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
        return new ApiResponse(400, null, "No image or video is available to upload");
    }
    try {
        const files = req.files as Express.Multer.File[];
        const timestamp = req.body.timestamp ? new Date(req.body.timestamp) : new Date();
        const captions = Array.isArray(req.body.captions) ? req.body.captions : [req.body.captions];
        const typeOf = (f: Express.Multer.File) =>
            f.mimetype.startsWith("image/") ? "image" : f.mimetype.startsWith("video/") ? "video" : null;
        if (files.some((f) => !typeOf(f))) return new ApiResponse(400, null, "Only images and videos can be posted");

        // Upload all files at once, then save every story in one write
        const urls = await Promise.all(files.map((file) =>
            uploadToR2({ file, folder: `status-${req.user?.phone}-${new mongoose.Types.ObjectId()}` })));
        const expiresAt = new Date(timestamp.getTime() + 24 * 60 * 60 * 1000);
        await ChatStatus.insertMany(files.map((file, i) => ({
            phone: req.user.phone,
            url: urls[i],
            type: typeOf(file),
            caption: captions[i] || null,
            viewers: [],
            createdAt: timestamp,
            expiresAt,
        })));

        await redisPublisher.publish(`chatStatusRefresh`, JSON.stringify({ phone: req.user.phone }));

        return new ApiResponse(200, null, "Your status has been added");
    } catch (err) {
        console.error(err);
        return new ApiResponse(500, null, "Server error");
    }
});

// remove image/video status
export const removeStatus = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return new ApiResponse(401, null, "User not found");
    const { storyId } = req.body;
    if (!mongoose.Types.ObjectId.isValid(storyId)) return new ApiResponse(400, null, "Invalid status id");

    // Only the owner can delete their status
    const deletedStory = await ChatStatus.findOneAndDelete({ _id: storyId, phone: String(req.user.phone) }).lean();
    if (!deletedStory) {
        return new ApiResponse(400, null, "Your status not found");
    }
    const key = keyFromPublicUrl(deletedStory.url);
    if (key) deleteR2Object(key).catch((e) => console.error("delete status file failed", e));

    await redisPublisher.publish(`chatStatusRefresh`, JSON.stringify({ phone: req.user.phone }));
    return new ApiResponse(200, null, "Your status has been deleted");
});

// get all status
export const getAllStatus = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return new ApiResponse(401, null, "User not found");
    try {
        const contactsData: any = await AllFriendsContact.findOne({ phone: req.user.phone }).select("-_id contacts.phone").lean();

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

        // Viewer lists are only for the owner; on other people's stories just say whether I've seen it
        const me = req.user.phone.toString();
        for (const group of allStatus) {
            if (group.phone === me) continue;
            for (const story of group.stories) {
                story.viewers = (story.viewers ?? []).filter((v: any) => String(v.phone) === me);
            }
        }

        return new ApiResponse(200, allStatus, "All Status fetched.");
    } catch {
        return new ApiResponse(500, null, "Server error");
    }
});

// mark as viewed
export const markStatusAsViewed = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return new ApiResponse(401, null, "User not found");
    try {
        const { statusId } = req.params;
        const { timestamp } = req.query;
        if (!statusId) return new ApiResponse(400, null, "Status ID is required");

        if (!mongoose.Types.ObjectId.isValid(statusId)) return new ApiResponse(400, null, "Invalid status id");
        const viewedAt = timestamp ? new Date(timestamp as string) : new Date();

        // One atomic write: added only if this viewer isn't in the list yet
        const { matchedCount } = await ChatStatus.updateOne(
            { _id: statusId, "viewers.phone": { $ne: req.user.phone } },
            { $push: { viewers: { phone: req.user.phone, viewedAt } } },
        );
        if (!matchedCount && !(await ChatStatus.exists({ _id: statusId }))) {
            return new ApiResponse(404, null, "Story not found");
        }

        return new ApiResponse(200, null, "Marked as viewed");
    }
    catch {
        return new ApiResponse(500, null, "Server error");
    }
});

// user set status privecy
export const statusPrivecy = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return new ApiResponse(401, null, "User not found");

    try {
        const { phoneNumbers, type } = req.body;
        if (!phoneNumbers || !type) return new ApiResponse(400, null, "Phone numbers and type are required");
        if (!Array.isArray(phoneNumbers) || phoneNumbers?.length < 1) return new ApiResponse(400, null, "At least 1 phone number is required");

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

        return new ApiResponse(200, status, "Status privacy updated successfully");
    }
    catch {
        return new ApiResponse(500, null, "Server error");
    }

});

// get user status privecy
export const getStatusPrivecy = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return new ApiResponse(401, null, "User not found");

    try {
        const status = await StatusPrivacy.findOne(
            { userId: req.user.phone?.toString() }
        ).select('-_id -__v').lean();
        return new ApiResponse(200, status, "Status privacy fetched successfully");
    }
    catch {
        return new ApiResponse(500, null, "Server error");
    }

});