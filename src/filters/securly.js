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

export async function securly(url) {
  let raw = url.includes("://") ? url.split("://")[1] : url;
  raw = raw.split("?")[0].split("#")[0];
  const encodedUrl = Buffer.from(raw).toString("base64");

  const res1 = await fetchWithCookies(
    `https://uswest-www.securly.com/crextn/broker?useremail=admin@edison.k12.ca.us&chrome=true&reason=crextn&version=-&cu=https://uswest-www.securly.com/crextn&uf=1&cf=1&host=${raw}&url=${encodedUrl}`
  );
  const html1 = await res1.text();
  const [status, policyid, categoryid] = html1.trim().split(":");

  const res2 = await fetchWithCookies(
    `https://www.securly.com/blocked?useremail=admin@edison.k12.ca.us&chrome=true&reason=globalblacklist&keyword=&extension_id=kfiocjonplkilcjfgabfngiddebalkod&extension_version=3.0.21&categoryid=${categoryid}&policyid=${policyid}&url=${encodedUrl}`
  );
  const html2 = await res2.text();
  const category = html2.split(`params['categories'] = "`)[1]?.split(`"`)[0] ?? "Unknown";
  return { category, blocked: status?.replace(/\n/g, "").trim() !== "ALLOW" };
}
