import mongoose, { Schema, Document } from "mongoose";

interface Coordinate {
  lat: number;
  lng: number;
  timestamp: Date;
}

interface Passenger {
  passengerId: string;
  status: "waiting" | "onboard" | "dropped";
  coordinates: Coordinate[];
}

export interface PoolRideCoordinateDoc extends Document {
  poolRideId: string;
  driverId: string;
  driverStatus: "idle" | "started" | "completed"; // 👈 NEW FIELD
  driverCoordinates: Coordinate[];
  passengers: Passenger[];
  createdAt: Date;
  updatedAt: Date;
}

const CoordinateSchema = new Schema<Coordinate>({
  lat: Number,
  lng: Number,
  timestamp: { type: Date, default: Date.now },
});

const PassengerSchema = new Schema<Passenger>({
  passengerId: String,
  status: { type: String, enum: ["waiting", "onboard", "dropped"] },
  coordinates: [CoordinateSchema],
});

const PoolRideCoordinateSchema = new Schema<PoolRideCoordinateDoc>(
  {
    poolRideId: { type: String, required: true, index: true },
    driverId: { type: String, required: true },
    driverStatus: { // 👇 NEW field added here
      type: String,
      enum: ["idle", "started", "completed"],
      default: "idle",
    },
    driverCoordinates: [CoordinateSchema],
    passengers: [PassengerSchema],
  },
  { timestamps: true }
);

export default mongoose.model<PoolRideCoordinateDoc>(
  "Taxi_PoolRideCoordinate",
  PoolRideCoordinateSchema
);
