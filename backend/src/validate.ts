import { detectFraudRings } from "./detection.js";
import { getDriver } from "./db.js";
import fs from "fs";
import path from "path";

/**
 * Runs detection and scores it against the generator's ground_truth.json:
 * reports recall (seeded rings correctly found) and false positives.
 * A detected ring "matches" a seeded ring if it recovers >=70% of its members.
 */
async function main() {
  const gt = JSON.parse(
    fs.readFileSync(path.resolve("../generator/output/ground_truth.json"), "utf-8")
  ) as { ring_id: string; account_ids: string[] }[];

  const result = await detectFraudRings();
  const detected = result.rings ?? [];

  let matched = 0;
  const matchedDetected = new Set<string>();

  for (const seed of gt) {
    const seedSet = new Set(seed.account_ids);
    const hit = detected.find((d: any) => {
      const overlap = d.member_ids.filter((id: string) => seedSet.has(id)).length;
      return overlap / seed.account_ids.length >= 0.7;
    });
    if (hit) {
      matched++;
      matchedDetected.add(hit.ring_id);
      console.log(`✅ ${seed.ring_id} (${seed.account_ids.length} accts) -> detected as ${hit.ring_id} (density ${hit.density_ratio}x, conf ${hit.confidence_score})`);
    } else {
      console.log(`❌ ${seed.ring_id} MISSED`);
    }
  }

  const falsePositives = detected.filter((d: any) => !matchedDetected.has(d.ring_id));

  console.log(`\n--- SCORE ---`);
  console.log(`Recall:          ${matched}/${gt.length} seeded rings detected (${((matched / gt.length) * 100).toFixed(0)}%)`);
  console.log(`False positives: ${falsePositives.length}`);
  console.log(`Precision:       ${detected.length ? ((matched / detected.length) * 100).toFixed(0) : 0}%`);

  await getDriver().close();
}
main();
