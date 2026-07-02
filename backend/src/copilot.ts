import Anthropic from "@anthropic-ai/sdk";
import { getDriver } from "./db.js";

/*
 * Analyst copilot: ask a question in plain English, get an answer backed by a real Cypher
 * query against the live graph.
 *
 * Two tiers, by design (so a live demo never depends on an external API being up):
 *   1. If ANTHROPIC_API_KEY is set, Claude translates the question -> Cypher (text-to-Cypher).
 *   2. Otherwise a rule-based matcher handles the common fraud questions offline.
 * Either way, the generated Cypher is shown to the user and executed READ-ONLY.
 */

const SCHEMA = `
Nodes:
  (:Account {id, name, city, created_at, is_ring_member, flagged, injected})
  (:Device {id, fingerprint, type})
  (:IPAddress {id, address})
  (:PhoneNumber {id, number})
  (:Ring {id, detected_at, confidence_score, explanation, size})
Relationships:
  (:Account)-[:USED_DEVICE]->(:Device)
  (:Account)-[:USED_IP]->(:IPAddress)
  (:Account)-[:REGISTERED_WITH]->(:PhoneNumber)
  (:Account)-[:TRANSACTED_WITH {id, amount, timestamp}]->(:Account)
  (:Ring)-[:INCLUDES]->(:Account)
Notes: a Ring node is created by the detection algorithm. Flagged accounts have flagged=true.
`;

const WRITE_GUARD = /\b(CREATE|MERGE|DELETE|SET|REMOVE|DETACH|DROP|LOAD\s+CSV|CALL\s*\{)/i;

export async function ask(question: string) {
  const q = question.trim();
  let cypher: string;
  let source: "llm" | "rules";

  if (process.env.ANTHROPIC_API_KEY) {
    cypher = await llmToCypher(q);
    source = "llm";
  } else {
    cypher = rulesToCypher(q);
    source = "rules";
  }

  if (WRITE_GUARD.test(cypher)) {
    return { question: q, cypher, error: "Refused: the generated query attempts to modify data (read-only mode).", source };
  }

  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const result = await session.executeRead((tx) => tx.run(cypher));
    const rows = result.records.map((r) => {
      const obj: Record<string, any> = {};
      for (const key of r.keys) obj[key as string] = normalize(r.get(key));
      return obj;
    });
    const answer = summarize(q, rows);
    return { question: q, cypher, rows: rows.slice(0, 50), rowCount: rows.length, answer, source };
  } catch (err: any) {
    return { question: q, cypher, error: `Query failed: ${err.message}`, source };
  } finally {
    await session.close();
  }
}

function normalize(v: any): any {
  if (v == null) return v;
  if (typeof v?.toNumber === "function") return v.toNumber(); // Neo4j Integer
  if (typeof v?.toString === "function" && v?.constructor?.name === "DateTime") return v.toString();
  if (Array.isArray(v)) return v.map(normalize);
  if (v?.properties) return v.properties; // node/relationship
  return v;
}

// ---------------- LLM tier ----------------
async function llmToCypher(question: string): Promise<string> {
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: process.env.COPILOT_MODEL || "claude-haiku-4-5-20251001",
    max_tokens: 500,
    system:
      `You translate natural-language questions into a single read-only Cypher query for a Neo4j fraud-detection graph.\n` +
      `Schema:\n${SCHEMA}\n` +
      `Rules: return ONLY the Cypher query, no markdown, no explanation. Never write/modify data ` +
      `(no CREATE/MERGE/DELETE/SET/REMOVE). Always add a LIMIT (max 50) unless the query is an aggregate. ` +
      `Prefer returning human-readable fields (names, ids, amounts).`,
    messages: [{ role: "user", content: question }],
  });
  const text = msg.content.find((c) => c.type === "text");
  let cypher = (text as any)?.text?.trim() ?? "";
  // strip accidental code fences
  cypher = cypher.replace(/^```(?:cypher)?\s*/i, "").replace(/```$/i, "").trim();
  return cypher;
}

// ---------------- Rule-based tier (offline fallback) ----------------
function rulesToCypher(question: string): string {
  const s = question.toLowerCase();

  if (/(how many|number of|count).*(ring)/.test(s))
    return `MATCH (r:Ring) RETURN count(r) AS rings`;

  if (/(biggest|largest|most accounts).*(ring)|ring.*(biggest|largest)/.test(s))
    return `MATCH (r:Ring)-[:INCLUDES]->(a:Account)
RETURN r.id AS ring, r.size AS size, r.confidence_score AS confidence, collect(a.id)[..10] AS members
ORDER BY size DESC LIMIT 1`;

  if (/(total|sum|how much).*(amount|money|moved|laundered|volume)/.test(s))
    return `MATCH (r:Ring)-[:INCLUDES]->(a:Account)
WITH collect(a.id) AS ids
MATCH (x:Account)-[t:TRANSACTED_WITH]->(y:Account)
WHERE x.id IN ids AND y.id IN ids
RETURN round(sum(t.amount)) AS totalMovedInRings, count(t) AS transactions`;

  if (/(device).*(most|shared|reused)|most.*(device)/.test(s))
    return `MATCH (a:Account)-[:USED_DEVICE]->(d:Device)
WITH d, count(a) AS accounts
RETURN d.id AS device, accounts ORDER BY accounts DESC LIMIT 5`;

  if (/(ip).*(most|shared|reused)|most.*(ip address)/.test(s))
    return `MATCH (a:Account)-[:USED_IP]->(ip:IPAddress)
WITH ip, count(a) AS accounts
RETURN ip.address AS ip, accounts ORDER BY accounts DESC LIMIT 5`;

  if (/(phone).*(most|shared|reused)/.test(s))
    return `MATCH (a:Account)-[:REGISTERED_WITH]->(p:PhoneNumber)
WITH p, count(a) AS accounts
RETURN p.number AS phone, accounts ORDER BY accounts DESC LIMIT 5`;

  if (/(high|large|biggest|top).*(transaction|transfer|payment)/.test(s))
    return `MATCH (a:Account)-[t:TRANSACTED_WITH]->(b:Account)
RETURN a.id AS from, b.id AS to, round(t.amount) AS amount
ORDER BY t.amount DESC LIMIT 10`;

  if (/(how many|count).*(flag)/.test(s))
    return `MATCH (a:Account) WHERE a.flagged = true RETURN count(a) AS flaggedAccounts`;

  if (/(flag).*(account)|account.*(flag)/.test(s))
    return `MATCH (a:Account) WHERE a.flagged = true
RETURN a.id AS account, a.name AS name, a.city AS city LIMIT 25`;

  if (/(how many|count).*(account)/.test(s))
    return `MATCH (a:Account) RETURN count(a) AS accounts`;

  if (/(most connected|most links|most shared|hub)/.test(s))
    return `MATCH (a:Account)-[:USED_DEVICE|USED_IP|REGISTERED_WITH]->(x)<-[:USED_DEVICE|USED_IP|REGISTERED_WITH]-(b:Account)
WITH a, count(DISTINCT b) AS links
RETURN a.id AS account, a.name AS name, links ORDER BY links DESC LIMIT 5`;

  // default: overview
  return `MATCH (r:Ring)-[:INCLUDES]->(a:Account)
RETURN r.id AS ring, r.size AS size, r.confidence_score AS confidence
ORDER BY confidence DESC LIMIT 10`;
}

function summarize(question: string, rows: Record<string, any>[]): string {
  if (rows.length === 0) return "No matching results in the current graph.";
  // Single scalar aggregate -> phrase it directly.
  if (rows.length === 1 && Object.keys(rows[0]).length === 1) {
    const [[k, v]] = Object.entries(rows[0]);
    return `${k}: ${typeof v === "number" ? v.toLocaleString("en-IN") : v}`;
  }
  return `${rows.length} result${rows.length === 1 ? "" : "s"} returned.`;
}
