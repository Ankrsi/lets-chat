import { Socket } from "socket.io";
import { Producer } from "kafkajs";
import { redisPublisher } from "../../../redis/redisClient";

export const driverLocationHandler = (socket: Socket, kafkaProducer: Producer) => {
  socket.on("locationUpdateFromDriver", async (data) => {
    // console.info("Driver location received:", data);

    try {
      // 1️⃣ Send to Kafka
      await kafkaProducer.send({
        topic: "driver.location.updated",
        messages: [{ value: JSON.stringify(data) }],
      });

      // 2️⃣ Publish to Redis ride channel
      await redisPublisher.publish(
        `ride:${data.rideId}`, // 🔥 using rideId instead of taskId
        JSON.stringify(data),
      );

      // ✅ ADDED: last location cache
      await redisPublisher.set(
        `ride:last-location:${data.rideId}`,
        JSON.stringify(data),
        { EX: 60 * 60 }
      );

      // console.info("Driver location sent to Kafka + Redis (ride channel)");
    } catch (err) {
      console.error("Error sending driver location:", err);
    }
  });
};
