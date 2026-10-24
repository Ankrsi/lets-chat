import { kafka } from "../kafkaClient";
import { redisClient } from "../../redis/redisClient";

export const driverGeoKafkaConsumer = async () => {
  // Create Kafka consumer for driver geo updates
  const consumer = kafka.consumer({ groupId: "driver-geo-kafka-consumer" });

  // Connect to Kafka
  await consumer.connect();

  // Subscribe to driver location update topic
  await consumer.subscribe({
    topic: "driver.geo.updated",
    fromBeginning: false,
  });

  // Start reading messages from Kafka
  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        if (!message.value) return;

        // Parse incoming message
        const { taxi_driver_id, lat, lng } = JSON.parse(
          message.value.toString(),
        );

        // console.info("\n----------------------------------------------");
        // console.info("📡 KAFKA DRIVER GEO UPDATE RECEIVED");
        // console.info(`🆔 Driver ID: ${taxi_driver_id}`);
        // console.info(`📍 New Location: lat=${lat}, lng=${lng}`);
        // console.info("----------------------------------------------");

        // Store driver location in Redis GEO dataset
        await redisClient.geoAdd("driver_locations", {
          longitude: lng,
          latitude: lat,
          member: taxi_driver_id,
        });

        // console.info(`🟢 Redis GEOADD successful for driver ${taxi_driver_id}`);

        // Set TTL so expired/offline drivers get removed
        await redisClient.expire("driver_locations", 300);
        // console.info("⏳ Redis TTL updated for 'driver_locations' = 300s");

        // console.info(`🚗 Kafka → Redis GEO updated for driver ${taxi_driver_id}`);
      } catch (err) {
        console.error("❌ Kafka → Redis processing error:", err);
      }
    },
  });
};
