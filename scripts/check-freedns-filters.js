#!/usr/bin/env node
// Batch-checks FreeDNS domains against the Veil Filter API.
// Pre-filters to domains that sound educational/neutral to reduce API calls.
// Usage: node scripts/check-freedns-filters.js [max-checks]

import "dotenv/config";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const VEIL_API_URL = process.env.VEIL_API_URL || "https://secure.brightpathlearning.website";
const BOT_KEY_FILE = join(__dirname, "../bot-internal-key.txt");
const VEIL_API_KEY = process.env.VEIL_API_KEY ||
  (existsSync(BOT_KEY_FILE) ? readFileSync(BOT_KEY_FILE, "utf-8").trim() : "");

if (!VEIL_API_KEY) {
  console.error("No API key found. Set VEIL_API_KEY env var or ensure bot-internal-key.txt exists.");
  process.exit(1);
}

const DELAY_MS = 300; // our API has no strict rate limit but be polite
const MAX_CHECKS = parseInt(process.argv[2] || "80", 10);

const GOOD_KEYWORDS = [
  "learn", "study", "school", "academ", "edu", "class", "course",
  "math", "science", "skill", "tutor", "teach", "knowledge", "quiz",
  "grade", "college", "library", "research", "resource", "tool",
  "guide", "lab", "path", "bright", "quest", "hub", "portal",
  "access", "connect", "online", "digital", "cloud", "space",
  "open", "stream", "media", "content", "link", "view", "direct",
  "smart", "read", "write", "note", "work", "network", "tech",
  "data", "info", "help", "base", "center", "source", "site",
  "web", "net", "pro", "zone", "core", "point", "peak"
];

const BAD_KEYWORDS = [
  "game", "game", "porn", "sex", "adult", "hack", "crack", "proxy",
  "vpn", "pirat", "torrent", "shit", "steal", "drug", "kill", "murder",
  "fuck", "weed", "420", "bet", "casino", "gambl"
];

const allDomains = readFileSync(join(__dirname, "../freedns-domains.txt"), "utf8")
  .split("\n")
  .map(d => d.trim().toLowerCase())
  .filter(d => d && /^[a-z0-9][a-z0-9.-]+\.(com|net|org|info|io|co|us|edu)$/.test(d));

// Score each domain
function score(domain) {
  let s = 0;
  const lower = domain.toLowerCase();
  for (const kw of GOOD_KEYWORDS) if (lower.includes(kw)) s += 2;
  for (const kw of BAD_KEYWORDS) if (lower.includes(kw)) s -= 10;
  // Prefer shorter, cleaner domains
  if (domain.length < 20) s += 2;
  if (domain.length < 14) s += 2;
  if (!domain.includes("-")) s += 1;
  return s;
}

const candidates = allDomains
  .filter(d => score(d) > 0)
  .sort((a, b) => score(b) - score(a))
  .slice(0, MAX_CHECKS);

console.log(`Checking ${candidates.length} pre-filtered domains (of ${allDomains.length} total)...\n`);

const results = [];

for (let i = 0; i < candidates.length; i++) {
  const domain = candidates[i];
  process.stdout.write(`[${i + 1}/${candidates.length}] ${domain} ... `);
  try {
    const res = await fetch(
      `${VEIL_API_URL}/api/v1/check?domain=${encodeURIComponent(domain)}&key=${VEIL_API_KEY}`,
      { signal: AbortSignal.timeout(15000) }
    );
    const data = await res.json();
    if (data.success && data.results) {
      const passed = data.results.filter(r => r && !r.blocked && !r.error);
      const hasGG = passed.some(r => /goguardian/i.test(r.name));
      const hasLS = passed.some(r => /lightspeed/i.test(r.name));
      console.log(`${passed.length} unblocked${hasGG ? " [GG]" : ""}${hasLS ? " [LS]" : ""}`);
      results.push({ domain, count: passed.length, hasGG, hasLS, filters: passed.map(r => r.name) });
    } else {
      console.log("no data");
    }
  } catch (e) {
    console.log(`error: ${e.message}`);
  }
  if (i < candidates.length - 1) await new Promise(r => setTimeout(r, DELAY_MS));
}

// Sort by unblocked count descending
results.sort((a, b) => b.count - a.count);

console.log("\n\n══════════════════════════════════════════");
console.log("  TOP RESULTS — sorted by unblocked filters");
console.log("══════════════════════════════════════════\n");

const top = results.filter(r => r.count > 0).slice(0, 20);
for (const r of top) {
  const tags = [r.hasGG ? "GoGuardian ✓" : "", r.hasLS ? "Lightspeed ✓" : ""].filter(Boolean).join(", ");
  console.log(`${r.domain}`);
  console.log(`  ${r.count} unblocked filters${tags ? " · " + tags : ""}`);
  console.log(`  ${r.filters.join(", ")}`);
  console.log();
}

if (top.length === 0) console.log("No domains passed any filters.");
