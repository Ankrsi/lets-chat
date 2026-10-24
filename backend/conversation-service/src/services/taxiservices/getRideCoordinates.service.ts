import { ApiError } from '../../utils/apiError';
import { RideCoordinate } from '../../models/taximodel/RideCoordinate';
import PoolRideCoordinate from '../../models/taximodel/PoolRideCoordinate';

export const getRideCoordinatesService = async (ride_id: string) => {

  // ✅ NORMAL RIDE
  const normalRide = await RideCoordinate.findOne({
    rideId: ride_id
  });

  if (normalRide) {
    return {
      type: 'normal',
      data: normalRide.toObject()
    };
  }

  // ✅ POOL RIDE
  const poolRide = await PoolRideCoordinate.findOne({
    poolRideId: ride_id
  });

  if (poolRide) {
    return {
      type: 'pool',
      data: {
        _id: poolRide._id,
        rideId: poolRide.poolRideId,
        driverId: poolRide.driverId,
        driverStatus: poolRide.driverStatus,
        coordinates: poolRide.driverCoordinates,
        passengers: poolRide.passengers
      }
    };
  }

  // ❌ NOT FOUND
  throw new ApiError('Ride coordinates not found', 404);
};