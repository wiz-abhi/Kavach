# Kavach — Real-Time Fraud Ring Detection

Kavach detects coordinated fraud rings in financial transaction data by modeling accounts,
devices, IPs, and phone numbers as a graph in **Neo4j AuraDB**, rather than flagging accounts
one at a time. Fraud rings share infrastructure (device, IP, phone) and transact heavily with
each other — a pattern that's a natural, efficient graph traversal query and a slow, painful
series of self-joins in a relational database.

Built for **HACKHAZARDS '26** (Neo4j AuraDB track).

---

## Architecture

```
generator/   synthetic dataset generator + seeded fraud rings + Neo4j loader
backend/     Express API — Neo4j queries, ring detection, live WebSocket feed
frontend/    Next.js dashboard — live feed, force-directed graph, ring alerts
```

- **Database:** Neo4j AuraDB (free tier). Detection is implemented as a native Cypher
  multi-hop traversal (`Account -[shares device/IP/phone]- Account`) plus union-find
  clustering — this deliberately avoids depending on the GDS plugin, which is **not**
  available on the AuraDB free tier, so the demo works reliably for any judge who spins
  up their own free instance. `backend/src/detection.ts` includes a documented
  drop-in GDS Louvain alternative (`runGdsLouvain`) if you're on AuraDS/Enterprise.
- **Backend:** Node.js + Express + `neo4j-driver`, with a WebSocket endpoint for a live
  activity feed.
- **Frontend:** Next.js (App Router) + TypeScript + Tailwind + `react-force-graph-2d`.

---

## Setup

### 1. Create a free Neo4j AuraDB instance
Go to [neo4j.com/cloud/aura-free](https://neo4j.com/cloud/aura-free/), create a free
instance, and save the connection URI, username, and generated password — you only
see the password once.

### 2. Generate and load the dataset
```bash
cd generator
npm install
npm run generate          # writes synthetic data to generator/output/
cp .env.example .env      # fill in your AuraDB URI/username/password
npm run load               # loads everything into Neo4j
```

Tune dataset size / ring obviousness in `generator/config.ts` before generating if you
want a bigger or smaller demo dataset.

### 3. Start the backend
```bash
cd backend
npm install
cp .env.example .env      # same AuraDB credentials
npm run dev                 # http://localhost:4000
```

### 4. Start the frontend
```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev                 # http://localhost:3000
```

Open `http://localhost:3000` — you should see the dashboard populate with the seeded
dataset (accounts, transactions, graph view).

---

## Using the dashboard

- **Run Detection** — scans the current graph, clusters accounts by shared
  device/IP/phone, scores each cluster by internal transaction density vs. the network
  baseline, and creates `Ring` nodes in Neo4j for anything that clears the threshold.
  Flagged accounts turn red in the graph view; details appear in the Flagged Rings panel.
- **Inject Fraud Ring** — creates a brand new small ring directly in the live graph
  (new accounts sharing a device/IP, transacting heavily with one "mule" account) —
  this is the live demo moment: inject, then run detection again, and watch it get caught.
- **Click any node** in the graph to see its account details, devices, and IPs.

---

## Demo script (~3 minutes)

1. Open the dashboard — show the populated graph, stats (accounts/transactions), calm state.
2. Click **Run Detection** — watch the seeded rings light up red in the graph and populate
   the Flagged Rings panel with plain-English explanations.
3. Click into a flagged ring's explanation — point out the actual shared device/IP and the
   transaction density multiplier vs. baseline (this is the "why Neo4j, not SQL" moment).
4. Click **Inject Fraud Ring** — a brand new cluster forms live in the graph.
5. Click **Run Detection** again — show it catching the just-injected ring in real time.
6. (Optional, if stable) Open Neo4j Browser side-by-side and run the underlying Cypher
   query live to show the raw graph traversal judges can inspect themselves.

---

## Validating detection accuracy

`generator/output/ground_truth.json` records exactly which account IDs belong to each
seeded ring. After running detection, you can compare the returned `member_ids` against
this file to report precision/recall numbers in your pitch (e.g. "detected 4/4 seeded
rings with zero false positives on the normal population").

---

## Environment variables

| File | Variable | Description |
|---|---|---|
| `generator/.env` | `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD` | AuraDB connection |
| `backend/.env` | same as above | AuraDB connection used by the API |
| `frontend/.env.local` | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL` | points frontend at the backend |

---

## Known limitations / what's intentionally out of scope

- LLM-generated (vs. template-generated) explanations were intentionally left out to avoid
  a live-demo failure point tied to an external API — the template-based explanations in
  `detection.ts` are deterministic and always available.
- No auth/multi-user support — this is a single-operator demo dashboard, not a production
  SaaS.
- Render Workflows / durable agent orchestration was scoped out to keep the core Neo4j
  story tight; see the original build brief for how it could be layered in as a stretch goal.
