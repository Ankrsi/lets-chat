import { Socket } from "socket.io";
import { Producer } from "kafkajs";
import { redisPublisher } from "../../redis/redisClient";

export const locationHandler = (socket: Socket, kafkaProducer: Producer) => {
  socket.on("locationUpdateFromDriver", async (data) => {
    console.info("Driver location received:", data);

    try {
      // 1️⃣ Send to Kafka
      await kafkaProducer.send({
        topic: "driver.location.updated",
        messages: [{ value: JSON.stringify(data) }],
      });

      // 2️⃣ Publish to Redis task channel
      await redisPublisher.publish(`task:${data.taskId}`, JSON.stringify(data));

      console.info("Driver location sent to Kafka + Redis");
    } catch (err) {
      console.error("Error sending driver location:", err);
    }
  });
};
