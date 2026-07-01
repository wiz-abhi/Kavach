import neo4j from "neo4j-driver";
import fs from "fs";
import path from "path";
import "dotenv/config";

const URI = process.env.NEO4J_URI;
const USER = process.env.NEO4J_USERNAME;
const PASSWORD = process.env.NEO4J_PASSWORD;

if (!URI || !USER || !PASSWORD) {
  console.error("Missing NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD in generator/.env");
  console.error("Copy .env.example to .env and fill in your AuraDB credentials.");
  process.exit(1);
}

const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));

function readJSON(file: string) {
  return JSON.parse(fs.readFileSync(path.resolve("./output", file), "utf-8"));
}

async function main() {
  const session = driver.session();
  try {
    console.log("Verifying connection...");
    await driver.verifyConnectivity();
    console.log("Connected to Neo4j.");

    console.log("Clearing existing data (MATCH (n) DETACH DELETE n)...");
    await session.run("MATCH (n) DETACH DELETE n");

    console.log("Creating constraints...");
    await session.run("CREATE CONSTRAINT account_id IF NOT EXISTS FOR (a:Account) REQUIRE a.id IS UNIQUE");
    await session.run("CREATE CONSTRAINT device_id IF NOT EXISTS FOR (d:Device) REQUIRE d.id IS UNIQUE");
    await session.run("CREATE CONSTRAINT ip_id IF NOT EXISTS FOR (i:IPAddress) REQUIRE i.id IS UNIQUE");
    await session.run("CREATE CONSTRAINT phone_id IF NOT EXISTS FOR (p:PhoneNumber) REQUIRE p.id IS UNIQUE");

    const accounts = readJSON("accounts.json");
    const devices = readJSON("devices.json");
    const ips = readJSON("ips.json");
    const phones = readJSON("phones.json");
    const edges = readJSON("edges.json");
    const transactions = readJSON("transactions.json");

    console.log(`Loading ${accounts.length} accounts...`);
    await session.run(
      `UNWIND $rows AS row
       CREATE (a:Account {id: row.id, name: row.name, city: row.city, created_at: row.created_at, is_ring_member: row.is_ring_member})`,
      { rows: accounts }
    );

    console.log(`Loading ${devices.length} devices...`);
    await session.run(
      `UNWIND $rows AS row CREATE (d:Device {id: row.id, fingerprint: row.fingerprint, type: row.type})`,
      { rows: devices }
    );

    console.log(`Loading ${ips.length} IPs...`);
    await session.run(
      `UNWIND $rows AS row CREATE (i:IPAddress {id: row.id, address: row.address})`,
      { rows: ips }
    );

    console.log(`Loading ${phones.length} phone numbers...`);
    await session.run(
      `UNWIND $rows AS row CREATE (p:PhoneNumber {id: row.id, number: row.number})`,
      { rows: phones }
    );

    console.log(`Loading ${edges.length} account-attribute edges...`);
    const deviceEdges = edges.filter((e: any) => e.rel === "USED_DEVICE");
    const ipEdges = edges.filter((e: any) => e.rel === "USED_IP");
    const phoneEdges = edges.filter((e: any) => e.rel === "REGISTERED_WITH");

    await session.run(
      `UNWIND $rows AS row
       MATCH (a:Account {id: row.from_id}), (d:Device {id: row.to_id})
       CREATE (a)-[:USED_DEVICE]->(d)`,
      { rows: deviceEdges }
    );
    await session.run(
      `UNWIND $rows AS row
       MATCH (a:Account {id: row.from_id}), (i:IPAddress {id: row.to_id})
       CREATE (a)-[:USED_IP]->(i)`,
      { rows: ipEdges }
    );
    await session.run(
      `UNWIND $rows AS row
       MATCH (a:Account {id: row.from_id}), (p:PhoneNumber {id: row.to_id})
       CREATE (a)-[:REGISTERED_WITH]->(p)`,
      { rows: phoneEdges }
    );

    console.log(`Loading ${transactions.length} transactions...`);
    // batch in chunks to avoid huge single queries
    const CHUNK = 500;
    for (let i = 0; i < transactions.length; i += CHUNK) {
      const chunk = transactions.slice(i, i + CHUNK);
      await session.run(
        `UNWIND $rows AS row
         MATCH (from:Account {id: row.from_account}), (to:Account {id: row.to_account})
         CREATE (from)-[:TRANSACTED_WITH {id: row.id, amount: row.amount, timestamp: row.timestamp}]->(to)`,
        { rows: chunk }
      );
      console.log(`  ...${Math.min(i + CHUNK, transactions.length)}/${transactions.length}`);
    }

    console.log("\n✅ Load complete.");
  } catch (err) {
    console.error("Error loading data:", err);
    process.exit(1);
  } finally {
    await session.close();
    await driver.close();
  }
}

main();
