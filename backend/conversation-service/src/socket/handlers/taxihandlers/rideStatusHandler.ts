import { Socket } from "socket.io";
import { Producer } from "kafkajs";

export const rideStatusHandler = (socket: Socket, kafkaProducer: Producer) => {
  socket.on("setRideStatus", async (data) => {
    console.info("Ride status received:", data);

    try {
      // ✅ Only send to Kafka
      await kafkaProducer.send({
        topic: "ride.status",
        messages: [{ key: data.rideId, value: JSON.stringify(data) }],
      });

      // console.info("Ride status sent to Kafka");
    } catch (err) {
      console.error("Error sending ride status:", err);
    }
  });
};
