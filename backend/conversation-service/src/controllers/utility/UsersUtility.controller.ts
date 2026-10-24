import { t } from "../../../i18n";
import express from "express";
import { redisClient } from "../../redis/redisClient";
import { ApiResponse } from "../../utils/apiResponse";
import { asyncHandler } from "../../utils/asyncHandler";

const router = express.Router();

const ttl = process.env.REDIS_TTL || 3600; // Default TTL of 1 hour

export const setUsersDetails = asyncHandler(async (req, res) => {
  const { user_id, data } = req.body;

  if (!user_id || !data) {
    return new ApiResponse(400, null, t("USER_ID_AND_DATA_ARE_REQUIRED_FIELDS", req.language || "en") as string);
  }

  let redisResponse = await redisClient.set(`user:${user_id}`, JSON.stringify(data), {
    EX: Number(ttl),
  });
  return new ApiResponse(200, redisResponse, t("USER_DETAILS_STORED_SUCCESSFULLY", req.language || "en") as string);
});

export const getUsersDetails = asyncHandler(async (req, res) => {
  const userDetails = await redisClient.get(`user:${req.params.user_id}`);
  if (!userDetails) return new ApiResponse(404, userDetails, t("DATA_NOT_FOUND", req.language || "en") as string);

  return new ApiResponse(200, JSON.parse(userDetails), t("USER_DETAILS_RETRIEVED_SUCCESSFULLY", req.language || "en") as string);
});

export const deleteUsersDetails = asyncHandler(async (req, res) => {
  const { email, phone, user_id } = req.body;

  if (!email && !phone && !user_id) {
    return new ApiResponse(400, null, t("EMAIL_OR_PHONE_OR_USER_ID_IS_REQUIRED", req.language || "en") as string);
  }

  let redisResponse = null;
  if (user_id) {
    redisResponse = await redisClient.del(`user:${user_id}`);
  } else {
    let cursor = "0";
    redisResponse = 0;

    do {
      const { cursor: newCursor, keys } = await redisClient.scan(cursor, {
        MATCH: "user:*",
        COUNT: 500,
      });

      if (keys.length > 0) {
        const values = (await redisClient.mGet(keys)) as any[];
        const toDelete: any = [];

        values?.forEach((value, index) => {
          if (value) {
            try {
              const { email: userEmail, phone: userPhone } = JSON.parse(value);
              if ((email && userEmail === email) || (phone && userPhone === phone)) {
                toDelete.push(keys[index]);
              }
            } catch (err) {
              console.error(`Error parsing key ${keys[index]}`, err);
            }
          }
        });

        if (toDelete.length > 0) {
          await redisClient.del(toDelete);
          redisResponse += toDelete.length;
        }
      }

      cursor = newCursor;
    } while (cursor !== "0");
  }

  return new ApiResponse(200, redisResponse, t("RADIS_USER_DETAILS_DELETED_SUCCESSFULLY", req.language || "en") as string);
});

export default router;
