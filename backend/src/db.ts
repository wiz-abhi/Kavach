import neo4j, { Driver } from "neo4j-driver";
import "dotenv/config";

const URI = process.env.NEO4J_URI || "";
const USER = process.env.NEO4J_USERNAME || "";
const PASSWORD = process.env.NEO4J_PASSWORD || "";

let driver: Driver | null = null;

export function getDriver(): Driver {
  if (!driver) {
    if (!URI || !USER || !PASSWORD) {
      throw new Error(
        "Missing Neo4j credentials. Set NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD in backend/.env"
      );
    }
    driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));
  }
  return driver;
}

export async function closeDriver() {
  if (driver) await driver.close();
}
