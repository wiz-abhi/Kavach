# Building Kavach: catching fraud *rings*, not just fraudsters — with Neo4j

*My HACKHAZARDS '26 build submission — a graph-native fraud ring detection platform.*

---

## The problem that started it

Every fraud system I'd read about asks the same question: *"Is **this** account suspicious?"* It looks at one account's transaction amount, its velocity, its location, and scores it in isolation.

That works for lone fraudsters. It completely misses the expensive kind of fraud: **organized rings**. A ring is a group of accounts that quietly share infrastructure — the same device fingerprint, the same IP, the same phone number — and cycle money between themselves to launder it or farm signup bonuses and loans. No single account looks that bad. The *pattern between them* is the crime.

And that pattern is exactly what a row-and-column database is worst at. "Which accounts are secretly connected, and how deep does the ring go?" becomes a nightmare of self-joins in SQL. But it's the single most natural thing in the world for a graph.

So I built **Kavach** (Sanskrit for *shield*): model accounts, devices, IPs, phones and transactions as a graph in **Neo4j AuraDB**, then detect the rings as dense, infrastructure-sharing clusters — and explain *why* each one was flagged, in plain English.

## The core idea: shared infrastructure is an edge

The whole thing hinges on one modeling decision. In Kavach, a device isn't a column on an account — it's its own node. When two accounts use the same device, they're two hops apart in the graph:

```
(ACC-402)-[:USED_DEVICE]->(DEV-401)<-[:USED_DEVICE]-(ACC-406)
```

Suddenly "find accounts that share infrastructure" is a graph pattern, and "trace the whole ring" is a variable-length traversal. Detection becomes: find clusters of accounts linked through shared devices/IPs/phones **that also transact densely with each other** — because sharing a device with your spouse is innocent; sharing a device *and* moving money in a tight loop is not.

## What I actually built

Three services around one AuraDB instance:

- **Generator** — synthetic accounts + deliberately seeded fraud rings, with a `ground_truth.json` so I could *measure* whether detection actually works.
- **Backend** (Express + `neo4j-driver`) — detection, a live WebSocket feed, and the features below.
- **Frontend** (Next.js) — a dark "security ops" dashboard with a live force-directed graph, ring alerts, and the interactive tools.

## The moment the detection number went from "meh" to "wow"

My first detection run caught **1 of 4** seeded rings. Not great.

The bug was subtle and worth sharing: I was scoring ring "density" as `internal_transactions / ring_size` and comparing it to a per-account average. That metric *punishes bigger rings* — a 9-account ring looked less dense than a 6-account one, even when both were equally coordinated.

The fix was to measure **transaction edge density relative to the graph's random baseline**: of all possible pairs inside the cluster, how many actually transact, versus how often any two random accounts in the network transact. That number is size-independent and brutally discriminating. The seeded rings came back at **63× to 144×** the baseline; the detection threshold sits at 5×.

Result, verified against ground truth: **100% recall, 0 false positives.** I wired that check into `npm run validate` so I can prove it live instead of just asserting it.

## Making the "why graph?" case *provable*, not just claimed

Judges on a database track have heard "graph is better for this" a hundred times. I wanted to *show* it. So Kavach has a **"Why Graph?" panel** that runs the identical fraud query two ways on the same live data:

- In **Cypher**, against Neo4j.
- In **SQL**, against an in-memory SQLite mirror of the same graph, built on the fly.

It displays them side by side and confirms the result sets match. On a single hop they're comparable — but the honest, interesting part is the *transitive* query ("trace the entire ring"): in Cypher it's one variable-length pattern; in SQL it's a recursive CTE that gets heavier with every hop. Same answer, very different query. That's the whole argument for a graph database, made concrete.

## Two features that turn a red flag into an investigation

Detecting a ring is step one. A real analyst needs to *act*.

- **Investigate** uses Neo4j `shortestPath` to answer "how are these two accounts secretly connected?" In "shared-identity" mode it ignores transactions and surfaces the hidden chain — e.g. *ACC-402 shares an IP with ACC-401, who shares a device with ACC-406* — a link between accounts that never once transacted directly.
- **Analyst Copilot** lets you ask in plain English ("How much money moved inside the rings?") and answers with a real, read-only Cypher query it generates and runs. It uses an LLM when configured, but falls back to a deterministic rule-based translator so a live demo can never be broken by an external API being down — and it shows you the Cypher every time.

## Lessons from shipping it

- **Never trust an unrun build.** The scaffolding "looked" done, but the graph endpoint was passing a float to `LIMIT` (which Neo4j rejects) and a stats query had a Cartesian product reporting *545,292* flagged accounts. Both would have died on stage. Run everything, end to end, before you believe it.
- **Measure your own detection.** Seeding ground truth and reporting recall/precision turned a vague "it finds rings" into "4/4, 0 false positives." That one number is the most convincing thing in the whole demo.
- **Design your demo to not depend on the internet.** Every impressive-but-fragile feature got a reliable fallback.

## Try it

Kavach runs entirely on the **Neo4j AuraDB free tier** — detection deliberately avoids the GDS plugin (unavailable on free) so anyone can spin up an instance and run it. Full setup, API reference, and a 3-minute demo script are in the README.

**Catch the ring, not just the account.**
