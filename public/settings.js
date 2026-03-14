"use strict";

// ── Settings Panel ─────────────────────────────────────────────────────────
(function () {

  const SETTINGS_KEY = "veil_settings_v1";

  function gFavicon(domain) {
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  }

  const CLOAK_PRESETS = {
    none:      { title: "Veil",                        favicon: "/favicon.ico" },
    docs:      { title: "Untitled document",           favicon: gFavicon("docs.google.com") },
    classroom: { title: "Google Classroom",            favicon: gFavicon("classroom.google.com") },
    gmail:     { title: "Inbox (1) - Gmail",           favicon: gFavicon("mail.google.com") },
    desmos:    { title: "Desmos | Graphing Calculator",favicon: gFavicon("desmos.com") },
    khan:      { title: "Khan Academy",                favicon: gFavicon("khanacademy.org") },
    // Ambassador-exclusive cloaks
    youtube:   { title: "YouTube",                     favicon: gFavicon("youtube.com") },
    spotify:   { title: "Spotify - Web Player",        favicon: gFavicon("open.spotify.com") },
    discord:   { title: "Discord",                     favicon: gFavicon("discord.com") },
    roblox:    { title: "Roblox",                      favicon: gFavicon("roblox.com") },
  };

  const BG_GRADIENTS = {
    sunset: "linear-gradient(135deg, #0d0508 0%, #3d1515 25%, #7a2c18 55%, #c95524 80%, #3d1515 100%)",
    cosmos: "linear-gradient(135deg, #050515 0%, #1a0d3d 30%, #2a1858 60%, #140a40 85%, #050515 100%)",
    forest: "linear-gradient(135deg, #030d05 0%, #0a2010 30%, #183818 60%, #0d2810 85%, #030d05 100%)",
    ocean:  "linear-gradient(160deg, #02080d 0%, #051a30 30%, #083050 60%, #051a30 85%, #02080d 100%)",
    dusk:   "linear-gradient(135deg, #0d0820 0%, #2a1848 30%, #522868 60%, #8a3858 80%, #2a1848 100%)",
    // Ambassador-exclusive gradients
    blaze:  "linear-gradient(135deg, #0d0200 0%, #7c1d06 30%, #c2410c 60%, #fb923c 100%)",
    neon:   "linear-gradient(135deg, #001a0d 0%, #065f46 30%, #059669 60%, #06b6d4 100%)",
  };

  const DEFAULTS = {
    cloak:          "none",
    cloakTitle:     "",
    cloakFavicon:   "",
    theme:          "veil",
    bgImage:        "",
    bgGradient:     "",
    fxStars:        true,
    fxAurora:       true,
    fxScanlines:    true,
    fxCursor:       true,
    fxVignette:     true,
    perfMode:       false,
    panicEnabled:   true,
    panicKey:       "alt+x",
    panicUrl:       "https://classroom.google.com",
    saveHistory:    true,
  };

  // ── Persistence ────────────────────────────────────────────────────────────
  function loadSettings() {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}")); }
    catch { return Object.assign({}, DEFAULTS); }
  }

  function saveSettings(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  }

  // Expose for other modules (e.g. shortcuts.js checks saveHistory)
  window._veilSettings = { load: loadSettings };

  // ── Apply ─────────────────────────────────────────────────────────────────
  function applySettings(s) {
    applyCloak(s);

    // Theme
    if (s.theme && s.theme !== "veil") {
      document.documentElement.dataset.theme = s.theme;
    } else {
      delete document.documentElement.dataset.theme;
    }

    // Custom background
    const bgEl = document.getElementById("custom-bg");
    if (bgEl) {
      if (s.bgImage) {
        bgEl.style.background = "";
        bgEl.style.backgroundImage    = `url(${s.bgImage})`;
        bgEl.style.backgroundSize     = "cover";
        bgEl.style.backgroundPosition = "center";
      } else if (s.bgGradient && BG_GRADIENTS[s.bgGradient]) {
        bgEl.style.backgroundImage = "";
        bgEl.style.background      = BG_GRADIENTS[s.bgGradient];
      } else {
        bgEl.style.background      = "";
        bgEl.style.backgroundImage = "";
      }
    }

    const canvas    = document.getElementById("veil-stars");
    const aurora    = document.querySelector(".aurora");
    const cursorGlow= document.getElementById("cursor-glow");

    if (canvas)     canvas.style.visibility    = s.fxStars     ? "" : "hidden";
    if (aurora)     aurora.style.visibility    = s.fxAurora    ? "" : "hidden";
    if (cursorGlow) cursorGlow.style.display   = s.fxCursor    ? "" : "none";
    document.body.classList.toggle("no-scanlines", !s.fxScanlines);
    document.body.classList.toggle("no-vignette",  !s.fxVignette);
    document.body.classList.toggle("perf-mode",    !!s.perfMode);
    window._veilPerfMode = !!s.perfMode;
  }

  function applyCloak(s) {
    const faviconEl = document.querySelector("link[rel='icon']");
    let title = null, favicon = null;

    if (s.cloak === "none") {
      if (faviconEl) faviconEl.href = "/favicon.ico";
    } else if (s.cloak === "custom") {
      if (s.cloakTitle)   { document.title = s.cloakTitle; title = s.cloakTitle; }
      if (faviconEl && s.cloakFavicon) { faviconEl.href = s.cloakFavicon; favicon = s.cloakFavicon; }
    } else {
      const preset = CLOAK_PRESETS[s.cloak];
      if (preset) {
        document.title = preset.title;
        if (faviconEl) faviconEl.href = preset.favicon;
        title = preset.title;
        favicon = preset.favicon;
      }
    }

    // Notify parent about:blank window so it can update its own title/favicon
    if (window.parent !== window) {
      window.parent.postMessage({ type: "veil-cloak", title, favicon }, "*");
    }
  }

  // ── Open / close ──────────────────────────────────────────────────────────
  const overlay  = document.getElementById("settings-overlay");
  const panel    = document.getElementById("settings-panel");

  function openSettings() {
    if (!overlay || !panel) return;
    window._veilCloseHistory?.(); // close history panel if open
    overlay.classList.add("active");
    panel.classList.add("active");
    overlay.setAttribute("aria-hidden", "false");
    panel.setAttribute("aria-hidden", "false");
    populateForm(loadSettings());
    window._veilPanicRefreshUi?.();
    window._veilLoadLeaderboard?.();
    panel.querySelector(".settings-close")?.focus();
  }

  function closeSettings() {
    if (!overlay || !panel) return;
    overlay.classList.remove("active");
    panel.classList.remove("active");
    overlay.setAttribute("aria-hidden", "true");
    panel.setAttribute("aria-hidden", "true");
  }

  window._veilCloseSettings = closeSettings;
  window._veilOpenSettings  = openSettings;

  // Wire all open triggers
  ["btn-settings-home", "btn-settings-toolbar"].forEach(id => {
    document.getElementById(id)?.addEventListener("click", openSettings);
  });

  document.getElementById("btn-settings-close")?.addEventListener("click", closeSettings);
  overlay?.addEventListener("click", closeSettings);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel?.classList.contains("active")) closeSettings();
  });

  // ── Populate form ─────────────────────────────────────────────────────────
  function populateForm(s) {
    const el = (id) => document.getElementById(id);

    const preset = el("cloak-preset");
    if (preset) preset.value = s.cloak;

    const customRow  = el("cloak-custom-row");
    const faviconRow = el("cloak-favicon-row");
    const isCustom   = s.cloak === "custom";
    if (customRow)  customRow.style.display  = isCustom ? "" : "none";
    if (faviconRow) faviconRow.style.display = isCustom ? "" : "none";

    const title   = el("cloak-custom-title");
    const favicon = el("cloak-custom-favicon");
    if (title)   title.value   = s.cloakTitle;
    if (favicon) favicon.value = s.cloakFavicon;

    const checks = {
      "fx-stars":     "fxStars",
      "fx-aurora":    "fxAurora",
      "fx-scanlines": "fxScanlines",
      "fx-cursor":    "fxCursor",
      "fx-vignette":  "fxVignette",
      "perf-mode-toggle": "perfMode",
      "panic-enabled":    "panicEnabled",
      "priv-history":     "saveHistory",
    };
    for (const [id, key] of Object.entries(checks)) {
      const cb = el(id);
      if (cb) cb.checked = s[key];
    }

    // Theme swatches
    document.querySelectorAll("#theme-picker .theme-swatch").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.theme === (s.theme || "veil"));
    });

    // Background
    const bgUrlInput = document.getElementById("bg-url");
    if (bgUrlInput) bgUrlInput.value = s.bgImage || "";
    document.querySelectorAll("#bg-gradient-picker .bg-swatch").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.gradient === (s.bgGradient || ""));
    });
  }

  // ── Wire controls ─────────────────────────────────────────────────────────
  function patch(obj) {
    const s = Object.assign(loadSettings(), obj);
    saveSettings(s);
    applySettings(s);
  }

  // Cloak preset
  document.getElementById("cloak-preset")?.addEventListener("change", function () {
    const isCustom = this.value === "custom";
    const customRow  = document.getElementById("cloak-custom-row");
    const faviconRow = document.getElementById("cloak-favicon-row");
    if (customRow)  customRow.style.display  = isCustom ? "" : "none";
    if (faviconRow) faviconRow.style.display = isCustom ? "" : "none";
    patch({ cloak: this.value });
  });

  document.getElementById("cloak-custom-title")?.addEventListener("input", function () {
    patch({ cloakTitle: this.value });
  });
  document.getElementById("cloak-custom-favicon")?.addEventListener("input", function () {
    patch({ cloakFavicon: this.value });
  });

  // Toggle checkboxes — use event delegation so late-added checkboxes are covered
  const TOGGLE_MAP = {
    "fx-stars":         "fxStars",
    "fx-aurora":        "fxAurora",
    "fx-scanlines":     "fxScanlines",
    "fx-cursor":        "fxCursor",
    "fx-vignette":      "fxVignette",
    "perf-mode-toggle": "perfMode",
    "panic-enabled":    "panicEnabled",
    "priv-history":     "saveHistory",
  };
  panel?.addEventListener("change", function (e) {
    const cb = e.target;
    if (cb.type !== "checkbox") return;
    if (Object.prototype.hasOwnProperty.call(TOGGLE_MAP, cb.id)) {
      patch({ [TOGGLE_MAP[cb.id]]: cb.checked });
    }
  });

  // Clear history
  document.getElementById("btn-clear-history")?.addEventListener("click", function () {
    localStorage.removeItem("veil_history_v1");
    this.textContent = "Cleared!";
    setTimeout(() => { this.textContent = "Clear History"; }, 1500);
  });

  // Clear bookmarks
  document.getElementById("btn-clear-bookmarks")?.addEventListener("click", function () {
    localStorage.removeItem("veil_bookmarks_v1");
    window._veilRenderGrid?.();
    this.textContent = "Cleared!";
    setTimeout(() => { this.textContent = "Clear Bookmarks"; }, 1500);
  });

  // Theme picker
  document.getElementById("theme-picker")?.addEventListener("click", function (e) {
    const btn = e.target.closest(".theme-swatch");
    if (!btn) return;
    patch({ theme: btn.dataset.theme });
    document.querySelectorAll("#theme-picker .theme-swatch").forEach((b) => {
      b.classList.toggle("active", b === btn);
    });
  });

  // Background image URL
  document.getElementById("bg-url")?.addEventListener("input", function () {
    const url = this.value.trim();
    // Picking a URL clears gradient selection
    patch({ bgImage: url, bgGradient: url ? "" : loadSettings().bgGradient });
    document.querySelectorAll("#bg-gradient-picker .bg-swatch").forEach((b) => {
      b.classList.toggle("active", url ? false : b.dataset.gradient === "");
    });
  });

  // Background gradient picker
  document.getElementById("bg-gradient-picker")?.addEventListener("click", function (e) {
    const btn = e.target.closest(".bg-swatch");
    if (!btn) return;
    const key = btn.dataset.gradient;
    // Picking a gradient clears the URL
    const bgUrlInput = document.getElementById("bg-url");
    if (bgUrlInput) bgUrlInput.value = "";
    patch({ bgGradient: key, bgImage: "" });
    document.querySelectorAll("#bg-gradient-picker .bg-swatch").forEach((b) => {
      b.classList.toggle("active", b === btn);
    });
  });

  // ── Init ──────────────────────────────────────────────────────────────────
  applySettings(loadSettings());
})();

// ── Ambassador token system ─────────────────────────────────────────────────
(function () {
  const AMBASSADOR_KEY = "veil_ambassador_v1";

  function loadAmbassador() {
    try { return JSON.parse(localStorage.getItem(AMBASSADOR_KEY) || "null"); }
    catch { return null; }
  }

  function saveAmbassador(data) {
    localStorage.setItem(AMBASSADOR_KEY, JSON.stringify(data));
  }

  function clearAmbassador() {
    localStorage.removeItem(AMBASSADOR_KEY);
  }

  // Ambassador-exclusive theme/gradient/cloak IDs
  const AMB_THEMES   = ["aura", "crimson", "gold"];
  const AMB_CLOAKS   = ["youtube", "spotify", "discord", "roblox"];
  const AMB_GRADS    = ["blaze", "neon"];

  function applyAmbassador(data) {
    const verifiedEl = document.getElementById("ambassador-verified");
    const formEl     = document.getElementById("ambassador-form");
    const revokeRow  = document.getElementById("ambassador-revoke-row");
    const nameEl     = document.getElementById("ambassador-name");
    const homeStar   = document.getElementById("ambassador-home-star");

    if (data) {
      if (verifiedEl) verifiedEl.style.display = "";
      if (formEl)     formEl.style.display     = "none";
      if (revokeRow)  revokeRow.style.display  = "";
      if (nameEl)     nameEl.textContent        = data.username;
      if (homeStar)   homeStar.style.display    = "";

      // Unlock exclusive theme swatches
      AMB_THEMES.forEach((t) => {
        const el = document.querySelector(`.theme-swatch[data-theme="${t}"]`);
        if (!el) return;
        el.disabled    = false;
        el.textContent = "";
        el.title       = `${t.charAt(0).toUpperCase() + t.slice(1)} (Ambassador)`;
        el.classList.remove("theme-swatch--locked");
      });

      // Unlock exclusive cloak options
      AMB_CLOAKS.forEach((c) => {
        const el = document.getElementById(`cloak-opt-${c}`);
        if (!el) return;
        el.disabled     = false;
        el.textContent  = el.textContent.replace("🔒 ", "⭐ ");
      });

      // Unlock exclusive gradient swatches
      AMB_GRADS.forEach((g) => {
        const el = document.querySelector(`.bg-swatch[data-gradient="${g}"]`);
        if (!el) return;
        el.disabled    = false;
        el.textContent = "";
        el.title       = `${g.charAt(0).toUpperCase() + g.slice(1)} (Ambassador)`;
        el.classList.remove("bg-swatch--locked");
      });

      // Unlock about:blank cloak
      const blankBtn  = document.getElementById("blank-cloak-btn");
      const blankAuto = document.getElementById("blank-cloak-auto");
      const blankLock = document.getElementById("blank-cloak-lock");
      if (blankBtn)  { blankBtn.disabled = false; blankBtn.textContent = "Open"; }
      if (blankAuto) blankAuto.disabled = false;
      if (blankLock) blankLock.style.display = "none";
    } else {
      if (verifiedEl) verifiedEl.style.display = "none";
      if (formEl)     formEl.style.display     = "";
      if (revokeRow)  revokeRow.style.display  = "none";
      if (homeStar)   homeStar.style.display   = "none";

      // Re-lock exclusive theme swatches
      AMB_THEMES.forEach((t) => {
        const el = document.querySelector(`.theme-swatch[data-theme="${t}"]`);
        if (!el) return;
        el.disabled    = true;
        el.textContent = "🔒";
        el.title       = `${t.charAt(0).toUpperCase() + t.slice(1)} (Ambassador only)`;
        el.classList.add("theme-swatch--locked");
      });

      // Re-lock exclusive cloak options
      AMB_CLOAKS.forEach((c) => {
        const el = document.getElementById(`cloak-opt-${c}`);
        if (!el) return;
        el.disabled    = true;
        el.textContent = el.textContent.replace("⭐ ", "🔒 ");
      });

      // Re-lock exclusive gradient swatches
      AMB_GRADS.forEach((g) => {
        const el = document.querySelector(`.bg-swatch[data-gradient="${g}"]`);
        if (!el) return;
        el.disabled    = true;
        el.textContent = "🔒";
        el.title       = `${g.charAt(0).toUpperCase() + g.slice(1)} (Ambassador only)`;
        el.classList.add("bg-swatch--locked");
      });

      // Re-lock about:blank cloak
      const blankBtn  = document.getElementById("blank-cloak-btn");
      const blankAuto = document.getElementById("blank-cloak-auto");
      const blankLock = document.getElementById("blank-cloak-lock");
      if (blankBtn)  { blankBtn.disabled = true; blankBtn.textContent = "🔒 Ambassador"; }
      if (blankAuto) blankAuto.disabled = true;
      if (blankLock) blankLock.style.display = "";

      // Revert any locked theme/gradient that was active
      const activeTheme = document.documentElement.dataset.theme;
      if (AMB_THEMES.includes(activeTheme)) {
        const s = Object.assign({}, JSON.parse(localStorage.getItem("veil_settings_v1") || "{}"), { theme: "veil" });
        localStorage.setItem("veil_settings_v1", JSON.stringify(s));
        delete document.documentElement.dataset.theme;
      }
    }
  }

  // ── Leaderboard ──────────────────────────────────────────────────────────
  const RANK_ICONS = ["🥇", "🥈", "🥉"];

  async function renderLeaderboard() {
    const el = document.getElementById("leaderboard-list");
    if (!el) return;

    let board;
    try {
      const res = await fetch("/api/leaderboard");
      if (!res.ok) throw new Error();
      board = await res.json();
    } catch {
      el.innerHTML = `<div class="lb-empty">Could not load leaderboard.</div>`;
      return;
    }

    if (!board.length) {
      el.innerHTML = `<div class="lb-empty">No ambassadors yet — be the first!</div>`;
      return;
    }

    const myUsername = loadAmbassador()?.username ?? null;
    el.innerHTML = "";
    for (const entry of board) {
      const row = document.createElement("div");
      const isMe = myUsername && entry.username === myUsername;
      row.className = "lb-entry" + (isMe ? " lb-entry--me" : "");

      const rankEl = document.createElement("span");
      rankEl.className = "lb-rank";
      rankEl.textContent = RANK_ICONS[entry.rank - 1] ?? `${entry.rank}.`;

      const nameEl = document.createElement("span");
      nameEl.className = "lb-name";
      nameEl.textContent = entry.username + (isMe ? " (you)" : "");

      const ptsEl = document.createElement("span");
      ptsEl.className = "lb-pts";
      ptsEl.textContent = `${entry.points} pts`;

      row.appendChild(rankEl);
      row.appendChild(nameEl);
      row.appendChild(ptsEl);
      el.appendChild(row);
    }
  }

  // Expose so the settings open handler can refresh it
  window._veilLoadLeaderboard = renderLeaderboard;

  // ── Beta feature system ──────────────────────────────────────────────────
  // Features in beta-features.json are ambassador-only until their betaDays
  // window expires, then they unlock for everyone automatically.

  function _betaApplyEl(type, key, label, unlocked, daysLeft) {
    if (type === "theme") {
      const el = document.querySelector(`.theme-swatch[data-theme="${key}"]`);
      if (!el) return;
      el.disabled    = !unlocked;
      el.textContent = unlocked ? "" : "🔒";
      el.title       = unlocked
        ? `${label} (Early Access — ${daysLeft}d left)`
        : `${label} (Ambassador only — ${daysLeft} days left in early access)`;
      el.classList.toggle("theme-swatch--locked", !unlocked);
    } else if (type === "gradient") {
      const el = document.querySelector(`.bg-swatch[data-gradient="${key}"]`);
      if (!el) return;
      el.disabled    = !unlocked;
      el.textContent = unlocked ? "" : "🔒";
      el.title       = unlocked
        ? `${label} (Early Access — ${daysLeft}d left)`
        : `${label} (Ambassador only — ${daysLeft} days left in early access)`;
      el.classList.toggle("bg-swatch--locked", !unlocked);
    } else if (type === "cloak") {
      const el = document.getElementById(`cloak-opt-${key}`);
      if (!el) return;
      el.disabled    = !unlocked;
      el.textContent = `${unlocked ? "⭐" : "🔒"} ${label}`;
    }
  }

  function _betaUnlockEl(type, key, label) {
    if (type === "theme") {
      const el = document.querySelector(`.theme-swatch[data-theme="${key}"]`);
      if (!el) return;
      el.disabled    = false;
      el.textContent = "";
      el.title       = label;
      el.classList.remove("theme-swatch--locked");
    } else if (type === "gradient") {
      const el = document.querySelector(`.bg-swatch[data-gradient="${key}"]`);
      if (!el) return;
      el.disabled    = false;
      el.textContent = "";
      el.title       = label;
      el.classList.remove("bg-swatch--locked");
    } else if (type === "cloak") {
      const el = document.getElementById(`cloak-opt-${key}`);
      if (!el) return;
      el.disabled    = false;
      el.textContent = label;
    }
  }

  async function applyBetaFeatures() {
    let features;
    try {
      const res = await fetch("/api/beta-features");
      if (!res.ok) return;
      features = await res.json();
    } catch { return; }
    if (!Array.isArray(features) || !features.length) return;

    const isAmbassador = loadAmbassador() != null;
    for (const f of features) {
      if (f.isBeta) {
        _betaApplyEl(f.type, f.key, f.label, isAmbassador, f.daysLeft);
      } else {
        _betaUnlockEl(f.type, f.key, f.label);
      }
    }
  }

  // Auto-redeem from URL param (?amb=TOKEN) — lets ambassadors bookmark a login link
  (async function autoRedeemFromUrl() {
    const params = new URLSearchParams(location.search);
    const token  = params.get("amb");
    if (!token || loadAmbassador()) return; // skip if no param or already logged in
    try {
      const res  = await fetch(`/api/verify-token?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (data.valid) {
        saveAmbassador({ token, username: data.username });
        // Clean the token from the URL without reloading
        const clean = new URL(location.href);
        clean.searchParams.delete("amb");
        history.replaceState(null, "", clean.toString());
      }
    } catch { /* silent fail */ }
    applyAmbassador(loadAmbassador());
    applyBetaFeatures();
    renderLeaderboard();
  })();

  // Apply on page load
  applyAmbassador(loadAmbassador());
  applyBetaFeatures();
  renderLeaderboard();

  // Guard: watch ambassador-gated elements and revert any unauthorized DOM changes
  (function guardAmbassador() {
    const selectors = [
      ...AMB_THEMES.map(t => `.theme-swatch[data-theme="${t}"]`),
      ...AMB_GRADS.map(g => `.bg-swatch[data-gradient="${g}"]`),
      ...AMB_CLOAKS.map(c => `#cloak-opt-${c}`),
      "#ambassador-verified", "#ambassador-revoke-row", "#ambassador-home-star", "#ambassador-form",
      "#blank-cloak-btn", "#blank-cloak-auto",
    ];
    const revert = () => applyAmbassador(loadAmbassador());
    const observer = new MutationObserver((mutations) => {
      if (loadAmbassador()) return; // legitimately unlocked, allow changes
      for (const m of mutations) {
        const el = m.target;
        const matched = selectors.some(sel => el.matches?.(sel));
        if (matched) { observer.disconnect(); revert(); observe(); return; }
      }
    });
    const observe = () => {
      selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          observer.observe(el, { attributes: true, attributeFilter: ["disabled", "class", "style"] });
        });
      });
    };
    observe();
  })();

  // Redeem button
  document.getElementById("ambassador-redeem-btn")?.addEventListener("click", async function () {
    const input   = document.getElementById("ambassador-token-input");
    const errorEl = document.getElementById("ambassador-error");
    const token   = input?.value.trim();
    if (!token) return;

    this.disabled    = true;
    this.textContent = "Checking…";
    if (errorEl) errorEl.style.display = "none";

    try {
      const res  = await fetch(`/api/verify-token?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (data.valid) {
        saveAmbassador({ token, username: data.username });
        applyAmbassador({ token, username: data.username });
        applyBetaFeatures();
        renderLeaderboard();
        if (input) input.value = "";
      } else {
        if (errorEl) { errorEl.textContent = "Invalid token. Ask staff to run /approve-ad for you."; errorEl.style.display = ""; }
      }
    } catch {
      if (errorEl) { errorEl.textContent = "Could not reach the server. Try again."; errorEl.style.display = ""; }
    } finally {
      this.disabled    = false;
      this.textContent = "Redeem";
    }
  });

  // Copy login link button
  document.getElementById("ambassador-copy-link-btn")?.addEventListener("click", function () {
    const data = loadAmbassador();
    if (!data) return;
    const url = new URL(location.href);
    url.search = "";
    url.searchParams.set("amb", data.token);
    navigator.clipboard.writeText(url.toString()).then(() => {
      const orig = this.textContent;
      this.textContent = "Copied!";
      setTimeout(() => { this.textContent = orig; }, 2000);
    });
  });

  // Revoke button
  document.getElementById("ambassador-revoke-btn")?.addEventListener("click", function () {
    clearAmbassador();
    applyAmbassador(null);
    applyBetaFeatures();
    renderLeaderboard();
  });
})();
