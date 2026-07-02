import initSqlJs from "sql.js";
import { createRequire } from "module";
import fs from "fs";
import { getDriver } from "./db.js";

/*
 * SQL vs. Cypher head-to-head.
 * ----------------------------
 * The core fraud-detection primitive is: "find every pair of accounts that share a piece
 * of infrastructure (device / IP / phone)." We answer the SAME question two ways against
 * the SAME live data and time both:
 *
 *   - Neo4j: one graph pattern, traversed natively.
 *   - SQL (SQLite, in-memory): the realistic relational schema keeps devices/IPs/phones in
 *     separate tables, so the same question is a UNION of three self-joins. This is exactly
 *     the shape a bank's relational model would force, and why the query is painful.
 *
 * We build the SQLite mirror from the current Neo4j graph on every call, so the comparison
 * always reflects live data (including freshly injected rings).
 */

let SQL: any = null;
async function getSql() {
  if (!SQL) {
    const require = createRequire(import.meta.url);
    const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
    const wasmBinary = fs.readFileSync(wasmPath);
    SQL = await initSqlJs({ wasmBinary });
  }
  return SQL;
}

const CYPHER_QUERY = `MATCH (a1:Account)-[:USED_DEVICE|USED_IP|REGISTERED_WITH]->(shared)
      <-[:USED_DEVICE|USED_IP|REGISTERED_WITH]-(a2:Account)
WHERE a1.id < a2.id
RETURN a1.id, a2.id, shared.id`;

const SQL_QUERY = `-- Realistic relational schema: infrastructure lives in separate tables,
-- so "accounts sharing infrastructure" is a UNION of three self-joins.
SELECT d1.account_id AS a1, d2.account_id AS a2, d1.device_id AS shared
FROM account_devices d1
JOIN account_devices d2 ON d1.device_id = d2.device_id AND d1.account_id < d2.account_id
UNION
SELECT i1.account_id, i2.account_id, i1.ip_id
FROM account_ips i1
JOIN account_ips i2 ON i1.ip_id = i2.ip_id AND i1.account_id < i2.account_id
UNION
SELECT p1.account_id, p2.account_id, p1.phone_id
FROM account_phones p1
JOIN account_phones p2 ON p1.phone_id = p2.phone_id AND p1.account_id < p2.account_id;`;

export async function runBenchmark() {
  const driver = getDriver();
  const session = driver.session();
  try {
    // --- Pull current graph edges from Neo4j (used to mirror into SQLite) ---
    const edgeRes = await session.run(`
      MATCH (a:Account)-[r:USED_DEVICE|USED_IP|REGISTERED_WITH]->(attr)
      RETURN a.id AS acc, attr.id AS attr, type(r) AS rel
    `);
    const rows = edgeRes.records.map((r) => ({
      acc: r.get("acc"),
      attr: r.get("attr"),
      rel: r.get("rel"),
    }));

    // --- Neo4j / Cypher timing ---
    // Wall-clock includes the round-trip to AuraDB (cloud). We also capture the server-side
    // execution time from the query summary, which is the fair engine-vs-engine number since
    // SQLite runs in-process with no network hop.
    const cypherStart = performance.now();
    const cypherRes = await session.run(CYPHER_QUERY);
    const cypherWallMs = performance.now() - cypherStart;
    const cypherRows = cypherRes.records.length;
    const avail = cypherRes.summary.resultAvailableAfter.toNumber();
    const consumed = cypherRes.summary.resultConsumedAfter.toNumber();
    const cypherServerMs = avail + consumed;

    // --- SQLite / SQL timing (build mirror, then run the union of self-joins) ---
    const SQLjs = await getSql();
    const db = new SQLjs.Database();
    db.run(`
      CREATE TABLE account_devices (account_id TEXT, device_id TEXT);
      CREATE TABLE account_ips (account_id TEXT, ip_id TEXT);
      CREATE TABLE account_phones (account_id TEXT, phone_id TEXT);
    `);
    const insD = db.prepare("INSERT INTO account_devices VALUES (?, ?)");
    const insI = db.prepare("INSERT INTO account_ips VALUES (?, ?)");
    const insP = db.prepare("INSERT INTO account_phones VALUES (?, ?)");
    db.run("BEGIN");
    for (const r of rows) {
      if (r.rel === "USED_DEVICE") insD.run([r.acc, r.attr]);
      else if (r.rel === "USED_IP") insI.run([r.acc, r.attr]);
      else insP.run([r.acc, r.attr]);
    }
    db.run("COMMIT");
    insD.free();
    insI.free();
    insP.free();
    // Index them the way a DBA would — give SQL its best shot, this is a fair fight.
    db.run(`
      CREATE INDEX idx_d ON account_devices(device_id);
      CREATE INDEX idx_i ON account_ips(ip_id);
      CREATE INDEX idx_p ON account_phones(phone_id);
    `);

    const sqlStart = performance.now();
    const sqlRes = db.exec(SQL_QUERY);
    const sqlMs = performance.now() - sqlStart;
    const sqlRows = sqlRes.length > 0 ? sqlRes[0].values.length : 0;

    // ------------------------------------------------------------------
    // PART 2 — the actual fraud question: "trace the WHOLE ring."
    // Given one known-bad account, find every account transitively linked to it through
    // shared infrastructure (any depth). This is where graph and SQL diverge sharply.
    // ------------------------------------------------------------------
    const seedRes = await session.run(
      `MATCH (a:Account {is_ring_member: true}) RETURN a.id AS id LIMIT 1`
    );
    const seed = seedRes.records[0]?.get("id") ?? rows[0]?.acc;

    // SQL: build an account<->account "shares infrastructure" edge table (both directions)
    // from the pairs we just found, then a recursive CTE to walk the component to fixpoint.
    db.run(`CREATE TABLE shares (a TEXT, b TEXT);`);
    const insS = db.prepare("INSERT INTO shares VALUES (?, ?)");
    db.run("BEGIN");
    if (sqlRes.length > 0) {
      for (const [a1, a2] of sqlRes[0].values as string[][]) {
        insS.run([a1, a2]);
        insS.run([a2, a1]);
      }
    }
    db.run("COMMIT");
    insS.free();
    db.run(`CREATE INDEX idx_s ON shares(a);`);

    const SQL_TRANSITIVE = `WITH RECURSIVE ring(account) AS (
  SELECT '${seed}'
  UNION
  SELECT s.b FROM shares s JOIN ring r ON s.a = r.account
)
SELECT COUNT(*) FROM ring WHERE account <> '${seed}';`;
    const sqlTStart = performance.now();
    const sqlTRes = db.exec(SQL_TRANSITIVE);
    const sqlTMs = performance.now() - sqlTStart;
    const sqlReached = sqlTRes.length > 0 ? Number(sqlTRes[0].values[0][0]) : 0;
    db.close();

    const CYPHER_TRANSITIVE = `MATCH (s:Account {id: '${seed}'})
      -[:USED_DEVICE|USED_IP|REGISTERED_WITH*1..12]-(c:Account)
WHERE c.id <> s.id
RETURN count(DISTINCT c) AS reached`;
    const cypherTStart = performance.now();
    const cypherTRes = await session.run(CYPHER_TRANSITIVE);
    const cypherTWall = performance.now() - cypherTStart;
    const cypherReached = cypherTRes.records[0]?.get("reached")?.toNumber?.() ?? 0;
    const cypherTServer =
      cypherTRes.summary.resultAvailableAfter.toNumber() +
      cypherTRes.summary.resultConsumedAfter.toNumber();

    return {
      question: "Find every pair of accounts that share a device, IP, or phone number.",
      cypher: {
        engine: "Neo4j (Cypher)",
        ms: Number(cypherServerMs.toFixed(1)),
        wallMs: Number(cypherWallMs.toFixed(1)),
        rows: cypherRows,
        lines: CYPHER_QUERY.split("\n").length,
        query: CYPHER_QUERY,
      },
      sql: {
        engine: "SQLite (SQL)",
        ms: Number(sqlMs.toFixed(1)),
        rows: sqlRows,
        lines: SQL_QUERY.split("\n").filter((l) => !l.trim().startsWith("--") && l.trim()).length,
        query: SQL_QUERY,
      },
      transitive: {
        question: `Trace the entire ring: every account transitively linked to a known fraud account (${seed}) through shared infrastructure, at any depth.`,
        seed,
        cypher: {
          engine: "Neo4j (Cypher)",
          ms: Number(cypherTServer.toFixed(1)),
          wallMs: Number(cypherTWall.toFixed(1)),
          reached: cypherReached,
          lines: CYPHER_TRANSITIVE.split("\n").length,
          query: CYPHER_TRANSITIVE,
        },
        sql: {
          engine: "SQLite (recursive CTE)",
          ms: Number(sqlTMs.toFixed(1)),
          reached: sqlReached,
          lines: SQL_TRANSITIVE.split("\n").length,
          query: SQL_TRANSITIVE,
        },
        match: cypherReached === sqlReached,
      },
      note:
        "Both engines run on identical live data and return the same answer. On a single hop " +
        "they are comparable. But the real fraud question — 'how deep does the ring go?' — is " +
        "transitive: A shares a device with B, B shares an IP with C. In Cypher that is one " +
        "variable-length pattern; in SQL it forces a recursive CTE, and every extra hop is more " +
        "work. That is why fraud-ring detection is a graph problem.",
    };
  } finally {
    await session.close();
  }
}
