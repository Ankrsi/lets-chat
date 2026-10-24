import { kafka } from "./kafkaClient";

let producer: any;

export const connectProducer = async () => {
  if (!producer) {
    producer = kafka.producer();
    await producer.connect();
    console.info("✅ Kafka Producer connected");
  }
  return producer;
};

export const publishToKafka = async (topic: string, message: any) => {
  if (!producer) {
    throw new Error("Kafka producer not connected");
  }

  await producer.send({
    topic,
    messages: [{ value: JSON.stringify(message) }],
  });

  console.info(`📤 Kafka Event Published → ${topic}`, message);
};
