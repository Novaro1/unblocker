import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const blockedCats = new Set(JSON.parse(readFileSync(join(__dirname, "json/paloblocked.json"), "utf8")));

const BASE = "https://urlfiltering.paloaltonetworks.com";
const UA   = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// In-memory session — survives for the lifetime of the process
let session = { id: null, csrf: null };

function parseCookies(headers) {
  const cookies = {};
  const raw = headers.getSetCookie ? headers.getSetCookie() : [headers.get("set-cookie")].filter(Boolean);
  for (const c of raw) {
    const [pair] = c.split(";");
    const [k, v] = pair.split("=");
    if (k && v) cookies[k.trim()] = v.trim();
  }
  return cookies;
}

async function login() {
  const username = process.env.PAN_USERNAME;
  const password = process.env.PAN_PASSWORD;
  if (!username || !password) throw new Error("PAN_USERNAME / PAN_PASSWORD env vars not set");

  // Step 1 — GET login page to obtain initial csrftoken cookie
  const getRes = await fetch(`${BASE}/accounts/login/`, {
    headers: { "User-Agent": UA },
  });
  const initCookies = parseCookies(getRes.headers);
  const csrftoken = initCookies.csrftoken;
  if (!csrftoken) throw new Error("PAN login: could not get csrftoken from login page");

  // Step 2 — POST credentials
  const postRes = await fetch(`${BASE}/accounts/login/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie":       `csrftoken=${csrftoken}`,
      "Referer":      `${BASE}/accounts/login/`,
      "User-Agent":   UA,
    },
    body: new URLSearchParams({
      csrfmiddlewaretoken: csrftoken,
      username,
      password,
      next: "/",
    }),
    redirect: "manual",
  });

  const loginCookies = parseCookies(postRes.headers);
  const sessionid = loginCookies.sessionid;
  const newCsrf   = loginCookies.csrftoken ?? csrftoken;

  if (!sessionid) throw new Error("PAN login failed — check PAN_USERNAME / PAN_PASSWORD");

  session = { id: sessionid, csrf: newCsrf };
}

async function query(url) {
  const res = await fetch(`${BASE}/query/`, {
    method: "POST",
    headers: {
      "Cookie":       `sessionid=${session.id}; csrftoken=${session.csrf}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Referer":      `${BASE}/`,
      "User-Agent":   UA,
    },
    body: new URLSearchParams({ url, csrfmiddlewaretoken: session.csrf }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export async function paloalto(url) {
  // Log in on first use
  if (!session.id) await login();

  let text = await query(url);

  // Session expired — re-login once and retry
  if (!text.includes("var categories")) {
    if (text.includes("g-recaptcha") || text.includes("unauthUserModal") || text.includes("login")) {
      await login();
      text = await query(url);
    }
    if (!text.includes("var categories")) throw new Error("unexpected page structure");
  }

  // The JS uses single-quoted strings so we can't JSON.parse — extract 'name' values with regex
  const names = [...text.matchAll(/'name':\s*'([^']+)'/g)].map(m => m[1].replace(/-/g, " "));
  const category = names.join(", ") || "Unknown";
  const isBlocked = names.some(n => blockedCats.has(n.replace(/ /g, "-")));
  return { category, blocked: isBlocked };
}
