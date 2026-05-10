import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cats = JSON.parse(readFileSync(join(__dirname, "json/senso.json"), "utf8"));

export async function senso(url) {
  const domain = url.replace(/^https?:\/\//, "").split("/")[0];
  const res = await fetch(`https://filtering.senso.cloud/filter/lookup?url=https://${domain}`);
  const json = await res.json();
  const names = [];
  let blocked = false;
  for (const id of json) {
    if (cats[id]) {
      names.push(cats[id][0]);
      if (cats[id][1]) blocked = true;
    }
  }
  if (!names.length) return { category: "Uncategorized", blocked: true };
  return { category: names.join(", "), blocked };
}
