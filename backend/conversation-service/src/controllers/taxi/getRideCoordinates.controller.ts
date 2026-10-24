import { asyncHandler } from '../../utils/asyncHandler';
import { ApiResponse } from '../../utils/apiResponse';
import { ApiError } from '../../utils/apiError';
import { getRideCoordinatesService } from '../../services/taxiservices/getRideCoordinates.service';

export const getRideCoordinates = asyncHandler(async (req, res) => {
  const { ride_id } = req.params;

  if (!ride_id) {
    throw new ApiError('ride_id is required', 400);
  }

  const result = await getRideCoordinatesService(ride_id);

  return new ApiResponse(200, result, 'Ride coordinates fetched successfully');
});
