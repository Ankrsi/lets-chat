// driverGeoKafkaHandler.ts
import { Socket } from "socket.io";
import { Producer } from "kafkajs";
import { redisClient } from "../../../redis/redisClient"; // Import redisClient for GEO operations

export const driverGeoKafkaHandler = (socket: Socket, kafkaProducer: Producer) => {
  socket.on("driverGeoUpdateKafka", async (data) => {
    const { taxi_driver_id, lat, lng } = data;

    if (!taxi_driver_id || !lat || !lng) {
      // console.info("⚠️ Missing driver location data:", data);
      return;
    }

    try {
      await kafkaProducer.send({
        topic: "driver.geo.updated",
        messages: [{ value: JSON.stringify({ taxi_driver_id, lat, lng }) }],
      });

      // console.info(`✅ [Kafka] Location event sent for driver ${taxi_driver_id}`);
    } catch (err) {
      console.error("❌ [Kafka] Error sending driverGeoUpdate:", err);
    }
  });

  // New: Manual disconnect handler
  socket.on("driverManualDisconnect", async (data) => {
    const { taxi_driver_id } = data;

    if (!taxi_driver_id) {
      console.error("⚠️ Missing driver ID in manual disconnect:", data);
      return;
    }

    try {
      // Remove driver's location from Redis GEO set
      await redisClient.zRem("driver_locations", taxi_driver_id);
      // console.log(`✅ Removed location for driver ${taxi_driver_id} from Redis`);

      // Optional: Send a Kafka event for further processing (e.g., notify system of offline status)
      await kafkaProducer.send({
        topic: "driver.offline", // Create a new topic if needed
        messages: [{ value: JSON.stringify({ taxi_driver_id }) }],
      });
      // console.log(`✅ [Kafka] Offline event sent for driver ${taxi_driver_id}`);

      // Disconnect the socket gracefully
      socket.disconnect();
      // console.info(`✅ Driver ${taxi_driver_id} manually disconnected: ${socket.id}`);
    } catch (err) {
      console.error("❌ Error during manual disconnect:", err);
    }
  });
};
