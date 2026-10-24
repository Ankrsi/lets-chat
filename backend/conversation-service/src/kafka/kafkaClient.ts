import { Kafka } from "kafkajs";

if (!process.env.KAFKA_BROKER) {
  throw new Error("KAFKA_BROKER is not set");
}

export const kafka = new Kafka({
  clientId: "event-server",
  brokers: [process.env.KAFKA_BROKER || "localhost:9092"],
});
