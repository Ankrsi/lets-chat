import { Socket } from "socket.io";
import { Producer } from "kafkajs";

export const poolAcceptHandler = (socket: Socket, kafkaProducer: Producer) => {
  socket.on("driverAcceptedPoolRide", async (data) => {
    // console.info("Pool accept received:", data);

    try {
      await kafkaProducer.send({
        topic: "pool.ride.accepted",
        messages: [
          {
            key: data.requestId,
            value: JSON.stringify({
              ...data,
              status: data.status || "accepted",
              ts: Date.now(),
            }),
          },
        ],
      });

      // console.info("Pool accept sent to Kafka");
    } catch (err) {
      console.error("Error sending pool accept to Kafka:", err);
    }
  });
};
