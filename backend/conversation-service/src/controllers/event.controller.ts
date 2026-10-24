import { Request, Response } from "express";
import { publishToKafka } from "../kafka/kafkaProducer";
import { redisPublisher } from "../redis/redisClient";

export const publishEvent = async (req: Request, res: Response) => {
  try {
    const { topic, message } = req.body;

    if (!topic || !message) {
      return res.status(400).json({ success: false, message: "Missing topic or message" });
    }

    // ✅ Kafka publish
    await publishToKafka(topic, message);

    // ✅ Redis publish
    await redisPublisher.publish(topic, JSON.stringify(message));

    res.status(200).json({
      success: true,
      message: "Event published successfully",
    });
  } catch (err: any) {
    console.error("Publish error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};
