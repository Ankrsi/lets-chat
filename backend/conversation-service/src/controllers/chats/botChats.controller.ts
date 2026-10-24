import { t } from "../../../i18n";
import BotConversation from "../../models/chatModal/botConversation.model";
import { ApiResponse } from "../../utils/apiResponse";
import { asyncHandler } from "../../utils/asyncHandler";
import { Request, Response } from "express";

export const botCreateConversation = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return new ApiResponse(401, null, t("USER_NOT_FORUND", req.language || "en") as string);
  try {
    // check existing
    const existing = await BotConversation.findOne({ member: req.user.phone });
    if (existing) return new ApiResponse(200, existing, t("CONVERSATIONS_CREATED", req.language || "en") as string);

    const convData: any = { member: req.user.phone };

    const conv = await BotConversation.create(convData);
    return new ApiResponse(200, conv, t("CONVERSATIONS_CREATED", req.language || "en") as string);
  } catch {
    return new ApiResponse(500, null, t("SERVER_ERROR", req.language || "en") as string);
  }
});