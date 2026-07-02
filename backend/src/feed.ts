import { getDriver } from "./db.js";

/*
 * Live activity feed. Rather than fabricate fake events, we replay real TRANSACTED_WITH
 * edges from the graph as a stream — so every line in the feed is a genuine transaction
 * that exists in Neo4j. High-value transfers are flagged for the operator's attention.
 */
export type FeedTx = {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  amount: number;
  highValue: boolean;
};

const HIGH_VALUE = 30000;
let sample: FeedTx[] = [];
let idx = 0;

export async function loadFeedSample() {
  const driver = getDriver();
  const session = driver.session();
  try {
    const r = await session.run(`
      MATCH (a:Account)-[t:TRANSACTED_WITH]->(b:Account)
      RETURN a.id AS af, a.name AS an, b.id AS bf, b.name AS bn, t.amount AS amt
      ORDER BY rand()
      LIMIT 400
    `);
    sample = r.records.map((x) => {
      const amount = Number(x.get("amt")) || 0;
      return {
        from: x.get("af"),
        fromName: x.get("an"),
        to: x.get("bf"),
        toName: x.get("bn"),
        amount,
        highValue: amount >= HIGH_VALUE,
      };
    });
    idx = 0;
  } finally {
    await session.close();
  }
}

export function nextFeedTx(): FeedTx | null {
  if (sample.length === 0) return null;
  const tx = sample[idx % sample.length];
  idx++;
  return tx;
}
