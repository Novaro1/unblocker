import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const blockedCats = new Set(JSON.parse(readFileSync(join(__dirname, "json/paloblocked.json"), "utf8")));

// Session cookies from urlfiltering.paloaltonetworks.com (PAN LIVEcommunity account).
// Logged-in users skip the captcha requirement added in March 2026.
// sessionid expires ~30 days after login — update PAN_SESSION_COOKIE in .env when it does.
const SESSION  = process.env.PAN_SESSION_COOKIE;
const CSRF     = process.env.PAN_CSRF_TOKEN;

export async function paloalto(url) {
  if (!SESSION || !CSRF) throw new Error("PAN_SESSION_COOKIE / PAN_CSRF_TOKEN env vars not set");

  const res = await fetch("https://urlfiltering.paloaltonetworks.com/query/", {
    method: "POST",
    headers: {
      "Cookie":       `sessionid=${SESSION}; csrftoken=${CSRF}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Referer":      "https://urlfiltering.paloaltonetworks.com/",
      "User-Agent":   "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    body: new URLSearchParams({ url, csrfmiddlewaretoken: CSRF }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();

  // Result is server-rendered: var categories = [{id, name, ...}, ...]
  if (!text.includes("var categories")) {
    if (text.includes("g-recaptcha") || text.includes("unauthUserModal")) {
      throw new Error("session expired — update PAN_SESSION_COOKIE in .env");
    }
    throw new Error("unexpected page structure");
  }

  // The JS uses single-quoted strings so we can't JSON.parse — extract 'name' values with regex
  const names = [...text.matchAll(/'name':\s*'([^']+)'/g)].map(m => m[1].replace(/-/g, " "));
  const category = names.join(", ") || "Unknown";
  const isBlocked = names.some(n => blockedCats.has(n.replace(/ /g, "-")));
  return { category, blocked: isBlocked };
}
