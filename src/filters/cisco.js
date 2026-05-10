import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const blocked = new Set(JSON.parse(readFileSync(join(__dirname, "json/ciscoblocked.json"), "utf8")));

export async function cisco(url) {
  const domain = url.replace(/^https?:\/\//, "").split("/")[0];
  const res = await fetch(`https://talosintelligence.com/cloud_intel/url_reputation?url=${domain}`);
  const json = await res.json();
  const cats = json.reputation?.aup_cat?.map(c => c.name) ?? [];
  if (!cats.length) return { category: "Not rated", blocked: false };
  const isBlocked = cats.some(c => blocked.has(c));
  return { category: cats.join(", "), blocked: isBlocked };
}
