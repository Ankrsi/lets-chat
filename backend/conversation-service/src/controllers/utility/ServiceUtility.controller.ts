import { t } from "../../../i18n";
import express from "express";
import { redisClient } from "../../redis/redisClient";
import { ApiResponse } from "../../utils/apiResponse";
import { asyncHandler } from "../../utils/asyncHandler";

const router = express.Router();

const ttl = process.env.REDIS_TTL || 3600; // Default TTL of 1 hour

export const setServiceDetails = asyncHandler(async (req, res) => {
  const { service_id, data } = req.body;

  if (!service_id || !data) {
    return new ApiResponse(400, null, t("SERVICE_ID_AND_DATA_ARE_REQUIRED_FIELDS", req.language || "en") as string);
  }

  let redisResponse = await redisClient.set(`service:${service_id}`, JSON.stringify(data), {
    EX: Number(ttl),
  });
  return new ApiResponse(200, redisResponse, t("SERVICE_DETAILS_STORED_SUCCESSFULLY", req.language || "en") as string);
});

export const getServiceDetails = asyncHandler(async (req, res) => {
  const serviceDetails = await redisClient.get(`service:${req.params.service_id}`);
  if (!serviceDetails) return new ApiResponse(404, serviceDetails, t("DATA_NOT_FOUND", req.language || "en") as string);

  return new ApiResponse(200, JSON.parse(serviceDetails), t("SERVICE_DETAILS_RETRIEVED_SUCCESSFULLY", req.language || "en") as string);
});

export default router;
