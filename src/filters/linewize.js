const BLOCKED_CATS = new Set([
  "animeandmanga","dynamicdns","trackers","celebrities","entertainment",
  "humouranddistractions","livestreaming","media","socialmediaandcommunication",
  "marijuana","crypto","gamestorespublishers","videogames","blocklist.proxies",
  "aitools","blocklist.dating","blocklist.piracy","whatsmyipservices","p2p",
  "unsafesearchengines","porn","extreme","malware","matureandexplicit",
  "gamingresources","offensive",
]);

export async function linewize(url) {
  const domain = url.replace(/^https?:\/\//, "").split("/")[0];
  const res = await fetch(
    "https://mvgateway.syd-1.linewize.net/get/verdict?deviceid=PHYS-SMIC-US-0000-3190&cev=3.3.0&identity=null&requested_website=" + encodeURIComponent(domain)
  );
  const json = await res.json();
  let sub = (json.signatures?.subCategory ?? "").replace(/sphirewall\.(application|category)\./g, "");
  let cat = (json.signatures?.category ?? "").replace(/sphirewall\.(application|category)\./g, "");
  if (!sub) sub = "Not rated";
  const blocked = sub === "Not rated" ? false : (sub.startsWith("blocklist.") || BLOCKED_CATS.has(cat) || BLOCKED_CATS.has(sub));
  return { category: sub || "Not rated", blocked };
}
