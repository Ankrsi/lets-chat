import { Socket } from "socket.io";
import { Producer } from "kafkajs";
import { redisPublisher } from "../../../redis/redisClient";

export const deliveryLocationHandler = (
  socket: Socket,
  kafkaProducer: Producer
) => {
  socket.on("deliveryLocationUpdate", async (data) => {
    try {
      await kafkaProducer.send({
        topic: "delivery.location.updated",
        messages: [
          {
            value: JSON.stringify(data),
          },
        ],
      });

      await redisPublisher.publish(
        `delivery:${data.deliveryId}`,
        JSON.stringify(data)
      );

      await redisPublisher.set(
        `delivery:last-location:${data.deliveryId}`,
        JSON.stringify(data),
        {
          EX: 60 * 60,
        }
      );
    } catch (err) {
      console.error("Delivery location update error:", err);
    }
  });
};
