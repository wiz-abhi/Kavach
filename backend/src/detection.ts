import { getDriver } from "./db.js";

/*
 * DETECTION APPROACH
 * -------------------
 * AuraDB Free tier does not ship the Graph Data Science (GDS) plugin, so rather than
 * depend on `gds.louvain` / `gds.wcc` (which would break on the free tier a judge or
 * teammate spins up), we implement connected-component clustering ourselves on top of
 * a native Cypher graph traversal query. This is still fundamentally a graph-native
 * approach — the expensive, interesting part (finding accounts transitively linked
 * through shared devices/IPs/phones) is a multi-hop Cypher pattern that would be
 * painful and slow as a series of SQL self-joins. Union-find over the query result
 * just turns the traversal edges into cluster labels.
 *
 * If you're running Neo4j AuraDS or self-hosted Enterprise with GDS installed, see
 * `runGdsLouvain()` below for a drop-in alternative that uses the real GDS library.
 */

type SharedEdge = { a1: string; a2: string; sharedVia: string; attrId: string };

class UnionFind {
  parent = new Map<string, string>();

  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    // path compression
    let cur = x;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export async function detectFraudRings() {
  const driver = getDriver();
  const session = driver.session();

  try {
    // 0. Clear previous detection state so each run reflects the CURRENT graph, not an
    //    accumulation of every past run (Ring ids are timestamped, so without this,
    //    clicking "Run Detection" repeatedly would pile up duplicate Ring nodes).
    await session.run(`MATCH (r:Ring) DETACH DELETE r`);
    await session.run(`MATCH (a:Account) WHERE a.flagged IS NOT NULL REMOVE a.flagged`);

    // 1. Find all account pairs that share a device, IP, or phone number.
    const sharedResult = await session.run(`
      MATCH (a1:Account)-[r1:USED_DEVICE|USED_IP|REGISTERED_WITH]->(attr)<-[r2:USED_DEVICE|USED_IP|REGISTERED_WITH]-(a2:Account)
      WHERE a1.id < a2.id
      RETURN a1.id AS a1, a2.id AS a2, type(r1) AS sharedVia, attr.id AS attrId
    `);

    const sharedEdges: SharedEdge[] = sharedResult.records.map((r) => ({
      a1: r.get("a1"),
      a2: r.get("a2"),
      sharedVia: r.get("sharedVia"),
      attrId: r.get("attrId"),
    }));

    if (sharedEdges.length === 0) {
      return { rings: [], message: "No shared-attribute connections found in the graph." };
    }

    // 2. Union-find to build connected components over the "shares infrastructure" graph.
    const uf = new UnionFind();
    for (const e of sharedEdges) uf.union(e.a1, e.a2);

    const clusters = new Map<string, Set<string>>();
    for (const e of sharedEdges) {
      for (const acc of [e.a1, e.a2]) {
        const root = uf.find(acc);
        if (!clusters.has(root)) clusters.set(root, new Set());
        clusters.get(root)!.add(acc);
      }
    }

    // 3. Filter to plausible ring sizes, then score each cluster.
    const candidateClusters = [...clusters.values()].filter((c) => c.size >= 3 && c.size <= 20);

    // baseline: average transaction count between all account pairs in the graph (rough density baseline)
    const baselineResult = await session.run(`
      MATCH ()-[t:TRANSACTED_WITH]->()
      RETURN count(t) AS totalTx
    `);
    const totalTx = baselineResult.records[0].get("totalTx").toNumber();
    const accountCountResult = await session.run(`MATCH (a:Account) RETURN count(a) AS c`);
    const totalAccounts = accountCountResult.records[0].get("c").toNumber();

    // Graph-wide "random" transaction edge density: of all possible directed account
    // pairs, what fraction actually transact. A genuine fraud ring transacts with itself
    // *far* more densely than this baseline — that multiplier is the core anomaly signal,
    // and unlike a per-account average it does not get diluted as the ring grows.
    const possibleGraphEdges = totalAccounts > 1 ? totalAccounts * (totalAccounts - 1) : 1;
    const graphEdgeDensity = totalTx / possibleGraphEdges;

    const rings: any[] = [];
    let ringIndex = 0;

    for (const clusterSet of candidateClusters) {
      const memberIds = [...clusterSet];
      ringIndex++;

      // internal transaction density
      const txResult = await session.run(
        `
        MATCH (a:Account)-[t:TRANSACTED_WITH]->(b:Account)
        WHERE a.id IN $ids AND b.id IN $ids
        RETURN count(t) AS internalTx, sum(t.amount) AS totalAmount
      `,
        { ids: memberIds }
      );
      const internalTx = txResult.records[0].get("internalTx").toNumber();
      const totalAmount = txResult.records[0].get("totalAmount") || 0;

      // shared attributes among this cluster (for the explanation)
      const attrResult = await session.run(
        `
        MATCH (a:Account)-[r:USED_DEVICE|USED_IP|REGISTERED_WITH]->(attr)
        WHERE a.id IN $ids
        WITH attr, type(r) AS relType, count(DISTINCT a) AS accountCount
        WHERE accountCount > 1
        RETURN labels(attr)[0] AS attrType, attr.id AS attrId, accountCount
        ORDER BY accountCount DESC
      `,
        { ids: memberIds }
      );
      const sharedAttrs = attrResult.records.map((r) => ({
        type: r.get("attrType"),
        id: r.get("attrId"),
        accountCount: r.get("accountCount").toNumber(),
      }));

      // Internal transaction edge density vs. the graph's random baseline. Dividing by the
      // number of *possible* internal pairs (not by ring size) means a large ring is not
      // unfairly penalised — a 9-account ring and a 6-account ring that are equally "tight"
      // score the same multiplier.
      const size = memberIds.length;
      const clusterEdgeDensity = size > 1 ? internalTx / (size * (size - 1)) : 0;
      const densityMultiplier = graphEdgeDensity > 0 ? clusterEdgeDensity / graphEdgeDensity : 0;

      // Two independent fraud signals, both required:
      //   1. Shared infrastructure beyond innocent coincidence (maxAttrReuse >= 3).
      //      Innocent family/device-sharing noise only ever links 2 accounts, so a device/
      //      IP/phone reused across 3+ accounts is a real signal, not chance.
      //   2. Anomalous internal transaction density (densityMultiplier >= 5): the cluster
      //      transacts with itself many times more densely than a random set of accounts.
      const maxAttrReuse = Math.max(0, ...sharedAttrs.map((a) => a.accountCount));

      // Confidence blends the two signals (each saturates at a "clearly fraud" level).
      const attrSignal = Math.min(maxAttrReuse / 6, 1);
      const densitySignal = Math.min(densityMultiplier / 50, 1);
      const confidence = Math.min(1, 0.5 * attrSignal + 0.5 * densitySignal);

      if (maxAttrReuse >= 3 && densityMultiplier >= 5 && internalTx >= 5) {
        rings.push({
          ring_id: `RING-${Date.now()}-${ringIndex}`,
          member_ids: memberIds,
          size,
          shared_attributes: sharedAttrs,
          internal_transactions: internalTx,
          internal_transaction_volume: totalAmount,
          density_ratio: Number(densityMultiplier.toFixed(1)),
          confidence_score: Number(confidence.toFixed(2)),
          explanation: buildExplanation(size, sharedAttrs, densityMultiplier, totalAmount),
        });
      }
    }

    // 4. Persist Ring nodes back into Neo4j so the frontend can query them directly too.
    for (const ring of rings) {
      await session.run(
        `
        MERGE (r:Ring {id: $ringId})
        SET r.detected_at = datetime(),
            r.confidence_score = $confidence,
            r.explanation = $explanation,
            r.size = $size
        WITH r
        UNWIND $memberIds AS accId
        MATCH (a:Account {id: accId})
        MERGE (r)-[:INCLUDES]->(a)
        SET a.flagged = true
      `,
        {
          ringId: ring.ring_id,
          confidence: ring.confidence_score,
          explanation: ring.explanation,
          size: ring.size,
          memberIds: ring.member_ids,
        }
      );
    }

    return { rings, sharedEdgeCount: sharedEdges.length, clustersEvaluated: candidateClusters.length };
  } finally {
    await session.close();
  }
}

function buildExplanation(
  size: number,
  sharedAttrs: { type: string; id: string; accountCount: number }[],
  densityRatio: number,
  totalAmount: number
): string {
  const topAttr = sharedAttrs[0];
  const attrLabel = topAttr
    ? topAttr.type === "Device"
      ? "device"
      : topAttr.type === "IPAddress"
      ? "IP address"
      : "phone number"
    : "shared identifier";
  const reuseCount = topAttr ? topAttr.accountCount : 0;
  const deviceCount = sharedAttrs.filter((a) => a.type === "Device").length;
  const ipCount = sharedAttrs.filter((a) => a.type === "IPAddress").length;

  return (
    `${size} accounts form a tightly connected cluster sharing ${deviceCount} device(s) and ${ipCount} IP address(es), ` +
    `with one ${attrLabel} reused across ${reuseCount} accounts. ` +
    `These accounts transact with each other ${Math.round(densityRatio)}x more densely than a random set of accounts in the network ` +
    `(₹${Math.round(totalAmount).toLocaleString("en-IN")} moved within the cluster), consistent with a coordinated fraud ring.`
  );
}

/*
 * OPTIONAL: If running on Neo4j AuraDS / Enterprise with GDS installed, this shows how
 * you'd swap in real Louvain community detection instead of the union-find above.
 * Not called by default since it requires the GDS plugin.
 */
export async function runGdsLouvain() {
  const driver = getDriver();
  const session = driver.session();
  try {
    await session.run(`
      CALL gds.graph.project(
        'fraudGraph',
        'Account',
        {
          USED_DEVICE: { type: 'USED_DEVICE', orientation: 'UNDIRECTED' },
          USED_IP: { type: 'USED_IP', orientation: 'UNDIRECTED' },
          TRANSACTED_WITH: { type: 'TRANSACTED_WITH', orientation: 'UNDIRECTED' }
        }
      )
    `);
    const result = await session.run(`
      CALL gds.louvain.stream('fraudGraph')
      YIELD nodeId, communityId
      RETURN gds.util.asNode(nodeId).id AS accountId, communityId
    `);
    await session.run(`CALL gds.graph.drop('fraudGraph')`);
    return result.records.map((r) => ({ accountId: r.get("accountId"), communityId: r.get("communityId") }));
  } finally {
    await session.close();
  }
}
