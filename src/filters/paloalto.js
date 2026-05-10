import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const blockedCats = new Set(JSON.parse(readFileSync(join(__dirname, "json/paloblocked.json"), "utf8")));

export async function paloalto(url) {
  // As of March 2026, Palo Alto Networks requires a CAPTCHA for URL category lookups.
  // The public lookup tool no longer returns results for unauthenticated automated requests.
  throw new Error("lookup requires login (captcha required since Mar 2026)");
}
