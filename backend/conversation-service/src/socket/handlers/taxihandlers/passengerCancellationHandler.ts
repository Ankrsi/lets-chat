// handlers/taxihandlers/passengerCancellationHandler.ts
import { Socket, Server } from "socket.io";

export const passengerCancellationHandler = (socket: Socket, io: Server) => {
  socket.on("passengerCanceledRide", ({ rideId, reason }) => {
    if (!rideId) return;
    const message = `Ride canceled by passenger: ${reason || "No reason provided"}`;
    // Notify everyone in ride room (driver + any other subscribers)
    io.to(rideId).emit("rideCanceledByPassenger", { message, rideId });
    // Unified stream emit
    io.to(rideId).emit("rideStream", {
      type: "cancellation",
      rideId,
      ts: Date.now(),
      data: { by: "PASSENGER", reason },
      v: 1,
    });
    // Optional: remove all passenger sockets from the room (keep driver if needed)
    const roomSockets = io.sockets.adapter.rooms.get(rideId);
    if (roomSockets) {
      for (const socketId of roomSockets) {
        // Example optional filter to only remove non-driver sockets if you tag roles on handshake/auth
        io.sockets.sockets.get(socketId)?.leave(rideId);
      }
    }
  });
};
