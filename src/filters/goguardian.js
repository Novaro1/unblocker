import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cats = JSON.parse(readFileSync(join(__dirname, "json/goguardian.json"), "utf8"));

// The licenseTag is the GoGuardian License extension ID (deployed by the school admin).
// This one corresponds to the "GoGuardian License" extension (jjmjlpijaakeocnopljpgmfgjmkcdgaa).
// Sign-in returns an anonymous session token valid for ~24h.
const LICENSE_TAG = "jjmjlpijaakeocnopljpgmfgjmkcdgaa";
const EXT_VERSION = "4.1.229";

let cachedToken = null;
let tokenExpiresAt = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken;

  const res = await fetch("https://prod-ext-gateway.goguardian.com/v1/auth/sign-in", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Extension-Version": EXT_VERSION,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    },
    body: JSON.stringify({
      licenseTag: LICENSE_TAG,
      deviceIdType: "SelfGenerated",
      deviceId: randomUUID(),
    }),
  });

  if (!res.ok) throw new Error(`GoGuardian sign-in failed: HTTP ${res.status}`);
  const data = await res.json();
  if (!data.authToken) throw new Error("GoGuardian sign-in: no authToken in response");

  cachedToken = data.authToken;
  tokenExpiresAt = new Date(data.session?.expiresAt ?? 0).getTime() || (Date.now() + 23 * 60 * 60 * 1000);
  return cachedToken;
}

export async function goguardian(url) {
  const token = await getToken();

  const cleanUrl = url.replace(/^https?:\/\//, "").split("?")[0].split("#")[0];

  const res = await fetch("https://panther.goguardian.com/api/v2/categories", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "extension-version": EXT_VERSION,
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      "content-type": "text/plain;charset=UTF-8",
      accept: "*/*",
      origin: "chrome-extension://haldlgldplgnggkjaafhelgiaglafanh",
    },
    body: JSON.stringify({ cleanUrl, rawUrl: url }),
  });

  if (!res.ok) {
    // Token may have expired mid-use; clear cache so next call re-auths
    if (res.status === 401) { cachedToken = null; tokenExpiresAt = 0; }
    throw new Error(`GoGuardian categories failed: HTTP ${res.status}`);
  }

  const apiResponse = await res.json();
  const catIds = Array.isArray(apiResponse.cats) ? apiResponse.cats : [];
  const pairs = catIds.filter(c => cats[c]).map(c => ({ name: cats[c][0], blocked: cats[c][1] }));
  const category = pairs.map(p => p.name).join(", ") || "Uncategorized";
  const blocked = pairs.length > 0 ? pairs.some(p => p.blocked) : true;
  return { category, blocked };
}
