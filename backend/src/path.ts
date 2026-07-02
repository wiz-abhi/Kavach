import { getDriver } from "./db.js";

/*
 * Investigation tool: find the shortest chain connecting two accounts through ANY
 * relationship (shared device/IP/phone or a transaction). This is the "how are these two
 * secretly linked?" query — a Neo4j shortestPath, which is a single line of Cypher and
 * effectively impossible to express cleanly in SQL. Returns an ordered, human-readable
 * hop list plus the raw node/edge ids so the frontend can highlight the path on the graph.
 */
export async function findPath(fromId: string, toId: string, mode: "all" | "infra" = "all") {
  const driver = getDriver();
  const session = driver.session();
  // "infra" restricts the traversal to shared device/IP/phone links only — this surfaces the
  // hidden identity connection between two accounts that may never have transacted directly.
  const rels =
    mode === "infra"
      ? "USED_DEVICE|USED_IP|REGISTERED_WITH"
      : "USED_DEVICE|USED_IP|REGISTERED_WITH|TRANSACTED_WITH";
  try {
    const result = await session.run(
      `
      MATCH (a:Account {id: $fromId}), (b:Account {id: $toId})
      MATCH p = shortestPath(
        (a)-[:${rels}*..12]-(b)
      )
      RETURN p
      `,
      { fromId, toId }
    );

    if (result.records.length === 0) {
      return { found: false, from: fromId, to: toId, message: "No connection found within 12 hops." };
    }

    const path = result.records[0].get("p");
    const nodeIds: string[] = [];
    const steps: { relType: string; via: string; direction: string }[] = [];
    const readable: string[] = [];

    // path.segments: ordered start -[rel]-> end chunks
    const segments = path.segments as any[];
    const firstNode = segments[0]?.start ?? path.start;
    nodeIds.push(nodeLabelId(firstNode));
    readable.push(nodeDescribe(firstNode));

    for (const seg of segments) {
      const relType = seg.relationship.type;
      // In a shared-attribute hop the "via" node is the end node of the segment (a Device/IP/etc)
      const endNode = seg.end;
      const endLabel = endNode.labels[0];
      const endId = nodeLabelId(endNode);
      nodeIds.push(endId);
      steps.push({ relType, via: endId, direction: "-" });
      // Arriving at a shared attribute (Device/IP/Phone) vs. arriving back at an Account
      // read differently: "shares device DEV-401" vs. "…also used by Alice (ACC-406)".
      if (endLabel === "Account") {
        readable.push(`↳ also ${relType === "TRANSACTED_WITH" ? "transacted with" : "used by"} ${nodeDescribe(endNode)}`);
      } else {
        readable.push(`${humanRel(relType, endLabel)} ${nodeDescribe(endNode)}`);
      }
    }

    return {
      found: true,
      from: fromId,
      to: toId,
      hops: segments.length,
      nodeIds,
      steps,
      readable,
    };
  } finally {
    await session.close();
  }
}

function nodeLabelId(node: any): string {
  return node.properties.id ?? String(node.identity);
}

function nodeDescribe(node: any): string {
  const label = node.labels[0];
  const p = node.properties;
  if (label === "Account") return `${p.name ?? p.id} (${p.id})`;
  if (label === "Device") return `Device ${p.id}`;
  if (label === "IPAddress") return `IP ${p.address ?? p.id}`;
  if (label === "PhoneNumber") return `Phone ${p.number ?? p.id}`;
  return `${label} ${p.id}`;
}

function humanRel(relType: string, endLabel: string): string {
  switch (relType) {
    case "USED_DEVICE":
      return "shares device";
    case "USED_IP":
      return "shares IP";
    case "REGISTERED_WITH":
      return "shares phone";
    case "TRANSACTED_WITH":
      return "transacted with";
    default:
      return relType;
  }
}
