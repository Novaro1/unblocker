"use strict";

// ── Blooket Hacks ────────────────────────────────────────────────────────────
// Scripts sourced from https://github.com/Moonboy05/BlooketHacks by Moonboy05
(function () {

  const RAW          = "https://raw.githubusercontent.com/Moonboy05/BlooketHacks/main/";
  const COLLAPSE_KEY = "veil_blooket_collapsed";

  const HACKS = [
    // ── Global ────────────────────────────────────────────────────────────────
    { cat: "Global",         name: "Auto Answer",           file: "Global/Auto Answer",                       emoji: "🤖" },
    { cat: "Global",         name: "Add Tokens & XP",       file: "Global/Add Tokens and Xp",                 emoji: "💰" },
    { cat: "Global",         name: "Unlock All Blooks",      file: "Global/Unlock All Blooks In a Game",       emoji: "🔓" },
    { cat: "Global",         name: "Spam Open Boxes",        file: "Global/Spam Open Boxes",                   emoji: "📦" },
    { cat: "Global",         name: "Sell Duplicates",        file: "Global/Sell Duplicate Blooks",             emoji: "💸" },
    { cat: "Global",         name: "Flood Games",            file: "Global/Flood Games",                       emoji: "🌊" },
    { cat: "Global",         name: "Change Token",           file: "Global/Change Token",                      emoji: "🪙" },
    { cat: "Global",         name: "Bypass Random Names",    file: "Global/Bypass Random Names",               emoji: "👤" },
    { cat: "Global",         name: "Spoof All Blooks",       file: "Global/Spoof All Blooks on blooks page",   emoji: "🎭" },
    { cat: "Global",         name: "Spoof + Market Box",     file: "Global/Spoof Blooks + Market Box",         emoji: "🛒" },
    { cat: "Global",         name: "Blook Info",             file: "Global/Blook Info on Blooks Tab",          emoji: "ℹ️" },
    // ── Cafe ──────────────────────────────────────────────────────────────────
    { cat: "Cafe",           name: "End Game",               file: "Cafe/End Cafe Game",                       emoji: "🏁" },
    { cat: "Cafe",           name: "Infinite Food Level",    file: "Cafe/infinite food level",                 emoji: "🍔" },
    { cat: "Cafe",           name: "Stock Infinite Food",    file: "Cafe/Stock Infinite Food Cafe",            emoji: "🍱" },
    { cat: "Cafe",           name: "Get Coins",              file: "Cafe/get coins cafe",                      emoji: "🪙" },
    // ── Crypto Hack ───────────────────────────────────────────────────────────
    { cat: "Crypto Hack",    name: "Get Crypto",             file: "Crypto Hack/Get Crypto",                   emoji: "₿"  },
    { cat: "Crypto Hack",    name: "Passwords Always Right", file: "Crypto Hack/Passwords Always Right",       emoji: "✅" },
    // ── Factory ───────────────────────────────────────────────────────────────
    { cat: "Factory",        name: "Always Get Mega Bot",    file: "Factory/Always Get Mega Bot",              emoji: "🤖" },
    { cat: "Factory",        name: "Set Cash",               file: "Factory/Set Factory Cash",                 emoji: "💵" },
    // ── Fishing Frenzy ────────────────────────────────────────────────────────
    { cat: "Fishing Frenzy", name: "Set Weight",             file: "Fishing Frenzy/Set Weight Fishing Frenzy", emoji: "🎣" },
    // ── Gold Quest ────────────────────────────────────────────────────────────
    { cat: "Gold Quest",     name: "Add Gold",               file: "Gold Quest/Add Gold",                      emoji: "🥇" },
    { cat: "Gold Quest",     name: "Chest ESP",              file: "Gold Quest/Chest Esp",                     emoji: "👁️" },
    // ── Racing ────────────────────────────────────────────────────────────────
    { cat: "Racing",         name: "Instant Win",            file: "Racing/Racing Instant Win",                emoji: "🏎️" },
    // ── Tower Defense ─────────────────────────────────────────────────────────
    { cat: "Tower Defense",  name: "Add Tokens",             file: "Tower Defense/Add Tokens Tower Defense",   emoji: "🏰" },
    { cat: "Tower Defense",  name: "Change Round",           file: "Tower Defense/Change Tower Defense Round", emoji: "⏭️" },
  ];

  // ── Get active Scramjet iframe ────────────────────────────────────────────
  function getActiveFrame() {
    const tabs = window._veilGetTabs?.() || [];
    const id   = window._veilGetActiveTabId?.();
    if (id == null) return null;
    return tabs.find(t => t.id === id)?.frame?.frame ?? null;
  }

  // ── Fetch + inject hack ───────────────────────────────────────────────────
  async function runHack(hack, btn) {
    const frame = getActiveFrame();
    if (!frame) {
      alert("Open Blooket in a tab first, then click Run.");
      return;
    }

    const orig    = btn.textContent;
    btn.disabled  = true;
    btn.textContent = "…";

    try {
      // Encode each path segment individually so spaces → %20 but / stays /
      const path = hack.file.split("/").map(encodeURIComponent).join("/");
      const res  = await fetch(RAW + path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const code = await res.text();
      frame.contentWindow.eval(code);
      btn.textContent  = "✓";
      btn.style.color  = "#4ade80";
    } catch (err) {
      console.error("[Blooket hack]", err);
      btn.textContent  = "✗";
      btn.style.color  = "var(--danger)";
    }

    setTimeout(() => {
      btn.textContent = orig;
      btn.style.color = "";
      btn.disabled    = false;
    }, 2000);
  }

  // ── Render tiles grouped by category ─────────────────────────────────────
  function render() {
    const grid = document.getElementById("bh-grid");
    if (!grid) return;
    grid.innerHTML = "";

    const categories = [...new Set(HACKS.map(h => h.cat))];

    for (const cat of categories) {
      const catEl = document.createElement("div");
      catEl.className   = "bh-category";
      catEl.textContent = cat;
      grid.appendChild(catEl);

      const row = document.createElement("div");
      row.className = "bh-row";

      for (const hack of HACKS.filter(h => h.cat === cat)) {
        const tile = document.createElement("div");
        tile.className = "bh-tile";

        const emoji = document.createElement("span");
        emoji.className   = "bh-emoji";
        emoji.textContent = hack.emoji;

        const name = document.createElement("span");
        name.className   = "bh-name";
        name.textContent = hack.name;

        const btn = document.createElement("button");
        btn.className   = "bh-run-btn";
        btn.textContent = "Run";
        btn.addEventListener("click", () => runHack(hack, btn));

        tile.appendChild(emoji);
        tile.appendChild(name);
        tile.appendChild(btn);
        row.appendChild(tile);
      }

      grid.appendChild(row);
    }
  }

  // ── Collapse toggle ───────────────────────────────────────────────────────
  function setCollapsed(on) {
    const grid   = document.getElementById("bh-grid");
    const toggle = document.getElementById("bh-toggle");
    if (!grid || !toggle) return;
    grid.classList.toggle("collapsed", on);
    toggle.classList.toggle("collapsed", on);
    toggle.title = on ? "Expand hacks" : "Collapse hacks";
    localStorage.setItem(COLLAPSE_KEY, on ? "1" : "0");
  }

  document.getElementById("bh-toggle")?.addEventListener("click", () => {
    setCollapsed(!document.getElementById("bh-grid").classList.contains("collapsed"));
  });

  // ── Init ─────────────────────────────────────────────────────────────────
  render();
  setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");

})();
