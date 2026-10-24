import { t } from "../../../i18n";
import { asyncHandler } from "../../utils/asyncHandler";
import { ApiResponse } from "../../utils/apiResponse";
import { RideCoordinate } from "../../models/taximodel/RideCoordinate";

/**
 * @desc Fetch only lat/lng coordinates for a ride (for map polyline)
 * @route GET /api/taxi/ride/polyline/:rideId
 */
const getRidePolyline = asyncHandler(async (req, res) => {
  const { rideId } = req.params;

  if (!rideId) {
    return new ApiResponse(400, null, t("RIDEID_IS_REQUIRED", req.language || "en") as string);
  }

  const ride = await RideCoordinate.findOne({  rideId: rideId.toString() }, { "coordinates.lat": 1, "coordinates.lng": 1, _id: 0 });

  if (!ride) {
    return new ApiResponse(404, null, t("RIDE_NOT_FOUND", req.language || "en") as string);
  }

  // Extract only lat/lng from coordinates
  const polylinePoints =
    ride.coordinates?.map((coord) => ({
      lat: coord.lat,
      lng: coord.lng,
    })) || [];

  return new ApiResponse(200, polylinePoints, t("POLYLINE_COORDINATES_FETCHED_SUCCESSFULLY", req.language || "en") as string);
});

export { getRidePolyline };
