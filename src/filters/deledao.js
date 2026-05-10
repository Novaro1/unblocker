import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const deJson = JSON.parse(readFileSync(join(__dirname, "json/deledao.json"), "utf8"));
// Build map at module load (fix from original — was declared after the function)
const catMap = new Map(deJson.map(c => [c.category_number, c]));

const AUTH_TOKEN = "56afc0786f82c9e6fc4d49b5e63789dd";

export async function deledao(url) {
  const domain = url.replace(/^https?:\/\//, "").split("/")[0];
  const res = await fetch("https://cc.deledao.com/GetCategory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: "1.2", auth: AUTH_TOKEN, hostlist: [domain] }),
  });
  if (!res.ok) throw new Error(`GetCategory ${res.status}`);
  const data = await res.json();
  const domainCats = data.DomainCategoryList ?? [];

  if (domainCats.length > 0 && domainCats[0]?.Cats?.[0] !== 0) {
    const catId = domainCats[0].Cats[0];
    const cat = catMap.get(catId);
    if (cat) return { category: cat.name, blocked: cat.blocked };
  }
  return { category: "Uncategorized", blocked: true };
}
