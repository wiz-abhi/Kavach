import { faker } from "@faker-js/faker";
import { CONFIG } from "./config.ts";
import fs from "fs";
import path from "path";

faker.seed(CONFIG.SEED);

type Account = { id: string; name: string; city: string; created_at: string; is_ring_member: boolean };
type Device = { id: string; fingerprint: string; type: "mobile" | "desktop" };
type IP = { id: string; address: string };
type Phone = { id: string; number: string };
type Edge = { from_type: string; from_id: string; to_type: string; to_id: string; rel: string };
type Transaction = { id: string; from_account: string; to_account: string; amount: number; timestamp: string };

const accounts: Account[] = [];
const devices: Device[] = [];
const ips: IP[] = [];
const phones: Phone[] = [];
const edges: Edge[] = []; // USED_DEVICE / USED_IP / REGISTERED_WITH
const transactions: Transaction[] = [];
const groundTruthRings: { ring_id: string; account_ids: string[] }[] = [];

let deviceCounter = 0;
let ipCounter = 0;
let phoneCounter = 0;
let accountCounter = 0;
let txCounter = 0;

function newDevice(): Device {
  deviceCounter++;
  const d: Device = {
    id: `DEV-${deviceCounter}`,
    fingerprint: faker.string.hexadecimal({ length: 16, casing: "upper", prefix: "" }),
    type: faker.helpers.arrayElement(["mobile", "desktop"]),
  };
  devices.push(d);
  return d;
}

function newIP(): IP {
  ipCounter++;
  const ip: IP = { id: `IP-${ipCounter}`, address: faker.internet.ipv4() };
  ips.push(ip);
  return ip;
}

function newPhone(): Phone {
  phoneCounter++;
  const p: Phone = { id: `PHONE-${phoneCounter}`, number: faker.phone.number({ style: "international" }) };
  phones.push(p);
  return p;
}

function newAccount(isRingMember: boolean): Account {
  accountCounter++;
  const a: Account = {
    id: `ACC-${accountCounter}`,
    name: faker.person.fullName(),
    city: faker.helpers.arrayElement(CONFIG.CITIES),
    created_at: faker.date.past({ years: 1 }).toISOString(),
    is_ring_member: isRingMember,
  };
  accounts.push(a);
  return a;
}

function randomTimestampRecent(): string {
  return faker.date.recent({ days: 30 }).toISOString();
}

// ---------- 1. Normal population ----------
console.log(`Generating ${CONFIG.NORMAL_ACCOUNTS} normal accounts...`);
for (let i = 0; i < CONFIG.NORMAL_ACCOUNTS; i++) {
  const acc = newAccount(false);
  const dev = newDevice();
  const ip = newIP();
  const phone = newPhone();
  edges.push({ from_type: "Account", from_id: acc.id, to_type: "Device", to_id: dev.id, rel: "USED_DEVICE" });
  edges.push({ from_type: "Account", from_id: acc.id, to_type: "IPAddress", to_id: ip.id, rel: "USED_IP" });
  edges.push({ from_type: "Account", from_id: acc.id, to_type: "PhoneNumber", to_id: phone.id, rel: "REGISTERED_WITH" });

  // small % of normal accounts share a device with one other normal account (realistic noise -
  // e.g. family members) so the algorithm has to distinguish real rings from innocent overlap
  if (Math.random() < 0.03 && devices.length > 1) {
    const otherDevice = faker.helpers.arrayElement(devices.slice(0, -1));
    edges.push({ from_type: "Account", from_id: acc.id, to_type: "Device", to_id: otherDevice.id, rel: "USED_DEVICE" });
  }
}

console.log(`Generating ${CONFIG.NORMAL_TRANSACTIONS} normal transactions...`);
for (let i = 0; i < CONFIG.NORMAL_TRANSACTIONS; i++) {
  const from = faker.helpers.arrayElement(accounts);
  let to = faker.helpers.arrayElement(accounts);
  while (to.id === from.id) to = faker.helpers.arrayElement(accounts);
  txCounter++;
  transactions.push({
    id: `TX-${txCounter}`,
    from_account: from.id,
    to_account: to.id,
    amount: Number(faker.finance.amount({ min: 100, max: 50000, dec: 2 })),
    timestamp: randomTimestampRecent(),
  });
}

// ---------- 2. Fraud rings (ground truth) ----------
console.log(`Seeding ${CONFIG.NUM_RINGS} fraud rings...`);
for (let r = 0; r < CONFIG.NUM_RINGS; r++) {
  const ringSize = faker.number.int({ min: CONFIG.RING_SIZE_MIN, max: CONFIG.RING_SIZE_MAX });
  const ringId = `RING-${r + 1}`;
  const ringAccounts: Account[] = [];

  // shared infra pool for this ring
  const sharedDevices = Array.from({ length: CONFIG.RING_SHARED_DEVICES }, () => newDevice());
  const sharedIPs = Array.from({ length: CONFIG.RING_SHARED_IPS }, () => newIP());
  const sharedPhones = Array.from({ length: CONFIG.RING_SHARED_PHONES }, () => newPhone());

  for (let i = 0; i < ringSize; i++) {
    const acc = newAccount(true);
    ringAccounts.push(acc);

    // each ring member uses 1-2 of the shared devices/IPs (not all the same one every time,
    // to look more organic) plus sometimes one shared phone
    const dev = faker.helpers.arrayElement(sharedDevices);
    const ip = faker.helpers.arrayElement(sharedIPs);
    edges.push({ from_type: "Account", from_id: acc.id, to_type: "Device", to_id: dev.id, rel: "USED_DEVICE" });
    edges.push({ from_type: "Account", from_id: acc.id, to_type: "IPAddress", to_id: ip.id, rel: "USED_IP" });

    if (Math.random() < 0.5) {
      const phone = faker.helpers.arrayElement(sharedPhones);
      edges.push({ from_type: "Account", from_id: acc.id, to_type: "PhoneNumber", to_id: phone.id, rel: "REGISTERED_WITH" });
    } else {
      const phone = newPhone();
      edges.push({ from_type: "Account", from_id: acc.id, to_type: "PhoneNumber", to_id: phone.id, rel: "REGISTERED_WITH" });
    }
  }

  // dense internal transaction pattern: star + loop mix so it's not perfectly uniform
  const mule = ringAccounts[0];
  for (const acc of ringAccounts) {
    if (acc.id === mule.id) continue;
    const numTx = faker.number.int({ min: 2, max: CONFIG.RING_INTERNAL_TX_MULTIPLIER });
    for (let t = 0; t < numTx; t++) {
      txCounter++;
      transactions.push({
        id: `TX-${txCounter}`,
        from_account: acc.id,
        to_account: mule.id,
        amount: Number(faker.finance.amount({ min: 500, max: 20000, dec: 2 })),
        timestamp: randomTimestampRecent(),
      });
    }
  }
  // a few loop-style transactions between non-mule members too
  for (let i = 0; i < ringAccounts.length; i++) {
    const a = ringAccounts[i];
    const b = ringAccounts[(i + 1) % ringAccounts.length];
    if (a.id === b.id) continue;
    txCounter++;
    transactions.push({
      id: `TX-${txCounter}`,
      from_account: a.id,
      to_account: b.id,
      amount: Number(faker.finance.amount({ min: 500, max: 15000, dec: 2 })),
      timestamp: randomTimestampRecent(),
    });
  }

  groundTruthRings.push({ ring_id: ringId, account_ids: ringAccounts.map((a) => a.id) });
}

// ---------- 3. Shuffle accounts array so ring members aren't ID-contiguous in an obvious way ----------
// (IDs are already interleaved by generation order: normal accounts 1..400, then rings after.
//  For a slightly better mix, we leave IDs as-is since Neo4j querying doesn't care about ID order,
//  but real-world data wouldn't be ID-sorted by fraud status either way.)

// ---------- 4. Write output ----------
const outDir = path.resolve("./output");
fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(path.join(outDir, "accounts.json"), JSON.stringify(accounts, null, 2));
fs.writeFileSync(path.join(outDir, "devices.json"), JSON.stringify(devices, null, 2));
fs.writeFileSync(path.join(outDir, "ips.json"), JSON.stringify(ips, null, 2));
fs.writeFileSync(path.join(outDir, "phones.json"), JSON.stringify(phones, null, 2));
fs.writeFileSync(path.join(outDir, "edges.json"), JSON.stringify(edges, null, 2));
fs.writeFileSync(path.join(outDir, "transactions.json"), JSON.stringify(transactions, null, 2));
fs.writeFileSync(path.join(outDir, "ground_truth.json"), JSON.stringify(groundTruthRings, null, 2));

// CSVs (useful if you want to LOAD CSV directly in Neo4j Browser instead of using load.ts)
function toCSV<T extends object>(rows: T[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => JSON.stringify((row as any)[h] ?? "")).join(","));
  }
  return lines.join("\n");
}

fs.writeFileSync(path.join(outDir, "accounts.csv"), toCSV(accounts));
fs.writeFileSync(path.join(outDir, "devices.csv"), toCSV(devices));
fs.writeFileSync(path.join(outDir, "ips.csv"), toCSV(ips));
fs.writeFileSync(path.join(outDir, "phones.csv"), toCSV(phones));
fs.writeFileSync(path.join(outDir, "edges.csv"), toCSV(edges));
fs.writeFileSync(path.join(outDir, "transactions.csv"), toCSV(transactions));

console.log("\n✅ Done.");
console.log(`   Accounts: ${accounts.length} (${groundTruthRings.reduce((s, r) => s + r.account_ids.length, 0)} in seeded rings)`);
console.log(`   Devices: ${devices.length}, IPs: ${ips.length}, Phones: ${phones.length}`);
console.log(`   Transactions: ${transactions.length}`);
console.log(`   Seeded rings: ${groundTruthRings.length}`);
console.log(`   Output written to ${outDir}`);
