import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { createHmac } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const blockedCats = new Set(JSON.parse(readFileSync(join(__dirname, "json/paloblocked.json"), "utf8")));

const BASE   = "https://urlfiltering.paloaltonetworks.com";
const OKTA   = "https://panw-ciam.okta-gov.com";
const UA     = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ── TOTP (RFC 6238) — no external deps ───────────────────────────────────────
function base32Decode(encoded) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0;
  const output = [];
  for (const c of encoded.replace(/=+$/, "").toUpperCase()) {
    const idx = chars.indexOf(c);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { output.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(output);
}

function totp(secret, windowOffset = 0) {
  const key  = base32Decode(secret);
  const ctr  = BigInt(Math.floor(Date.now() / 1000 / 30) + windowOffset);
  const buf  = Buffer.alloc(8);
  buf.writeBigInt64BE(ctr);
  const hmac = createHmac("sha1", key).update(buf).digest();
  const off  = hmac[19] & 0xf;
  const code = ((hmac[off] & 0x7f) << 24) | (hmac[off+1] << 16) | (hmac[off+2] << 8) | hmac[off+3];
  return String(code % 1_000_000).padStart(6, "0");
}

// ── Cookie helpers ────────────────────────────────────────────────────────────
function parseCookies(headers) {
  const out = {};
  const raw = headers.getSetCookie ? headers.getSetCookie() : [headers.get("set-cookie")].filter(Boolean);
  for (const c of raw) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) out[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return out;
}

// ── In-memory session ─────────────────────────────────────────────────────────
let session = { id: null, csrf: null };
let loginInProgress = null; // prevent concurrent logins

async function login() {
  const username   = process.env.PAN_USERNAME;
  const password   = process.env.PAN_PASSWORD;
  const totpSecret = process.env.PAN_TOTP_SECRET;
  if (!username || !password) throw new Error("PAN_USERNAME / PAN_PASSWORD env vars not set");
  if (!totpSecret)            throw new Error("PAN_TOTP_SECRET env var not set — add Google Authenticator to your PAN account");

  // ── Step 0: Get initial csrftoken from homepage ───────────────────────────
  const rootRes = await fetch(BASE, { headers: { "User-Agent": UA } });
  const initCsrf = parseCookies(rootRes.headers).csrftoken ?? "";

  // ── Step 1: Get the SAML redirect URL from the SP ──────────────────────────
  const spRedir = await fetch(`${BASE}/oktalogin`, {
    headers: { "User-Agent": UA, "Cookie": `csrftoken=${initCsrf}` },
    redirect: "manual",
  });
  const samlUrl = spRedir.headers.get("location");
  if (!samlUrl) throw new Error("PAN login: no redirect from /oktalogin");

  // ── Step 2: Authenticate with Okta ────────────────────────────────────────
  const authnRes = await fetch(`${OKTA}/api/v1/authn`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const authn = await authnRes.json();

  let sessionToken;

  if (authn.status === "SUCCESS") {
    sessionToken = authn.sessionToken;

  } else if (authn.status === "MFA_REQUIRED") {
    const stateToken = authn.stateToken;
    // Prefer TOTP factor; fall back to whatever is available
    const factors  = authn._embedded?.factors ?? [];
    const factor   = factors.find(f => f.factorType === "token:software:totp") ?? factors[0];
    if (!factor) throw new Error("PAN login: no MFA factor found");
    const factorId = factor.id;

    // Try current window ±1 to handle slight clock skew
    for (const w of [0, 1, -1]) {
      const verifyRes = await fetch(`${OKTA}/api/v1/authn/factors/${factorId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ stateToken, passCode: totp(totpSecret, w) }),
      });
      const verify = await verifyRes.json();
      if (verify.status === "SUCCESS") { sessionToken = verify.sessionToken; break; }
    }
    if (!sessionToken) throw new Error("PAN login: TOTP verification failed — check PAN_TOTP_SECRET");

  } else {
    throw new Error(`PAN login: Okta status "${authn.status}" — check credentials`);
  }

  // ── Step 3: Exchange sessionToken for SP session via SAML ─────────────────
  const samlPageRes = await fetch(`${samlUrl}&sessionToken=${encodeURIComponent(sessionToken)}`, {
    headers: { "User-Agent": UA },
    redirect: "follow",
  });
  const samlHtml = await samlPageRes.text();

  // Attributes may appear in any order; action URL and values may use HTML entities
  function inputVal(html, name) {
    const m = html.match(new RegExp(`name="${name}"[^>]+value="([^"]*)"`, "s")) ||
              html.match(new RegExp(`value="([^"]*)"[^>]+name="${name}"`, "s"));
    return m?.[1] ?? null;
  }
  function decodeEntities(s) {
    return s.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
            .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
            .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  }

  const samlResponse = decodeEntities(inputVal(samlHtml, "SAMLResponse") ?? "");
  const relayState   = inputVal(samlHtml, "RelayState") ?? "";
  const rawAction    = samlHtml.match(/<form[^>]+action="([^"]+)"/s)?.[1];
  const acsAction    = rawAction ? decodeEntities(rawAction) : null;
  if (!samlResponse || !acsAction) throw new Error("PAN login: could not extract SAMLResponse from Okta page");

  const acsRes = await fetch(acsAction, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
      "Cookie": `csrftoken=${initCsrf}`,
      "Referer": "https://sso.paloaltonetworks.com/",
    },
    body: new URLSearchParams({ SAMLResponse: samlResponse, RelayState: relayState }),
    redirect: "manual",
  });

  // The ACS response is a redirect — follow it to collect the final session cookie
  const acsCookies = parseCookies(acsRes.headers);
  let sessionId = acsCookies.sessionid;
  let csrf      = acsCookies.csrftoken;

  if (!sessionId) {
    // Some SAML setups redirect once more before setting the session cookie
    const nextUrl = acsRes.headers.get("location");
    if (nextUrl) {
      const finalRes = await fetch(nextUrl, {
        headers: { "User-Agent": UA, "Cookie": `csrftoken=${csrf}` },
        redirect: "manual",
      });
      const finalCookies = parseCookies(finalRes.headers);
      sessionId = finalCookies.sessionid ?? sessionId;
      csrf      = finalCookies.csrftoken ?? csrf;
    }
  }

  if (!sessionId) throw new Error("PAN login: no sessionid after SAML assertion");

  // Get a fresh csrftoken from the homepage if we only got the sessionid
  if (!csrf) {
    const homeRes = await fetch(BASE, {
      headers: { "User-Agent": UA, "Cookie": `sessionid=${sessionId}` },
    });
    csrf = parseCookies(homeRes.headers).csrftoken;
  }

  session = { id: sessionId, csrf };
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

// Warm up session at startup so the first real query doesn't pay login latency
loginInProgress = login().finally(() => { loginInProgress = null; });

export async function paloalto(url) {
  // Wait for in-progress login (startup or refresh) before querying
  if (loginInProgress) await loginInProgress;
  if (!session.id) {
    loginInProgress = login().finally(() => { loginInProgress = null; });
    await loginInProgress;
  }

  let text = await query(url);

  // Session expired — re-login once and retry
  if (!text.includes("var categories")) {
    if (!loginInProgress) loginInProgress = login().finally(() => { loginInProgress = null; });
    await loginInProgress;
    text = await query(url);
    if (!text.includes("var categories")) throw new Error("unexpected page structure");
  }

  const names = [...text.matchAll(/'name':\s*'([^']+)'/g)].map(m => m[1].replace(/-/g, " "));
  const category  = names.join(", ") || "Unknown";
  const isBlocked = names.some(n => blockedCats.has(n.replace(/ /g, "-")));
  return { category, blocked: isBlocked };
}
