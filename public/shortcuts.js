"use strict";

// ── Quick Access tiles + Bookmarks + Toolbar extras ────────────────────────
(function () {

  const BM_KEY   = "veil_bookmarks_v1";
  const HIST_KEY = "veil_history_v1";
  const MAX_HIST = 80;

  // Default quick-access sites
  const DEFAULTS = [
    { name: "YouTube", url: "https://www.youtube.com",   abbr: "YT", hue: 0   },
    { name: "Google",  url: "https://www.google.com",    abbr: "G",  hue: 217 },
    { name: "Discord", url: "https://discord.com",       abbr: "DC", hue: 235 },
    { name: "Reddit",  url: "https://www.reddit.com",    abbr: "Re", hue: 18  },
    { name: "GitHub",  url: "https://github.com",        abbr: "GH", hue: 265 },
    { name: "X",       url: "https://x.com",             abbr: "X",  hue: 200 },
  ];

  // ── localStorage helpers ──────────────────────────────────────────────────
  function getBookmarks() {
    try { return JSON.parse(localStorage.getItem(BM_KEY) || "[]"); }
    catch { return []; }
  }

  function saveBookmarks(bms) {
    localStorage.setItem(BM_KEY, JSON.stringify(bms));
  }

  function isBookmarked(url) {
    return getBookmarks().some(b => b.url === url);
  }

  function addBookmark(item) {
    const bms = getBookmarks();
    if (!bms.some(b => b.url === item.url)) {
      bms.unshift(item);
      saveBookmarks(bms);
    }
  }

  function removeBookmark(url) {
    saveBookmarks(getBookmarks().filter(b => b.url !== url));
  }

  function pushHistory(url, title) {
    try {
      // Respect the saveHistory setting from settings.js
      const settings = JSON.parse(localStorage.getItem("veil_settings_v1") || "{}");
      if (settings.saveHistory === false) return;

      // If a cloak is active, document.title is the cloak name — don't save it
      const effectiveTitle = (settings.cloak && settings.cloak !== "none") ? null : title;

      const hist = JSON.parse(localStorage.getItem(HIST_KEY) || "[]");
      const filtered = hist.filter(h => h.url !== url);
      filtered.unshift({ url, title: effectiveTitle || url, ts: Date.now() });
      localStorage.setItem(HIST_KEY, JSON.stringify(filtered.slice(0, MAX_HIST)));
    } catch { /* ignore */ }
  }

  // ── Navigation helper ─────────────────────────────────────────────────────
  function navigateTo(url) {
    const input = document.getElementById("sj-address");
    const form  = document.getElementById("sj-form");
    if (!input || !form) return;
    input.value = url;
    form.requestSubmit();
  }

  // ── Derive a display name + icon for any URL ──────────────────────────────
  function infoFromUrl(url) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, "");
      const name = host.split(".")[0];
      const abbr = name.slice(0, 2).toUpperCase();
      const hue  = [...host].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
      return { name, abbr, hue, url };
    } catch {
      return { name: url, abbr: "?", hue: 180, url };
    }
  }

  // ── Build a single tile element ───────────────────────────────────────────
  function makeTile(item, canRemove) {
    const tile = document.createElement("div");
    tile.className = "ql-tile";
    tile.title = item.url;

    // Colour-coded letter icon
    const icon = document.createElement("div");
    icon.className = "ql-tile-icon";
    icon.textContent = item.abbr || item.name.slice(0, 2).toUpperCase();
    icon.style.background = `hsla(${item.hue ?? 220}, 65%, 22%, 1)`;
    icon.style.color       = `hsla(${item.hue ?? 220}, 80%, 75%, 1)`;

    const label = document.createElement("div");
    label.className = "ql-tile-name";
    label.textContent = item.name;

    tile.appendChild(icon);
    tile.appendChild(label);

    tile.addEventListener("click", (e) => {
      if (e.target.closest(".ql-tile-remove")) return;
      navigateTo(item.url);
    });

    if (canRemove) {
      const rm = document.createElement("button");
      rm.className = "ql-tile-remove";
      rm.title = "Remove bookmark";
      rm.innerHTML = "&#x2715;"; // ×
      rm.addEventListener("click", (e) => {
        e.stopPropagation();
        removeBookmark(item.url);
        renderGrid();
        updateBookmarkBtn();
      });
      tile.appendChild(rm);
    }

    return tile;
  }

  // ── Render the quick-access grid ──────────────────────────────────────────
  function renderGrid() {
    const grid = document.getElementById("ql-grid");
    if (!grid) return;
    grid.innerHTML = "";

    // Default sites
    for (const item of DEFAULTS) {
      grid.appendChild(makeTile(item, false));
    }

    // User bookmarks (skipping any that duplicate a default)
    const defaultUrls = new Set(DEFAULTS.map(d => d.url));
    for (const bm of getBookmarks()) {
      if (defaultUrls.has(bm.url)) continue;
      grid.appendChild(makeTile(bm, true));
    }
  }

  // ── Toolbar: bookmark button ──────────────────────────────────────────────
  const btnBookmark = document.getElementById("btn-bookmark");

  function updateBookmarkBtn() {
    if (!btnBookmark) return;
    const url = document.getElementById("sj-url-bar")?.value;
    if (!url || url === "") {
      btnBookmark.classList.remove("bookmarked");
      return;
    }
    btnBookmark.classList.toggle("bookmarked", isBookmarked(url));
  }

  if (btnBookmark) {
    btnBookmark.addEventListener("click", () => {
      const urlBar = document.getElementById("sj-url-bar");
      const url = urlBar?.value;
      if (!url) return;

      if (isBookmarked(url)) {
        removeBookmark(url);
        btnBookmark.classList.remove("bookmarked");
      } else {
        const info = infoFromUrl(url);
        addBookmark(info);
        btnBookmark.classList.add("bookmarked");
      }
      renderGrid();
    });
  }

  // ── Toolbar: copy URL ─────────────────────────────────────────────────────
  const btnCopy = document.getElementById("btn-copy-url");

  if (btnCopy) {
    btnCopy.addEventListener("click", () => {
      const url = document.getElementById("sj-url-bar")?.value;
      if (!url) return;
      navigator.clipboard.writeText(url).then(() => {
        btnCopy.classList.add("copied");
        btnCopy.title = "Copied!";
        setTimeout(() => {
          btnCopy.classList.remove("copied");
          btnCopy.title = "Copy URL";
        }, 1600);
      }).catch(() => {/* clipboard blocked */});
    });
  }

  // ── Toolbar: fullscreen ───────────────────────────────────────────────────
  const btnFullscreen  = document.getElementById("btn-fullscreen");
  const frameContainer = document.getElementById("sj-frame-container");

  function setFullscreenIcon(active) {
    if (!btnFullscreen) return;
    const expand   = btnFullscreen.querySelector(".fs-expand");
    const contract = btnFullscreen.querySelector(".fs-contract");
    if (expand)   expand.style.display   = active ? "none"  : "";
    if (contract) contract.style.display = active ? ""      : "none";
    btnFullscreen.classList.toggle("in-fullscreen", active);
    btnFullscreen.title = active ? "Exit fullscreen" : "Fullscreen";
  }

  if (btnFullscreen && frameContainer) {
    btnFullscreen.addEventListener("click", () => {
      if (!document.fullscreenElement) {
        frameContainer.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    });

    document.addEventListener("fullscreenchange", () => {
      setFullscreenIcon(!!document.fullscreenElement);
    });
  }

  // ── Poll URL bar to keep bookmark star and history in sync ────────────────
  let lastPolledUrl = "";
  setInterval(() => {
    const urlBar = document.getElementById("sj-url-bar");
    const url = urlBar?.value;
    if (!url || url === lastPolledUrl) return;
    lastPolledUrl = url;
    updateBookmarkBtn();
    pushHistory(url, document.title);
    window._veilHistoryRefresh?.();
  }, 900);

  // ── Init ──────────────────────────────────────────────────────────────────
  renderGrid();

  // Expose so settings.js can trigger a re-render when bookmarks are cleared
  window._veilRenderGrid = renderGrid;
})();
