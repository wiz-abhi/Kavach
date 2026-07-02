import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import "dotenv/config";

import { detectFraudRings } from "./detection.js";
import { injectFraudRing } from "./inject.js";
import { getGraphData, getRings, getStats } from "./graph.js";
import { runBenchmark } from "./benchmark.js";
import { getDriver } from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

app.get("/api/health", async (_req, res) => {
  try {
    await getDriver().verifyConnectivity();
    res.json({ ok: true, neo4j: "connected" });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/stats", async (_req, res) => {
  try {
    res.json(await getStats());
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/graph", async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 600;
    res.json(await getGraphData(limit));
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/rings", async (_req, res) => {
  try {
    res.json(await getRings());
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/benchmark", async (_req, res) => {
  try {
    res.json(await runBenchmark());
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/detect", async (_req, res) => {
  try {
    const result = await detectFraudRings();
    broadcast({ type: "detection_complete", payload: result });
    res.json(result);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/inject-fraud-ring", async (req, res) => {
  try {
    const size = req.body?.size ?? 6;
    const result = await injectFraudRing(size);
    broadcast({ type: "ring_injected", payload: result });
    res.json(result);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- WebSocket live feed ----------
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/api/live-feed" });

function broadcast(message: object) {
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) client.send(data);
  });
}

wss.on("connection", (ws) => {
  console.log("WS client connected");
  ws.send(JSON.stringify({ type: "connected" }));
  ws.on("close", () => console.log("WS client disconnected"));
});

// Periodically push a lightweight "heartbeat" with fresh stats so the frontend feed
// feels alive even without new transactions being created server-side.
setInterval(async () => {
  try {
    const stats = await getStats();
    broadcast({ type: "stats_update", payload: stats });
  } catch {
    // swallow — don't crash the interval loop on transient errors
  }
}, 5000);

server.listen(PORT, () => {
  console.log(`Kavach backend listening on http://localhost:${PORT}`);
  console.log(`WebSocket live feed at ws://localhost:${PORT}/api/live-feed`);
});
