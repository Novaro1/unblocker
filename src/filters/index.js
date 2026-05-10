/**
 * Veil Filter Checker
 * Unified interface for all school content filters.
 * Returns { filter, name, category, blocked, error, responseTime } per filter.
 */

import { goguardian }               from "./goguardian.js";
import { lightspeed }               from "./lightspeed.js";
import { linewize }                 from "./linewize.js";
import { iboss }                    from "./iboss.js";
import { cisco }                    from "./cisco.js";
import { fortiguard }               from "./fortiguard.js";
import { blocksiAI, blocksiWeb }    from "./blocksi.js";
import { senso }                    from "./senso.js";
import { paloalto }                 from "./paloalto.js";
import { contentkeeper }            from "./contentkeeper.js";
import { lanschool }                from "./lanschool.js";
import { deledao }                  from "./deledao.js";
import { securly }                  from "./securly.js";
import { aristotle }                from "./aristotle.js";

// All filters with display names and timeout (ms)
const FILTERS = [
  { id: "goguardian",    name: "GoGuardian",    fn: goguardian,    timeout: 10000 },
  { id: "lightspeed",    name: "Lightspeed",    fn: lightspeed,    timeout: 10000 },
  { id: "securly",       name: "Securly",       fn: securly,       timeout: 10000 },
  { id: "cisco",         name: "Cisco Umbrella",fn: cisco,         timeout: 10000 },
  { id: "iboss",         name: "iBoss",         fn: iboss,         timeout: 8000  },
  { id: "fortiguard",    name: "FortiGuard",    fn: fortiguard,    timeout: 8000  },
  { id: "linewize",      name: "Linewize",      fn: linewize,      timeout: 8000  },
  { id: "blocksiai",     name: "Blocksi AI",    fn: blocksiAI,     timeout: 10000 },
  { id: "blocksiweb",    name: "Blocksi Web",   fn: blocksiWeb,    timeout: 8000  },
  { id: "senso",         name: "Senso Cloud",   fn: senso,         timeout: 8000  },
  { id: "paloalto",      name: "Palo Alto",     fn: paloalto,      timeout: 10000 },
  { id: "contentkeeper", name: "ContentKeeper", fn: contentkeeper, timeout: 10000 },
  { id: "lanschool",     name: "LanSchool",     fn: lanschool,     timeout: 10000 },
  { id: "deledao",       name: "Deledao",       fn: deledao,       timeout: 10000 },
  { id: "aristotle",     name: "AristotleK12",  fn: aristotle,     timeout: 10000 },
];

// In-memory cache: domain -> { results, checkedAt }
const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

function normalizeDomain(input) {
  try {
    return new URL(input.startsWith("http") ? input : "https://" + input).hostname;
  } catch {
    return input.replace(/^https?:\/\//, "").split("/")[0];
  }
}

/**
 * Check a domain against all filters.
 * @param {string} domain - hostname or full URL
 * @param {string[]} [only] - optional array of filter IDs to run (defaults to all)
 * @returns {{ domain, results, checkedAt, cached }}
 */
export async function checkDomain(domain, only) {
  const normalizedDomain = normalizeDomain(domain);
  const cacheKey = normalizedDomain + (only ? ":" + only.sort().join(",") : "");

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.checkedAt < CACHE_TTL) {
    return { domain: normalizedDomain, results: cached.results, checkedAt: cached.checkedAt, cached: true };
  }

  const filters = only ? FILTERS.filter(f => only.includes(f.id)) : FILTERS;

  const results = await Promise.all(
    filters.map(async ({ id, name, fn, timeout }) => {
      const start = Date.now();
      try {
        const result = await withTimeout(fn(normalizedDomain), timeout);
        return {
          filter: id,
          name,
          category: result.category ?? "Unknown",
          blocked: result.blocked ?? true,
          error: false,
          responseTime: Date.now() - start,
        };
      } catch (err) {
        return {
          filter: id,
          name,
          category: `Error: ${err.message ?? "unknown"}`,
          blocked: null,
          error: true,
          responseTime: Date.now() - start,
        };
      }
    })
  );

  const checkedAt = Date.now();
  cache.set(cacheKey, { results, checkedAt });

  return { domain: normalizedDomain, results, checkedAt, cached: false };
}

export { FILTERS };
