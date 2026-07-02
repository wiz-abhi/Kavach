import { getDriver } from "./db.js";

/*
 * Per-account risk score (0-100) — a richer signal than binary ring membership.
 * Blends three factors, each independently meaningful to a fraud analyst:
 *   - shared infrastructure: how many other accounts share this one's devices/IPs/phones
 *   - direct ties to already-flagged accounts (transacting with known-bad actors)
 *   - confirmed ring membership
 */
export async function getAccountRisk(id: string) {
  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });
  try {
    const res = await session.run(
      `
      MATCH (a:Account {id: $id})
      RETURN a.id AS id, a.name AS name, a.city AS city,
             coalesce(a.flagged, false) AS flagged,
             COUNT { (a)-[:USED_DEVICE|USED_IP|REGISTERED_WITH]->(x)<-[:USED_DEVICE|USED_IP|REGISTERED_WITH]-(o:Account) } AS sharedLinks,
             COUNT { (a)-[:TRANSACTED_WITH]-(:Account) } AS txCount,
             COUNT { (a)-[:TRANSACTED_WITH]-(f:Account WHERE f.flagged = true) } AS flaggedTx
      `,
      { id }
    );
    if (res.records.length === 0) return null;
    const r = res.records[0];
    const flagged = r.get("flagged");
    const sharedLinks = r.get("sharedLinks").toNumber();
    const txCount = r.get("txCount").toNumber();
    const flaggedTx = r.get("flaggedTx").toNumber();

    // scoring
    const infraPts = Math.min(sharedLinks, 20) / 20 * 30; // up to 30
    const flaggedTxPts = Math.min(flaggedTx, 10) / 10 * 20; // up to 20
    const memberPts = flagged ? 50 : 0; // confirmed member dominates
    const risk = Math.min(100, Math.round(infraPts + flaggedTxPts + memberPts));

    const factors: string[] = [];
    if (flagged) factors.push("Confirmed member of a detected ring");
    if (sharedLinks > 0) factors.push(`Shares device/IP/phone with ${sharedLinks} other account(s)`);
    if (flaggedTx > 0) factors.push(`Transacted directly with ${flaggedTx} flagged account(s)`);
    if (factors.length === 0) factors.push("No shared infrastructure or suspicious ties detected");

    const band = risk >= 70 ? "high" : risk >= 35 ? "medium" : "low";

    return {
      id: r.get("id"),
      name: r.get("name"),
      city: r.get("city"),
      flagged,
      sharedLinks,
      txCount,
      flaggedTx,
      risk,
      band,
      factors,
    };
  } finally {
    await session.close();
  }
}
