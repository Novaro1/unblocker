"use strict";

// ── History Panel ──────────────────────────────────────────────────────────
(function () {
  const HIST_KEY = "veil_history_v1";

  function getHistory() {
    try { return JSON.parse(localStorage.getItem(HIST_KEY) || "[]"); }
    catch { return []; }
  }

  function removeEntry(url, ts) {
    const hist = getHistory().filter(h => !(h.url === url && h.ts === ts));
    localStorage.setItem(HIST_KEY, JSON.stringify(hist));
    renderHistory(document.getElementById("history-search")?.value || "");
  }

  function navigateTo(url) {
    const input = document.getElementById("sj-address");
    const form  = document.getElementById("sj-form");
    if (!input || !form) return;
    input.value = url;
    closeHistory();
    form.requestSubmit();
  }

  // ── Formatting helpers ─────────────────────────────────────────────────────
  function relativeTime(ts) {
    const diff = Date.now() - ts;
    const min  = Math.floor(diff / 60000);
    const hr   = Math.floor(diff / 3600000);
    const day  = Math.floor(diff / 86400000);
    if (min < 1)   return "just now";
    if (min < 60)  return `${min}m ago`;
    if (hr  < 24)  return `${hr}h ago`;
    if (day === 1) return "yesterday";
    return `${day}d ago`;
  }

  function dayLabel(ts) {
    const d    = new Date(ts);
    const now  = new Date();
    const yest = new Date(now);
    yest.setDate(now.getDate() - 1);
    if (d.toDateString() === now.toDateString())  return "Today";
    if (d.toDateString() === yest.toDateString()) return "Yesterday";
    return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function renderHistory(filter) {
    const list = document.getElementById("history-list");
    if (!list) return;
    list.innerHTML = "";

    const q        = (filter || "").trim().toLowerCase();
    const all      = getHistory();
    const entries  = q
      ? all.filter(h =>
          h.url.toLowerCase().includes(q) ||
          (h.title || "").toLowerCase().includes(q))
      : all;

    if (entries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "history-empty";
      empty.textContent = q ? `No results for "${filter}"` : "No history yet.";
      list.appendChild(empty);
      return;
    }

    // Group into days
    const groups = new Map();
    for (const entry of entries) {
      const key = dayLabel(entry.ts);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    }

    for (const [day, dayEntries] of groups) {
      const header = document.createElement("div");
      header.className = "history-group-header";
      header.textContent = day;
      list.appendChild(header);

      for (const entry of dayEntries) {
        let domain = "";
        try { domain = new URL(entry.url).hostname.replace(/^www\./, ""); } catch {}

        const row = document.createElement("div");
        row.className = "history-row";
        row.title = entry.url;

        const fav = document.createElement("img");
        fav.className = "history-favicon";
        fav.width  = 16;
        fav.height = 16;
        fav.loading = "lazy";
        fav.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
        fav.onerror = () => { fav.src = ""; fav.style.display = "none"; };

        const info = document.createElement("div");
        info.className = "history-info";

        const title = document.createElement("div");
        title.className = "history-title";
        title.textContent = entry.title && entry.title !== entry.url ? entry.title : domain || entry.url;

        const meta = document.createElement("div");
        meta.className = "history-meta";
        meta.textContent = `${domain} · ${relativeTime(entry.ts)}`;

        info.appendChild(title);
        info.appendChild(meta);

        const rm = document.createElement("button");
        rm.className = "history-remove";
        rm.title = "Remove from history";
        rm.setAttribute("aria-label", "Remove");
        rm.innerHTML = "&#x2715;";
        rm.addEventListener("click", (e) => {
          e.stopPropagation();
          removeEntry(entry.url, entry.ts);
        });

        row.appendChild(fav);
        row.appendChild(info);
        row.appendChild(rm);
        row.addEventListener("click", () => navigateTo(entry.url));

        list.appendChild(row);
      }
    }
  }

  // ── Panel open / close ─────────────────────────────────────────────────────
  const overlay = document.getElementById("history-overlay");
  const panel   = document.getElementById("history-panel");

  function openHistory() {
    if (!overlay || !panel) return;
    window._veilCloseSettings?.(); // close settings if open
    overlay.classList.add("active");
    panel.classList.add("active");
    overlay.setAttribute("aria-hidden", "false");
    panel.setAttribute("aria-hidden", "false");
    const search = document.getElementById("history-search");
    if (search) { search.value = ""; }
    renderHistory("");
    // Focus search after transition
    setTimeout(() => document.getElementById("history-search")?.focus(), 280);
  }

  function closeHistory() {
    if (!overlay || !panel) return;
    overlay.classList.remove("active");
    panel.classList.remove("active");
    overlay.setAttribute("aria-hidden", "true");
    panel.setAttribute("aria-hidden", "true");
  }

  window._veilCloseHistory = closeHistory;

  // Open triggers
  document.getElementById("btn-history")?.addEventListener("click", openHistory);
  document.getElementById("btn-history-home")?.addEventListener("click", openHistory);

  // Close triggers
  document.getElementById("history-close")?.addEventListener("click", closeHistory);
  overlay?.addEventListener("click", closeHistory);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel?.classList.contains("active")) closeHistory();
  });

  // Live search
  document.getElementById("history-search")?.addEventListener("input", function () {
    renderHistory(this.value);
  });

  // Clear all
  document.getElementById("history-clear-all")?.addEventListener("click", function () {
    localStorage.removeItem(HIST_KEY);
    renderHistory(document.getElementById("history-search")?.value || "");
    this.textContent = "Cleared!";
    setTimeout(() => { this.textContent = "Clear All History"; }, 1500);
  });

  // Refresh the visible panel when shortcuts.js pushes a new entry
  window._veilHistoryRefresh = () => {
    if (panel?.classList.contains("active")) {
      renderHistory(document.getElementById("history-search")?.value || "");
    }
  };
})();
