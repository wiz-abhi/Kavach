import { getDriver } from "./db.js";

/** Clears detection state (Ring nodes + flags) so a demo/test starts from a clean slate. */
async function main() {
  const driver = getDriver();
  const session = driver.session();
  try {
    await session.run(`MATCH (r:Ring) DETACH DELETE r`);
    await session.run(`MATCH (a:Account) REMOVE a.flagged`);
    console.log("Reset: removed all Ring nodes and cleared account flags.");
  } finally {
    await session.close();
    await driver.close();
  }
}
main();
