import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ckJson = JSON.parse(readFileSync(join(__dirname, "json/contentkeeper.json"), "utf8"));

export async function contentkeeper(url) {
  const domain = url.replace(/^https?:\/\//, "").split("/")[0];
  const res = await fetch("https://ckf01.barringtonschools.org/cgi-bin/ck/re_u.cgi", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      USER: "", URL_AREA: domain, NUM_SUBMIT_URL: "1",
      SEL_1: "29", CAT_1: "-1", URL_1: domain, DAT_1: "Global",
      SUBMIT_SITE_SECOND_CANCEL: "Cancel",
    }),
  });
  const html = await res.text();
  let category;
  try {
    category = html.split("<td align='LEFT' style='color: Blue;'>")[1].split("</td>")[0].trim();
  } catch {
    category = html.split("<td align='LEFT' style='color: #ff0000;'>")[1]?.split("</td>")[0].trim() ?? "Unknown";
  }
  const blocked = ckJson[category] !== undefined ? ckJson[category] === "B" : true;
  const loc = html.split("<input type='Hidden' name='DAT_1' value='")[1]?.split("'>")[0] ?? "Global";
  return { category: `${category} (${loc === "n/a" ? "Global" : loc})`, blocked };
}
