# Kavach — Real-Time Fraud Ring Detection

**Banks flag fraud one account at a time. Real fraud works in rings.**

Kavach models accounts, devices, IPs, and phone numbers as a **graph in Neo4j AuraDB** and
detects coordinated fraud *rings* — groups of accounts that share infrastructure (device / IP /
phone) and transact densely with each other to launder money. Finding these rings is a natural
multi-hop graph traversal, and a slow, painful series of self-joins in a relational database.

Built for **HACKHAZARDS '26** — Trust, Identity & Security · Neo4j AuraDB track.

> On the seeded dataset, detection achieves **100% recall and 0 false positives** (4/4 rings),
> verified against ground truth — run `npm run validate` in `backend/` to reproduce.

---

## What makes it more than a textbook demo

| Feature | What it does | Why it matters |
|---|---|---|
| **Graph-native ring detection** | Multi-hop Cypher traversal + union-find clustering, scored by a transaction **edge-density multiplier** (rings transact 60–140× denser than the network baseline) | The core. Verified 100% recall / 0 FP. |
| **"Why Graph?" proof panel** | Runs the *same* fraud query in Cypher **and** an in-memory SQLite mirror of the live graph, side by side, with correctness parity | Proves the graph case *live* — Cypher pattern vs. a 3-way `UNION` of self-joins; one keyword vs. a recursive CTE for transitive tracing |
| **Investigate (shortest path)** | `shortestPath` between any two accounts; "shared-identity only" mode reveals hidden device/IP/phone chains between accounts that never transacted | The "how are these two secretly connected?" query — one line of Cypher |
| **Analyst Copilot** | Ask in plain English → real Cypher → answer. Claude text-to-Cypher when an API key is set, **rule-based fallback otherwise** (read-only guarded) | Never a single point of failure in a live demo |
| **Live transaction feed** | Streams real `TRANSACTED_WITH` edges from the graph; high-value transfers highlighted | Makes the dashboard feel live |
| **Inject Fraud Ring** | Creates a new ring in the live graph on demand | The on-stage moment: inject → detect → watch it get caught |

---

## Architecture

```
generator/   synthetic dataset + seeded fraud rings + ground truth + Neo4j loader
backend/     Express API — detection, SQL-vs-Cypher benchmark, shortestPath,
             text-to-Cypher copilot, WebSocket live feed
frontend/    Next.js dashboard — live graph, ring alerts, proof/investigate/copilot modals
```

- **Database:** Neo4j AuraDB (free tier). Detection is a native Cypher multi-hop traversal +
  union-find — deliberately **not** dependent on the GDS plugin (unavailable on AuraDB free),
  so it runs on any judge's free instance. `backend/src/detection.ts` includes a documented
  GDS Louvain drop-in for AuraDS/Enterprise.
- **Backend:** Node.js + Express + `neo4j-driver`, `sql.js` (benchmark), optional `@anthropic-ai/sdk` (copilot), `ws`.
- **Frontend:** Next.js 16 (App Router) + TypeScript + Tailwind v4 + `react-force-graph-2d`.

---

## Setup

### 1. Create a free Neo4j AuraDB instance
[console.neo4j.io](https://console.neo4j.io) → New Instance → **AuraDB Free**. Save the
connection URI, username, and generated password (shown once).

### 2. Generate + load the dataset
```bash
cd generator
npm install
npm run generate                # writes synthetic data to generator/output/
cp .env.example .env            # fill in AuraDB URI / username / password
npm run load                    # loads everything into Neo4j
```

### 3. Start the backend
```bash
cd backend
npm install
cp .env.example .env            # same AuraDB credentials
# optional: ANTHROPIC_API_KEY=sk-...  enables the LLM copilot (falls back to rules without it)
npm run dev                     # http://localhost:4000
npm run validate                # optional: prints detection recall/precision vs ground truth
```

### 4. Start the frontend
```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev                     # http://localhost:3000  (dev)
# for demos, production mode is more stable:
npm run build && npm run start
```

> **Demo tip:** run the frontend in **production** (`npm run build && npm start`). Next 16's
> Turbopack dev server can intermittently corrupt its module manifest after hot edits; the
> production server does not.

---

## Using the dashboard

- **Run Detection** — clusters accounts by shared device/IP/phone, scores each cluster by
  internal transaction density vs. baseline, writes `Ring` nodes, flags members red. Idempotent.
- **Inject Fraud Ring** — creates a new ring live; run detection again to catch it.
- **Ask Copilot** — natural-language questions answered with live Cypher.
- **Investigate** — reveal the hidden shortest path between two accounts.
- **Why Graph?** — the SQL-vs-Cypher head-to-head.
- **Click a flagged ring** — zoom + halo its members in the graph.

---

## Demo script (~3 min)

1. Open the dashboard — populated graph, live transaction feed, calm state.
2. **Run Detection** → 4 rings light up. Click one → graph zooms to the cluster; read the
   plain-English explanation (density multiplier + shared infrastructure).
3. **Why Graph?** → show the same query in Cypher vs. SQL, identical results, and the recursive-CTE tax.
4. **Investigate** ACC-402 → ACC-406 (shared-identity mode) → reveal the hidden 4-hop chain.
5. **Ask Copilot**: "How much money was moved inside the rings?" → live Cypher + answer.
6. **Inject Fraud Ring** → **Run Detection** again → the new ring is caught in real time.
7. (Optional) `npm run validate` → "4/4 rings, 100% recall, 0 false positives."

---

## API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Neo4j connectivity |
| GET | `/api/stats` | account / transaction / ring / flagged counts |
| GET | `/api/graph?limit=` | nodes + edges for the force graph |
| GET | `/api/rings` | detected rings + explanations |
| POST | `/api/detect` | run detection (idempotent) |
| POST | `/api/inject-fraud-ring` | inject a live ring `{ size }` |
| GET | `/api/benchmark` | SQL-vs-Cypher head-to-head |
| GET | `/api/path?from=&to=&mode=` | shortest path (`mode=infra` for shared-identity only) |
| POST | `/api/ask` | natural-language → Cypher answer `{ question }` |
| WS | `/api/live-feed` | live transaction / detection / injection events |

---

## Environment variables

| File | Variable | Description |
|---|---|---|
| `generator/.env`, `backend/.env` | `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD` | AuraDB connection |
| `backend/.env` | `ANTHROPIC_API_KEY` *(optional)* | enables LLM copilot; rule-based fallback otherwise |
| `backend/.env` | `COPILOT_MODEL` *(optional)* | defaults to `claude-haiku-4-5-20251001` |
| `frontend/.env.local` | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL` | points the frontend at the backend |

---

## Validating detection accuracy

`generator/output/ground_truth.json` records which account IDs belong to each seeded ring.
`backend/npm run validate` runs detection and reports recall / precision against it.
