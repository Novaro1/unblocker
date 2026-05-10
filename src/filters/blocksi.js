import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const bJson = JSON.parse(readFileSync(join(__dirname, "json/blocksi.json"), "utf8"));

export async function blocksiAI(url) {
  const res = await fetch("https://api.blocksi.net/url-classifier-llm/predict_url", {
    method: "POST",
    headers: {
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
      authorization: "Basic QXp6YXo6QmxvY2tzaUthcmlt",
      "content-type": "application/json",
    },
    body: JSON.stringify({ url }),
  });
  const json = await res.json();
  const category = ("document" in json ? json.document.predicted_specific_category : json.predicted_specific_category) ?? "Unknown";
  let blocked = true;
  for (const entry of Object.values(bJson.ai)) {
    if (entry.name === category && entry.blocked === false) { blocked = false; break; }
  }
  return { category: category === "Specific Category" ? "Unknown" : category, blocked };
}

export async function blocksiWeb(url) {
  const domain = url.replace(/^https?:\/\//, "").split("/")[0];
  const res = await fetch(`https://service1.blocksi.net/getRating.json?url=${domain}`);
  const json = await res.json();
  const code = String(json.Category);
  const entry = bJson.web[code];
  if (!entry) return { category: "Unknown", blocked: true };
  return { category: `${entry.cat}: ${entry.name}`, blocked: entry.blocked };
}
