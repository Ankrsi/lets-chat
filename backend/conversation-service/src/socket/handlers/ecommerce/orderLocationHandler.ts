import { Socket } from "socket.io";
import { Producer } from "kafkajs";
import { redisPublisher } from "../../../redis/redisClient";

export const orderLocationHandler = (
  socket: Socket,
  kafkaProducer: Producer
) => {
  socket.on("orderLocationUpdate", async (data) => {
    try {
      await kafkaProducer.send({
        topic: "order.location.updated",
        messages: [
          {
            value: JSON.stringify(data),
          },
        ],
      });

      await redisPublisher.publish(
        `order:${data.orderId}`,
        JSON.stringify(data)
      );

      await redisPublisher.set(
        `order:last-location:${data.orderId}`,
        JSON.stringify(data),
        {
          EX: 60 * 60,
        }
      );
    } catch (err) {
      console.error("Order location update error:", err);
    }
  });
};