import { resetData } from "./graph.js";
import { closeDriver } from "./db.js";

/** Clears detection state (Ring nodes + flags) and injected demo data for a clean-slate demo. */
async function main() {
  await resetData();
  console.log("Reset: removed Ring nodes, cleared account flags, and deleted injected demo data.");
  await closeDriver();
}
main();
