import { Kafka } from "kafkajs";

const kafka = new Kafka({
  clientId: "driver-simulator",
  brokers: ["localhost:9092"],
});

const producer = kafka.producer();

const NUM_DRIVERS = 5;

// Initial positions for 5 drivers in [lat, lng]
const drivers = Array.from({ length: NUM_DRIVERS }, (_, i) => ({
  driverId: `driver_${i + 1}`,
  taskId: `ride_${i + 1}`,
  lat: 28.6139 + Math.random() * 0.02, // around New Delhi
  lng: 77.209 + Math.random() * 0.02,
}));

// Utility to slightly move a coordinate
function moveRandomly(lat: number, lng: number): [number, number] {
  const latShift = (Math.random() - 0.5) * 0.001;
  const lngShift = (Math.random() - 0.5) * 0.001;
  return [lat + latShift, lng + lngShift];
}

async function startSimulation() {
  await producer.connect();
  console.info("🚀 Driver simulator started...");

  setInterval(async () => {
    const messages = drivers.map((driver) => {
      // Move driver
      const [newLat, newLng] = moveRandomly(driver.lat, driver.lng);
      driver.lat = newLat;
      driver.lng = newLng;

      return {
        key: driver.driverId,
        value: JSON.stringify({
          taskId: driver.taskId,
          driverId: driver.driverId,
          lat: newLat,
          lng: newLng,
          timestamp: new Date().toISOString(),
        }),
      };
    });

    await producer.send({
      topic: "driver.location.updated",
      messages,
    });

    console.info(`📡 Sent location updates for ${drivers.length} drivers.`);
  }, 3000); // every 3 seconds
}

startSimulation().catch((err) => {
  console.error("❌ Simulation failed:", err);
});
