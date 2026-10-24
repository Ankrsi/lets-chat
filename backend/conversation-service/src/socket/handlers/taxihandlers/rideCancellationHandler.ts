import { Socket, Server } from "socket.io";

export const rideCancellationHandler = (socket: Socket, io: Server) => {
  // Pass io for emitting to rooms
  // NEW: Listen for driver cancellation from frontend
  socket.on("driverCanceledRide", ({ rideId, reason }) => {
    console.info(`Driver canceled ride ${rideId} via socket`);
    const message = `Ride canceled by driver: ${reason || "No reason provided"}`;
    // Emit to passengers in the room
    io.to(rideId).emit("rideCanceled", { message, rideId });
    // Unified stream emit
    io.to(rideId).emit("rideStream", {
      type: "cancellation",
      rideId,
      ts: Date.now(),
      data: { by: "DRIVER", reason },
      v: 1,
    });
    // Force-unsubscribe all in the room
    const roomSockets = io.sockets.adapter.rooms.get(rideId);
    if (roomSockets) {
      for (const socketId of roomSockets) {
        io.sockets.sockets.get(socketId)?.leave(rideId);
      }
    }
  });
};
