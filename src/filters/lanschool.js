import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const catJson = JSON.parse(readFileSync(join(__dirname, "json/lanschool.json"), "utf8"));

// Categories LanSchool typically blocks in a school policy
const BLOCKED_CATS = new Set([
  "Games", "Social Networking", "Social Media", "Streaming Media", "Video Streaming",
  "Music Streaming", "Adult Content", "Pornography", "Gambling", "Proxy/Anonymizer",
  "Weapons", "Violence", "Drug Abuse", "Hate/Discrimination", "Illegal Activities",
  "Phishing", "Malware", "Spyware", "Peer-to-Peer", "Instant Messaging",
  "Shopping", "Auctions", "Dating", "Personals",
]);

export async function lanschool(url) {
  const domain = url.replace(/^https?:\/\//, "").split("/")[0];
  const encoded = btoa(`001 https://${domain} - - - - 3372822944`);
  const res = await fetch(`https://filter.coopacademiescloud.netsweeper.com:3431/${encoded}`);
  const text = await res.text();
  if (text.startsWith("ALLOW")) {
    // Parse the category from the ALLOW response if present
    const catId = text.includes("&cat=") ? text.split("&cat=")[1].split("&")[0] : null;
    const category = catId ? (catJson[catId] ?? "Allowed") : "Allowed";
    return { category, blocked: false };
  }
  const catId = text.split("&cat=")[1]?.split("&")[0];
  const category = catId ? (catJson[catId] ?? "Blocked") : "Blocked";
  // If the server didn't ALLOW it, it's blocked — BLOCKED_CATS is used only to name the category
  return { category, blocked: true };
}
