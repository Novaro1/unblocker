import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const blockedCats = new Set(JSON.parse(readFileSync(join(__dirname, "json/paloblocked.json"), "utf8")));

export async function paloalto(url) {
  const res = await fetch(`https://urlfiltering.paloaltonetworks.com/single_cr/?url=${encodeURIComponent(url)}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json,text/html,*/*",
      Referer: "https://urlfiltering.paloaltonetworks.com/",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  let text = await res.text();
  text = text.replace(/[\t\n\r\f\v]+/g, "").replace(/ {2,}/g, " ");
  const raw = text.split(`Current Category</label> <div class=" col-sm-10 col-lg-10 form-text"> `)[1]?.split(" <")[0]?.trim() ?? "";
  const category = raw.replace(/<[^>]*>/g, "").trim() || "Unknown";
  const cats = category.split(",").map(c => c.trim());
  // FIX: original code had !blocked (inverted). blocked=true when ANY category is in the blocked list.
  const isBlocked = cats.some(c => blockedCats.has(c));
  return { category, blocked: isBlocked };
}
