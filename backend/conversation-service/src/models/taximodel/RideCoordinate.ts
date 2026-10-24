import mongoose, { Schema } from 'mongoose';

const coordinateSubSchema = new Schema({
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  timestamp: { type: Date, required: true },
  weatherCondition: { type: String }, // e.g., "rain"
  status: { type: String }, // e.g., "ongoing", "paused"
  currentFare: { type: Number, required: true }, // <-- add fare here
});

const rideCoordinateSchema = new Schema({
  rideId: { type: String, required: true, unique: true },
  coordinates: [coordinateSubSchema], // Array of coordinates for this ride
});

export const RideCoordinate = mongoose.model('Taxi_RideCoordinate', rideCoordinateSchema);
