import { getDriver } from "./db.js";
import { faker } from "@faker-js/faker";

/**
 * Creates a new small fraud ring directly in the live graph — used to simulate a ring
 * forming in real time during a demo, without reloading the whole dataset.
 * Returns the new account IDs so the frontend can highlight them as "just created".
 */
export async function injectFraudRing(size: number = 6) {
  const driver = getDriver();
  const session = driver.session();
  const ts = Date.now();

  try {
    const deviceId = `DEV-INJ-${ts}`;
    const ipId = `IP-INJ-${ts}`;
    const phoneId = `PHONE-INJ-${ts}`;

    await session.run(
      `CREATE (:Device {id: $deviceId, fingerprint: $fp, type: 'mobile'})
       CREATE (:IPAddress {id: $ipId, address: $addr})
       CREATE (:PhoneNumber {id: $phoneId, number: $number})`,
      {
        deviceId,
        fp: faker.string.hexadecimal({ length: 16, casing: "upper", prefix: "" }),
        ipId,
        addr: faker.internet.ipv4(),
        phoneId,
        number: faker.phone.number({ style: "international" }),
      }
    );

    const accountIds: string[] = [];
    for (let i = 0; i < size; i++) {
      const accId = `ACC-INJ-${ts}-${i}`;
      accountIds.push(accId);
      await session.run(
        `CREATE (a:Account {id: $id, name: $name, city: $city, created_at: datetime(), is_ring_member: true, injected: true})
         WITH a
         MATCH (d:Device {id: $deviceId}), (ip:IPAddress {id: $ipId})
         CREATE (a)-[:USED_DEVICE]->(d)
         CREATE (a)-[:USED_IP]->(ip)`,
        {
          id: accId,
          name: faker.person.fullName(),
          city: faker.helpers.arrayElement(["Delhi", "Mumbai", "Bengaluru", "Chennai", "Pune"]),
          deviceId,
          ipId,
        }
      );
      if (Math.random() < 0.6) {
        await session.run(
          `MATCH (a:Account {id: $id}), (p:PhoneNumber {id: $phoneId}) CREATE (a)-[:REGISTERED_WITH]->(p)`,
          { id: accId, phoneId }
        );
      }
    }

    // dense internal transactions: everyone sends to the first account (mule pattern)
    const mule = accountIds[0];
    for (const accId of accountIds.slice(1)) {
      const numTx = faker.number.int({ min: 2, max: 5 });
      for (let t = 0; t < numTx; t++) {
        await session.run(
          `MATCH (from:Account {id: $from}), (to:Account {id: $to})
           CREATE (from)-[:TRANSACTED_WITH {id: $txId, amount: $amount, timestamp: datetime()}]->(to)`,
          {
            from: accId,
            to: mule,
            txId: `TX-INJ-${ts}-${t}-${accId}`,
            amount: Number(faker.finance.amount({ min: 1000, max: 20000, dec: 2 })),
          }
        );
      }
    }

    return { injected: true, accountIds, sharedDevice: deviceId, sharedIp: ipId };
  } finally {
    await session.close();
  }
}
