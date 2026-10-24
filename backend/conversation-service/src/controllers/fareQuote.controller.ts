import express from "express";
import { redisClient } from "../redis/redisClient";

const router = express.Router();

// Store fare quote
router.post("/fare-quote", async (req, res) => {
  const { fare_id, data, ttl } = req.body;
  console.info(`Storing fare quote for ID: ${fare_id} with TTL: ${ttl}`);

  if (!fare_id || !data || !ttl) {
    return res.status(400).json({ error: "fare_id, data, and ttl are required" });
  }
  // Use redisClient.set with EX option for expiry
  await redisClient.set(`fare_quote:${fare_id}`, JSON.stringify(data), { EX: Number(ttl) });
  res.json({ success: true });
});

// Retrieve fare quote
router.get("/fare-quote/:fare_id", async (req, res) => {
  const fareQuote = await redisClient.get(`fare_quote:${req.params.fare_id}`);
  if (!fareQuote) return res.status(404).json({ error: "Not found" });
  console.info("Retrieved fare quote:", fareQuote);

  res.json(JSON.parse(fareQuote));
});

export default router;
