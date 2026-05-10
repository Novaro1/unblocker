import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ckJson = JSON.parse(readFileSync(join(__dirname, "json/contentkeeper.json"), "utf8"));

export async function contentkeeper(url) {
  // The reference ContentKeeper lookup server (barringtonschools.org) is offline.
  // ContentKeeper is a legacy filter used mainly in Australian K-12 schools.
  throw new Error("reference server offline");
}
