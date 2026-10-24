import express from "express";
import client from "prom-client";

const router = express.Router();

const register = new client.Registry();
client.collectDefaultMetrics({ register });

// metrics
export const mediasoupWorkers = new client.Gauge({
  name: "mediasoup_workers",
  help: "Total mediasoup workers",
});

export const mediasoupTransports = new client.Gauge({
  name: "mediasoup_transports",
  help: "Active transports",
  labelNames: ['conversationId'],
});

export const mediasoupProducers = new client.Gauge({
  name: "mediasoup_producers",
  help: "Active producers",
  labelNames: ['conversationId'],
});

export const mediasoupConsumers = new client.Gauge({
  name: "mediasoup_consumers",
  help: "Active consumers",
  labelNames: ['conversationId'],
});

export const mediasoupBitrateIn = new client.Gauge({
  name: "mediasoup_bitrate_in",
  help: "Incoming bitrate",
  labelNames: ['conversationId'],
});

export const mediasoupBitrateOut = new client.Gauge({
  name: "mediasoup_bitrate_out",
  help: "Outgoing bitrate",
  labelNames: ['conversationId'],
});

export const mediasoupPacketLoss = new client.Gauge({
  name: "mediasoup_packet_loss",
  help: "Average packet loss",
  labelNames: ['conversationId'],
});

export const mediasoupJitter = new client.Gauge({
  name: "mediasoup_jitter_seconds",
  help: "Network jitter",
  labelNames: ['conversationId'],
});

// Global metrics (for backward compatibility)
export const mediasoupTransportsGlobal = new client.Gauge({
  name: "mediasoup_transports_global",
  help: "Total active transports across all calls",
});

export const mediasoupProducersGlobal = new client.Gauge({
  name: "mediasoup_producers_global",
  help: "Total active producers across all calls",
});

export const mediasoupConsumersGlobal = new client.Gauge({
  name: "mediasoup_consumers_global",
  help: "Total active consumers across all calls",
});

export const mediasoupBitrateInGlobal = new client.Gauge({
  name: "mediasoup_bitrate_in_global",
  help: "Total incoming bitrate across all calls",
});

export const mediasoupBitrateOutGlobal = new client.Gauge({
  name: "mediasoup_bitrate_out_global",
  help: "Total outgoing bitrate across all calls",
});

export const mediasoupPacketLossGlobal = new client.Gauge({
  name: "mediasoup_packet_loss_global",
  help: "Average packet loss across all calls",
});

export const mediasoupJitterGlobal = new client.Gauge({
  name: "mediasoup_jitter_global",
  help: "Average jitter across all calls",
});

register.registerMetric(mediasoupWorkers);
register.registerMetric(mediasoupTransports);
register.registerMetric(mediasoupProducers);
register.registerMetric(mediasoupConsumers);
register.registerMetric(mediasoupBitrateIn);
register.registerMetric(mediasoupBitrateOut);
register.registerMetric(mediasoupPacketLoss);
register.registerMetric(mediasoupJitter);
register.registerMetric(mediasoupTransportsGlobal);
register.registerMetric(mediasoupProducersGlobal);
register.registerMetric(mediasoupConsumersGlobal);
register.registerMetric(mediasoupBitrateInGlobal);
register.registerMetric(mediasoupBitrateOutGlobal);
register.registerMetric(mediasoupPacketLossGlobal);
register.registerMetric(mediasoupJitterGlobal);

export const updateWorkers = (workersCount: number) => {
    mediasoupWorkers.set(workersCount);
};

export const updateMetricsForCall = (conversationId: string, bitrateIn: number, bitrateOut: number, transportsCount: number, producersCount: number, consumersCount: number, packetLoss: number, jitter: number) => {
    mediasoupTransports.set({conversationId: conversationId}, transportsCount);
    mediasoupProducers.set({conversationId: conversationId}, producersCount);
    mediasoupConsumers.set({conversationId: conversationId}, consumersCount);
    mediasoupBitrateIn.set({conversationId: conversationId}, bitrateIn);
    mediasoupBitrateOut.set({conversationId: conversationId}, bitrateOut);
    mediasoupPacketLoss.set({conversationId: conversationId}, packetLoss);
    mediasoupJitter.set({conversationId: conversationId}, jitter);
};

export const removeMetricsForCall = (conversationId: string) => {
    mediasoupTransports.remove({conversationId: conversationId});
    mediasoupProducers.remove({conversationId: conversationId});
    mediasoupConsumers.remove({conversationId: conversationId});
    mediasoupBitrateIn.remove({conversationId: conversationId});
    mediasoupBitrateOut.remove({conversationId: conversationId});
    mediasoupPacketLoss.remove({conversationId: conversationId});
    mediasoupJitter.remove({conversationId: conversationId});
};

export const updateGlobalMetrics = (bitrateIn: number, bitrateOut: number, transportsCount: number, producersCount: number, consumersCount: number, packetLoss: number, jitter: number) => {
    mediasoupTransportsGlobal.set(transportsCount);
    mediasoupProducersGlobal.set(producersCount);
    mediasoupConsumersGlobal.set(consumersCount);
    mediasoupBitrateInGlobal.set(bitrateIn);
    mediasoupBitrateOutGlobal.set(bitrateOut);
    mediasoupPacketLossGlobal.set(packetLoss);
    mediasoupJitterGlobal.set(jitter);
};

// metrics endpoint
router.get("/metrics", async (req, res) => {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
});

export default router;