"use strict";

const form             = document.getElementById("sj-form");
const address          = document.getElementById("sj-address");
const searchEngineInput= document.getElementById("sj-search-engine");
const errorContainer   = document.getElementById("error-container");
const errorEl          = document.getElementById("sj-error");
const errorCodeEl      = document.getElementById("sj-error-code");
const submitBtn        = document.getElementById("sj-submit-btn");
const btnLabel         = document.getElementById("sj-btn-label");
const btnSpinner       = document.getElementById("sj-btn-spinner");
const frameContainer   = document.getElementById("sj-frame-container");
const frameArea        = document.getElementById("tab-frame-area");
const urlBar           = document.getElementById("sj-url-bar");
const loadBar          = document.getElementById("sj-load-bar");
const btnBack          = document.getElementById("btn-back");
const btnForward       = document.getElementById("btn-forward");
const btnReload        = document.getElementById("btn-reload");
const btnHome          = document.getElementById("btn-home");

// Keep search engine hidden input in sync with radio chips
document.querySelectorAll("input[name='engine']").forEach((radio) => {
  radio.addEventListener("change", () => {
    searchEngineInput.value = radio.value;
  });
});

// ── Tab state ─────────────────────────────────────────────────────────────
// Each tab: { id, frame: ScramjetFrame, url, title, lastUrl }
const tabs  = [];
let tabIdx  = -1;
let _nextId = 1;

function activeTab() { return tabs[tabIdx] ?? null; }

// Expose API for tabs.js
window._veilGetTabs        = () => tabs;
window._veilGetActiveTabId = () => activeTab()?.id;
window._veilSwitchTab = (id) => {
  const i = tabs.findIndex(t => t.id === id);
  if (i >= 0) setActiveTab(i);
};
window._veilCloseTab  = closeTab;
window._veilCreateTab = () => {}; // no-op until scramjet is initialized

// ── Scramjet / transport state ─────────────────────────────────────────────
let scramjet   = null;
let connection = null;
let _swOk      = null;

// ── Per-tab helpers ────────────────────────────────────────────────────────
function getProxiedUrlFrom(tab) {
  try {
    const href = tab.frame.frame.contentWindow.location.href;
    const base = location.origin + "/scramjet/";
    if (href.startsWith(base)) return decodeURIComponent(href.slice(base.length));
  } catch {}
  return "";
}

function getDocTitleFrom(tab) {
  try { return tab.frame.frame.contentDocument?.title || ""; } catch { return ""; }
}

// ── Compat wrappers used by existing callsites ─────────────────────────────
function getProxiedUrl() { return getProxiedUrlFrom(activeTab() ?? {}); }

function syncTitle() {
  const tab = activeTab();
  if (!tab) return;
  try {
    const s = JSON.parse(localStorage.getItem("veil_settings_v1") || "{}");
    if (s.cloak && s.cloak !== "none") return;
    const t = getDocTitleFrom(tab);
    document.title = t ? `${t} — Veil` : "Veil";
  } catch {
    const s = JSON.parse(localStorage.getItem("veil_settings_v1") || "{}");
    if (s.cloak && s.cloak !== "none") return;
    document.title = "Veil";
  }
}

// ── Tab management ─────────────────────────────────────────────────────────
function createTab(url) {
  const frame = scramjet.createFrame();
  const id    = _nextId++;
  const tab   = { id, frame, url: url || "", title: "New Tab", lastUrl: url || "" };

  frame.frame.className = "sj-tab-frame";

  frame.frame.addEventListener("load", () => {
    const proxied = getProxiedUrlFrom(tab);
    if (proxied) { tab.url = proxied; tab.lastUrl = proxied; }
    const docTitle = getDocTitleFrom(tab);
    if (docTitle) tab.title = docTitle;

    if (tab === activeTab()) {
      if (proxied) { urlBar.value = proxied; _lastUrl = proxied; }
      finishLoadBar();
      syncTitle();
    }
    window._veilRefreshTabBar?.();
  });

  frameArea.appendChild(frame.frame);
  tabs.push(tab);
  setActiveTab(tabs.length - 1);

  frameContainer.style.display = "flex";

  if (url) {
    urlBar.value = url;
    _lastUrl     = url;
    startLoadBar();
    frame.go(url);
  } else {
    urlBar.value = "";
    urlBar.focus();
    urlBar.select();
  }

  return tab;
}

function setActiveTab(idx) {
  tabIdx = idx;
  for (let i = 0; i < tabs.length; i++) {
    tabs[i].frame.frame.classList.toggle("sj-tab-active", i === idx);
  }
  const tab = tabs[idx];
  if (tab) {
    urlBar.value = tab.url;
    _lastUrl     = tab.url;
  }
  window._veilRefreshTabBar?.();
}

function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  frameArea.removeChild(tabs[idx].frame.frame);
  tabs.splice(idx, 1);
  if (tabs.length === 0) {
    frameContainer.style.display = "none";
    document.title = "Veil";
    tabIdx = -1;
  } else {
    setActiveTab(Math.min(idx, tabs.length - 1));
  }
  window._veilRefreshTabBar?.();
}

// ── Error / loading ────────────────────────────────────────────────────────
function showError(msg, detail) {
  errorEl.textContent      = msg;
  errorCodeEl.textContent  = detail || "";
  errorContainer.style.display = "block";
}
function clearError() { errorContainer.style.display = "none"; }
function setLoading(on) {
  submitBtn.disabled      = on;
  btnLabel.style.display  = on ? "none" : "";
  btnSpinner.style.display = on ? "" : "none";
}
function startLoadBar() {
  loadBar.className = "";
  loadBar.offsetWidth; // force reflow
  loadBar.className = "loading";
}
function finishLoadBar() {
  loadBar.className = "done";
  setTimeout(() => { loadBar.className = ""; }, 400);
}

window.addEventListener("error", (e) => {
  showError("Script error: " + e.message, e.filename + ":" + e.lineno);
});

// ── URL poll ───────────────────────────────────────────────────────────────
let _lastUrl = "";
setInterval(() => {
  const tab = activeTab();
  if (!tab || frameContainer.style.display === "none") return;
  const url = getProxiedUrlFrom(tab);
  if (url && url !== tab.lastUrl) {
    tab.url     = url;
    tab.lastUrl = url;
    _lastUrl    = url;
    urlBar.value = url;
  }
  const title = getDocTitleFrom(tab);
  if (title && title !== tab.title) {
    tab.title = title;
    window._veilRefreshTabBar?.();
  }
  syncTitle();
}, 600);

// ── SW init ────────────────────────────────────────────────────────────────
const _swBC = new BroadcastChannel("_sw_init");
_swBC.onmessage = (e) => {
  _swOk = e.data.ok ? true : (e.data.message + "\n\n" + e.data.stack);
};

function waitForSWInit() {
  if (_swOk !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const prev = _swBC.onmessage;
    const t = setTimeout(() => { _swBC.onmessage = prev; resolve(); }, 1500);
    _swBC.onmessage = (e) => {
      clearTimeout(t);
      _swOk = e.data.ok ? true : (e.data.message + "\n\n" + e.data.stack);
      _swBC.onmessage = prev;
      resolve();
    };
  });
}

// ── Toolbar button wiring ──────────────────────────────────────────────────
btnBack.addEventListener("click", () => {
  try { activeTab()?.frame.frame.contentWindow.history.back(); } catch {}
});
btnForward.addEventListener("click", () => {
  try { activeTab()?.frame.frame.contentWindow.history.forward(); } catch {}
});
btnReload.addEventListener("click", () => {
  try { activeTab()?.frame.frame.contentWindow.location.reload(); } catch {}
  startLoadBar();
});
btnHome.addEventListener("click", () => {
  frameContainer.style.display = "none";
  document.title = "Veil";
});

urlBar.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const target = search(urlBar.value, searchEngineInput.value);
  urlBar.value = target;
  _lastUrl     = target;
  const tab = activeTab();
  if (tab) {
    tab.url     = target;
    tab.lastUrl = target;
    startLoadBar();
    tab.frame.go(target);
  }
  urlBar.blur();
});

urlBar.addEventListener("focus", () => urlBar.select());

// ── Form submit (home search bar) ──────────────────────────────────────────
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();
  setLoading(true);

  // ── Init scramjet (once) ─────────────────────────────────────────────────
  try {
    if (!scramjet) {
      const { ScramjetController } = $scramjetLoadController();
      scramjet = new ScramjetController({
        files: {
          wasm: "/scramjet/scramjet.wasm.wasm",
          all:  "/scramjet/scramjet.all.js",
          sync: "/scramjet/scramjet.sync.js",
        },
      });
    }

    try {
      await scramjet.init();
    } catch (err) {
      if (err.name !== "NotFoundError") throw err;
      console.warn("[scramjet] stale IDB detected, clearing and retrying");
      await new Promise((res) => {
        const r = indexedDB.deleteDatabase("$scramjet");
        r.onsuccess = r.onerror = r.onblocked = res;
      });
      const { ScramjetController } = $scramjetLoadController();
      scramjet = new ScramjetController({
        files: {
          wasm: "/scramjet/scramjet.wasm.wasm",
          all:  "/scramjet/scramjet.all.js",
          sync: "/scramjet/scramjet.sync.js",
        },
      });
      await scramjet.init();
    }

    // Expose createTab now that scramjet is ready
    window._veilCreateTab = createTab;
  } catch (err) {
    showError("Failed to initialize scramjet.", err.message || String(err));
    console.error(err);
    setLoading(false);
    return;
  }

  const swAlreadyActive = !!navigator.serviceWorker.controller;
  try {
    await registerSW();
  } catch (err) {
    showError("Failed to register service worker.", err.toString());
    setLoading(false);
    return;
  }

  if (!swAlreadyActive) {
    await waitForSWInit();
    if (_swOk !== true) {
      showError(
        "Service worker failed to initialize.",
        typeof _swOk === "string" ? _swOk : "No status received from SW."
      );
      setLoading(false);
      return;
    }
  }

  try {
    if (!connection) {
      connection = new BareMux.BareMuxConnection("/baremux/worker.js");
    }
    if ((await connection.getTransport()) !== "/bare-as-module3/index.mjs") {
      await connection.setTransport("/bare-as-module3/index.mjs", [
        location.origin + "/bare/",
      ]);
    }
  } catch (err) {
    showError("Failed to initialize transport.", err.message || String(err));
    setLoading(false);
    return;
  }

  try {
    const url = search(address.value, searchEngineInput.value);

    if (tabs.length > 0) {
      // Navigate in the current active tab
      const tab = activeTab();
      tab.url     = url;
      tab.lastUrl = url;
      urlBar.value = url;
      _lastUrl     = url;
      startLoadBar();
      frameContainer.style.display = "flex";
      tab.frame.go(url);
    } else {
      // First navigation — create initial tab
      createTab(url);
    }
  } catch (err) {
    showError("Failed to load page.", err.message || String(err));
    console.error(err);
  } finally {
    setLoading(false);
  }
});
