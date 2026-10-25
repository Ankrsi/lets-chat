import { Kafka } from "kafkajs";

if (!process.env.KAFKA_BROKER) {
  throw new Error("KAFKA_BROKER is not set");
}

export const TOPICS = {
  offline: "chat-offline",
  contacts: "friends-contacts-save-db",
};

const ca = process.env.KAFKA_SSL_CA?.replace(/\\n/g, "\n");

const sasl = process.env.KAFKA_USERNAME
  ? { mechanism: "scram-sha-256" as const, username: process.env.KAFKA_USERNAME, password: process.env.KAFKA_PASSWORD || "" }
  : undefined;

export const kafka = new Kafka({
  clientId: "event-server",
  brokers: [process.env.KAFKA_BROKER || "localhost:9092"],
  ssl: ca ? { rejectUnauthorized: true, ca: [ca] } : undefined,
  sasl,
});
