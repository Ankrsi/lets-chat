import { t } from "../../../i18n";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/apiResponse";
import { getNearbyDriversSer } from "../../services/taxiservices/getNearbyDriversSer.service";

const getNearbyDrivers = asyncHandler(async (req, res) => {
  const { lat, lng, radiusKm } = req.query;

  if (!lat || !lng || !radiusKm) {
    return new ApiResponse(400, null, t("LAT_LNG_AND_RADIUSKM_ARE_REQUIRED", req.language || "en") as string);
  }

  const drivers = await getNearbyDriversSer.getNearbyDrivers(
    parseFloat(lat as string),
    parseFloat(lng as string),
    parseFloat(radiusKm as string),
  );

  return new ApiResponse(200, drivers, t("NEARBY_DRIVERS_FETCHED_SUCCESSFULLY", req.language || "en") as string);
});

export { getNearbyDrivers };
