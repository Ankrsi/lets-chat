import { Socket } from "socket.io";
import { Producer } from "kafkajs";

export const orderStatusHandler = (
    socket: Socket,
    kafkaProducer: Producer
) => {
    socket.on("setOrderStatus", async (data) => {
        console.info("Order status received:", data);

        try {
            await kafkaProducer.send({
                topic: "order.status",
                messages: [
                    {
                        key: data.orderId,
                        value: JSON.stringify(data),
                    },
                ],
            });

            console.info("Order status sent to Kafka");
        } catch (err) {
            console.error("Error sending order status:", err);
        }
    });
};