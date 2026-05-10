import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cats = JSON.parse(readFileSync(join(__dirname, "json/fortiguard.json"), "utf8"));

export async function fortiguard(url) {
  const res = await fetch(
    "https://wsfgd1.fortiguard.net:3400/service/wfquery" +
    "?protver=1.0&cltkey=bossbaby&emssn=lol&clttype=ie&type=cate&catver=10" +
    "&qurl=" + encodeURIComponent(url)
  );
  const json = await res.json();
  const data = json.data ?? [];
  if (!data.length) return { category: "Not Rated", blocked: true };
  const names = [];
  let isBlocked = false;
  for (const id of data) {
    const info = cats[id] ?? { category: "Unknown", blocked: true };
    names.push(info.category);
    if (info.blocked) isBlocked = true;
  }
  return { category: names.join(", "), blocked: isBlocked };
}
