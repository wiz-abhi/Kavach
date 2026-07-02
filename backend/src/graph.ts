import neo4j from "neo4j-driver";
import { getDriver } from "./db.js";

/**
 * Returns a subset of the graph suitable for force-directed visualization.
 * Sampling is applied for performance — for a hackathon demo dataset (a few hundred
 * accounts) this can likely return everything, but the LIMIT keeps it safe.
 */
export async function getGraphData(limit: number = 600) {
  const driver = getDriver();
  const session = driver.session();
  try {
    const nodesResult = await session.run(
      `
      MATCH (a:Account)
      OPTIONAL MATCH (a)-[:USED_DEVICE]->(d:Device)
      OPTIONAL MATCH (a)-[:USED_IP]->(ip:IPAddress)
      RETURN a.id AS id, a.name AS name, a.city AS city, coalesce(a.flagged, false) AS flagged,
             coalesce(a.injected, false) AS injected,
             collect(DISTINCT d.id) AS devices, collect(DISTINCT ip.id) AS ips
      LIMIT $limit
    `,
      { limit: neo4j.int(limit) }
    );

    const nodes = nodesResult.records.map((r) => ({
      id: r.get("id"),
      name: r.get("name"),
      city: r.get("city"),
      flagged: r.get("flagged"),
      injected: r.get("injected"),
      devices: r.get("devices"),
      ips: r.get("ips"),
    }));

    const nodeIds = new Set(nodes.map((n) => n.id));

    const edgesResult = await session.run(
      `
      MATCH (a:Account)-[t:TRANSACTED_WITH]->(b:Account)
      RETURN a.id AS source, b.id AS target, t.amount AS amount
      LIMIT $limit
    `,
      { limit: neo4j.int(limit * 3) }
    );

    const edges = edgesResult.records
      .map((r) => ({ source: r.get("source"), target: r.get("target"), amount: r.get("amount") }))
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

    return { nodes, edges };
  } finally {
    await session.close();
  }
}

export async function getRings() {
  const driver = getDriver();
  const session = driver.session();
  try {
    const result = await session.run(`
      MATCH (r:Ring)-[:INCLUDES]->(a:Account)
      RETURN r.id AS id, r.detected_at AS detectedAt, r.confidence_score AS confidence,
             r.explanation AS explanation, r.size AS size, collect(a.id) AS memberIds
      ORDER BY r.detected_at DESC
    `);
    return result.records.map((r) => ({
      id: r.get("id"),
      detected_at: r.get("detectedAt")?.toString?.() ?? null,
      confidence: r.get("confidence"),
      explanation: r.get("explanation"),
      size: r.get("size"),
      member_ids: r.get("memberIds"),
    }));
  } finally {
    await session.close();
  }
}

export async function getStats() {
  const driver = getDriver();
  const session = driver.session();
  try {
    // Use COUNT{} subqueries so the separate counts don't form a Cartesian product
    // (which would multiply rows and wildly inflate the flagged-account sum).
    const result = await session.run(`
      RETURN COUNT { (a:Account) } AS accounts,
             COUNT { ()-[:TRANSACTED_WITH]->() } AS transactions,
             COUNT { (:Ring) } AS rings,
             COUNT { (a:Account) WHERE a.flagged = true } AS flaggedAccounts
    `);
    const rec = result.records[0];
    return {
      accounts: rec.get("accounts").toNumber(),
      transactions: rec.get("transactions").toNumber(),
      rings: rec.get("rings").toNumber(),
      flaggedAccounts: rec.get("flaggedAccounts")?.toNumber?.() ?? 0,
    };
  } finally {
    await session.close();
  }
}
