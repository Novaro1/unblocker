// Manual cookie jar — avoids needing fetch-cookie / tough-cookie packages
const cookieStore = new Map(); // hostname -> cookie string

async function fetchWithCookies(url, opts = {}) {
  const host = new URL(url).hostname;
  const headers = { ...(opts.headers ?? {}) };
  if (cookieStore.has(host)) headers["cookie"] = cookieStore.get(host);
  const res = await fetch(url, { ...opts, headers });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    // Merge cookies (simple approach — store all key=value pairs)
    const existing = cookieStore.get(host) ?? "";
    const newCookies = setCookie.split(",")
      .map(c => c.split(";")[0].trim())
      .filter(Boolean)
      .join("; ");
    const merged = [existing, newCookies].filter(Boolean).join("; ");
    cookieStore.set(host, merged);
  }
  return res;
}

// Securly status codes returned by the broker endpoint:
//   ALLOW  → site is permitted
//   DENY   → site is blocked
//   SS     → Google/Bing Safe Search enforced (allowed)
//   YT     → YouTube with restrictions (allowed)
//   UNKNOWN_SCHOOL → email domain not registered with Securly
const ALLOWED_STATUSES = new Set(["ALLOW", "SS", "YT"]);

// Category names for the most common Securly category bitmasks (bits 0-37)
const CAT_NAMES = {
  3:  "Adult/Gambling",
  6:  "Social Networking",
  7:  "Social Networking",
  9:  "Social Networking",
  13: "Social Networking",
  16: "Games",
  25: "Video Streaming",
  26: "Entertainment",
  36: "Entertainment",
  37: "Entertainment",
};

function decodeCategoryId(catIdStr) {
  const n = parseInt(catIdStr, 10);
  if (!n || n < 0) return "Unknown";
  // Find the highest set bit and map to a name
  for (let i = 37; i >= 0; i--) {
    if (n & (1 << i)) {
      return CAT_NAMES[i] ?? "Filtered";
    }
  }
  return "Unknown";
}

export async function securly(url) {
  let raw = url.includes("://") ? url.split("://")[1] : url;
  raw = raw.split("?")[0].split("#")[0];
  const encodedUrl = Buffer.from(raw).toString("base64");

  const res1 = await fetchWithCookies(
    `https://uswest-www.securly.com/crextn/broker?useremail=student@lausd.net&chrome=true&reason=crextn&version=-&cu=https://uswest-www.securly.com/crextn&uf=1&cf=1&host=${raw}&url=${encodedUrl}`
  );
  const html1 = await res1.text();
  const parts = html1.trim().split(":");
  const status = parts[0];
  const categoryid = parts[2];

  if (status === "UNKNOWN_SCHOOL") throw new Error("School not registered with Securly");

  const blocked = !ALLOWED_STATUSES.has(status);
  const category = blocked ? decodeCategoryId(categoryid) : "Allowed";
  return { category, blocked };
}
