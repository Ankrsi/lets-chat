import { t } from "../../../i18n";
import express from "express";
import { redisClient } from "../../redis/redisClient";
import { ApiResponse } from "../../utils/apiResponse";
import { asyncHandler } from "../../utils/asyncHandler";

const router = express.Router();

const ttl = process.env.REDIS_TTL || 3600; // Default TTL of 1 hour

export const setPackageDetails = asyncHandler(async (req, res) => {
  const { package_id, data } = req.body;

  if (!package_id || !data) {
    return new ApiResponse(400, null, t("PACKAGE_ID_AND_DATA_ARE_REQUIRED_FIELDS", req.language || "en") as string);
  }

  let redisResponse = await redisClient.set(`package:${package_id}`, JSON.stringify(data), {
    EX: Number(ttl),
  });
  return new ApiResponse(200, redisResponse, t("PACKAGE_DETAILS_STORED_SUCCESSFULLY", req.language || "en") as string);
});

export const getPackageDetails = asyncHandler(async (req, res) => {
  const userDetails = await redisClient.get(`package:${req.params.package_id}`);
  if (!userDetails) return new ApiResponse(404, userDetails, t("DATA_NOT_FOUND", req.language || "en") as string);

  return new ApiResponse(200, JSON.parse(userDetails), t("PACKAGE_DETAILS_RETRIEVED_SUCCESSFULLY", req.language || "en") as string);
});

export default router;
