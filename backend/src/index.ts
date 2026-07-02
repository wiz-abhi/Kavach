import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import "dotenv/config";

import { detectFraudRings } from "./detection.js";
import { injectFraudRing } from "./inject.js";
import { getGraphData, getRings, getStats } from "./graph.js";
import { runBenchmark } from "./benchmark.js";
import { findPath } from "./path.js";
import { loadFeedSample, nextFeedTx } from "./feed.js";
import { ask } from "./copilot.js";
import { getAccountRisk } from "./account.js";
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

app.post("/api/ask", async (req, res) => {
  try {
    const question = String(req.body?.question ?? "");
    if (!question.trim()) return res.status(400).json({ error: "question required" });
    res.json(await ask(question));
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/account/:id", async (req, res) => {
  try {
    const result = await getAccountRisk(String(req.params.id));
    if (!result) return res.status(404).json({ error: "account not found" });
    res.json(result);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/path", async (req, res) => {
  try {
    const from = String(req.query.from ?? "");
    const to = String(req.query.to ?? "");
    const mode = req.query.mode === "infra" ? "infra" : "all";
    if (!from || !to) return res.status(400).json({ error: "from and to query params required" });
    res.json(await findPath(from, to, mode));
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
    loadFeedSample().catch(() => {}); // refresh stream to include the new accounts
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

// Stream real transactions from the graph as a live activity feed (~1.4s cadence).
setInterval(() => {
  const tx = nextFeedTx();
  if (tx) broadcast({ type: "transaction", payload: tx });
}, 1400);

// Less frequent stats refresh so the counters stay accurate without spamming the feed.
setInterval(async () => {
  try {
    broadcast({ type: "stats_update", payload: await getStats() });
  } catch {
    // swallow — don't crash the interval loop on transient errors
  }
}, 6000);

server.listen(PORT, async () => {
  console.log(`Kavach backend listening on http://localhost:${PORT}`);
  console.log(`WebSocket live feed at ws://localhost:${PORT}/api/live-feed`);
  try {
    await loadFeedSample();
    console.log("Live feed sample loaded.");
  } catch (err: any) {
    console.error("Could not load feed sample:", err.message);
  }
});
