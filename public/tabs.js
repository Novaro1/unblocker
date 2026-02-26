"use strict";

// ── Tab Bar ────────────────────────────────────────────────────────────────
// Renders the tab strip and wires the + / × buttons.
// Communicates with index.js via window._veil* globals.
(function () {
  const bar = document.getElementById("tab-bar");
  if (!bar) return;

  function faviconUrl(url) {
    try {
      const domain = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=16`;
    } catch { return ""; }
  }

  function displayTitle(tab) {
    if (tab.title && tab.title !== "New Tab") return tab.title;
    if (tab.url) {
      try { return new URL(tab.url).hostname; } catch {}
    }
    return "New Tab";
  }

  function renderTabBar() {
    const tabs     = window._veilGetTabs?.()        || [];
    const activeId = window._veilGetActiveTabId?.() ?? -1;
    const newBtn   = document.getElementById("btn-new-tab");

    // Remove existing chips (keep the + button)
    bar.querySelectorAll(".tab-chip").forEach(el => el.remove());

    for (const tab of tabs) {
      const chip = document.createElement("div");
      chip.className = "tab-chip" + (tab.id === activeId ? " tab-active" : "");
      chip.title = tab.url || "New Tab";

      // Favicon
      if (tab.url) {
        const img = document.createElement("img");
        img.className = "tab-favicon";
        img.src       = faviconUrl(tab.url);
        img.alt       = "";
        img.addEventListener("error", () => { img.style.display = "none"; });
        chip.appendChild(img);
      }

      // Title
      const titleEl = document.createElement("span");
      titleEl.className   = "tab-title";
      titleEl.textContent = displayTitle(tab);
      chip.appendChild(titleEl);

      // Close button
      const closeBtn = document.createElement("button");
      closeBtn.className   = "tab-close";
      closeBtn.title       = "Close tab";
      closeBtn.textContent = "×";
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        window._veilCloseTab?.(tab.id);
      });
      chip.appendChild(closeBtn);

      chip.addEventListener("click", () => window._veilSwitchTab?.(tab.id));

      bar.insertBefore(chip, newBtn);
    }

    // Scroll active tab into view
    bar.querySelector(".tab-chip.tab-active")?.scrollIntoView({
      behavior: "instant",
      inline:   "nearest",
    });
  }

  // Called by index.js whenever tab state changes
  window._veilRefreshTabBar = renderTabBar;

  // New tab button
  document.getElementById("btn-new-tab")?.addEventListener("click", () => {
    window._veilCreateTab?.("");
  });
})();
